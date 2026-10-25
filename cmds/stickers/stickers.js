import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import exif from '../../lib/exif.js';
import db from '#db';

const { writeExif } = exif;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isStickerUrl = (url) => {
  return /^(https?:\/\/)?(www\.)?sticker\.ly\/s\/[a-zA-Z0-9]+$/i.test(url);
};

const getApiConfig = () => {
  const url = global.APIs?.evogb?.url || 'https://api.evogb.org';
  const key = global.APIs?.evogb?.key;
  if (!key) throw new Error('Falta global.APIs.evogb.key en settings.js');
  return { url, key };
};

const searchPacks = async (query, attempt = 1) => {
  try {
    const { url, key } = getApiConfig();
    const { data } = await axios.get(`${url}/stickerly/search`, { params: { query, key }, timeout: 10000 });
    return data;
  } catch (e) {
    if (e.response?.status === 429 && attempt <= 3) {
      await delay((e.response.headers['retry-after'] || 5) * 1000);
      return searchPacks(query, attempt + 1);
    }
    throw e;
  }
};

const downloadPack = async (urlSticker, attempt = 1) => {
  try {
    const { url, key } = getApiConfig();
    const { data } = await axios.get(`${url}/stickerly/detail`, { params: { url: urlSticker, key }, timeout: 10000 });
    return data;
  } catch (e) {
    if (e.response?.status === 429 && attempt <= 3) {
      await delay((e.response.headers['retry-after'] || 5) * 1000);
      return downloadPack(urlSticker, attempt + 1);
    }
    if (e.response?.status === 500) return { status: false, error: 500 };
    throw e;
  }
};

const filterRelevantPacks = (packs, query) => {
  const searchTerm = query.toLowerCase().trim();
  if (!searchTerm) return packs;
  return packs.filter(pack => (pack.name || '').toLowerCase().includes(searchTerm));
};

const processStickerBuffer = async (buffer) => {
  const tmpDir = './tmp';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tmpIn = path.join(tmpDir, `spack-in-${Date.now()}-${Math.floor(Math.random() * 1000)}.img`);
  const tmpOut = path.join(tmpDir, `spack-out-${Date.now()}-${Math.floor(Math.random() * 1000)}.webp`);

  fs.writeFileSync(tmpIn, buffer);

  const vf = `scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;
  const ffmpegArgs = ['-y', '-i', tmpIn, '-vf', vf, '-an', '-fps_mode', 'passthrough', '-c:v', 'libwebp_anim', '-preset', 'picture', '-compression_level', '6', '-q:v', '70', '-loop', '0', tmpOut];

  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => err += d.toString());
    p.on('close', (code) => {
      if (code === 0) resolve(); else reject(new Error(err));
    });
  });

  const webpBuffer = fs.readFileSync(tmpOut);
  fs.unlinkSync(tmpIn);
  fs.unlinkSync(tmpOut);
  return webpBuffer;
};

export default {
  command: ['stickerpack', 'spack', 'stickers'],
  category: 'stickers',
  description: 'Buscar y descargar packs de stickers.',
  run: async ({ msg, sock, args, text, usedPrefix, command }) => {
    try {
      if (!text) return sock.reply(msg.chat, `《✧》 Ingresa un texto para buscar packs de stickers o una URL de sticker.ly.`, msg);

      await msg.react('🕑');

      const name = db.getUser(msg.sender)?.name || msg.sender.split('@')[0];
      let packData;
      const stickerMatch = text.match(/(?:sticker\.ly\/s\/)([a-zA-Z0-9]+)(?:\s|$)/);
      const url = stickerMatch? 'https://sticker.ly/s/' + stickerMatch[1] : (isStickerUrl(text)? text : null);

      if (url) {
        let detail = await downloadPack(url);
        const detalles = detail.detalles || detail.result;
        if (!detail ||!detail.status || detail.error === 500) {
          return sock.reply(msg.chat, `《✧》 El pack de la URL no está disponible o es privado.`, msg);
        }
        if (!detalles) return sock.reply(msg.chat, `《✧》 No se pudo obtener el pack desde la URL.`, msg);
        packData = detalles;
      } else {
        const search = await searchPacks(text);
        const resultados = search.resultados || search.result || [];
        if (!search.status ||!resultados?.length) {
          return sock.reply(msg.chat, `《✧》 No se encontraron packs para *${text}*.`, msg);
        }

        const relevantPacks = filterRelevantPacks(resultados, text);
        let packsToTry = relevantPacks.length > 0? relevantPacks : resultados;
        let detail = null;
        let intentos = 0;
        const maxIntentos = Math.min(packsToTry.length, 5);
        const indices = [...Array(packsToTry.length).keys()];

        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        while (intentos < maxIntentos &&!detail) {
          const index = indices[intentos];
          const res = await downloadPack(packsToTry[index].url);
          const resDetail = res?.detalles || res?.result;
          if (res?.status && resDetail?.stickers?.length > 0) {
            detail = resDetail;
            break;
          }
          intentos++;
        }

        if (!detail) {
          return sock.reply(msg.chat, `《✧》 No se pudo descargar ningún pack válido.`, msg);
        }
        packData = detail;
      }

      const { name: packName, author, stickers } = packData;
      if (!stickers?.length) {
        return sock.reply(msg.chat, `《✧》 El pack no contiene stickers válidos.`, msg);
      }

      const MAX_STICKERS = 20;
      const selectedStickers = stickers.slice(0, MAX_STICKERS);
      const publisherName = author?.name || author?.username || `@${name}`;

      const stickerResults = [];

      for (let s of selectedStickers) {
        try {
          const imgUrl = s.imageUrl || s.url || s.image_url;
          if (!imgUrl ||!String(imgUrl).startsWith('http')) continue;

          const res = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
          let rawBuffer = Buffer.from(res.data);
          let baseWebp = await processStickerBuffer(rawBuffer);

          const media = { mimetype: 'webp', data: baseWebp };
          const metadata = { packname: packName, author: publisherName, categories: ['🎭'] };
          const exifPath = await writeExif(media, metadata);

          const finalWebpBuffer = fs.readFileSync(exifPath);
          fs.unlinkSync(exifPath);

          stickerResults.push({
            sticker: finalWebpBuffer,
            isAnimated: s.isAnimated || false,
            isLottie: false,
            emojis: ['🎭']
          });
        } catch {
          continue;
        }
      }

      if (!stickerResults.length) {
        return sock.reply(msg.chat, `《✧》 No se pudieron procesar los stickers del pack.`, msg);
      }

      await sock.sendMessage(msg.chat, {
        stickerPack: {
          name: String(packName).slice(0, 35),
          publisher: String(publisherName).slice(0, 35),
          description: 'Elaina 💜',
          cover: stickerResults[0]?.sticker || null,
          stickers: stickerResults
        }
      }, { quoted: msg });

      await msg.react('📪');

    } catch (e) {
      await msg.react('✖️');
      return msg.reply(`> Error al procesar el comando.\n> Detalles: *${e.message}*`);
    }
  }
};