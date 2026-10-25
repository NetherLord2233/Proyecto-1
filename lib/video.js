import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas } from '@napi-rs/canvas';

export async function crearVideo({ ancho, alto, fps, cuadros, dibujar, limiteMs = 20000 }) {
  const salida = path.join(os.tmpdir(), `video_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  const ff = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${ancho}x${alto}`, '-r', String(fps), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', salida,
  ]);
  let errores = '';
  ff.stderr.on('data', (d) => { errores += d; });
  ff.stdin.on('error', () => {});
  const terminado = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`ffmpeg falló: ${errores.slice(0,400)}`))));
  });
  let cancelado = false;
  const reloj = setTimeout(() => { cancelado = true; ff.kill('SIGKILL'); }, limiteMs);
  const canvas = createCanvas(ancho, alto);
  const ctx = canvas.getContext('2d');
  try {
    for (let i = 0; i < cuadros; i++) {
      if (cancelado) throw new Error('El video tardó demasiado');
      dibujar(ctx, i);
      const { data } = ctx.getImageData(0, 0, ancho, alto);
      const pixeles = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      if (!ff.stdin.write(pixeles)) {
        await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), terminado]);
      }
    }
    ff.stdin.end();
    await terminado;
    return fs.readFileSync(salida);
  } catch (err) {
    ff.kill('SIGKILL');
    await terminado.catch(() => {});
    throw err;
  } finally {
    clearTimeout(reloj);
    fs.rmSync(salida, { force: true });
  }
}