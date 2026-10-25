import fs from 'fs';
import path from 'path';
import fluent from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

fluent.setFfmpegPath(ffmpegInstaller.path);

const clean = (p) => {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
};

export default {
  command: ['tomp3', 'toaudio', 'tovn'],
  category: 'utils',
  description: 'Convierte cualquier video en audio.',
  run: async ({ sock, msg, args }) => {
    const q = msg.quoted ? msg.quoted : msg;
    const mime = (q.msg || q).mimetype || '';

    if (!/video/.test(mime) && !/audio/.test(mime)) {
      return msg.reply('《✧》 Responde a un *video* con audio');
    }

    let videoPath, audioPath;
    try {
      await msg.react('🕒');

      const mediaData = await q.download();
      if (!mediaData) return msg.reply('《✧》 No se pudo descargar el video');

      const tmpDir = path.resolve('./tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      const id = Date.now();
      videoPath = path.join(tmpDir, `${id}_video.mp4`);
      audioPath = path.join(tmpDir, `${id}_audio.mp3`);

      fs.writeFileSync(videoPath, mediaData);

      await new Promise((resolve, reject) => {
        fluent.ffprobe(videoPath, (err, metadata) => {
          if (err) return reject(err);
          const hasAudio = metadata.streams.some(s => s.codec_type === 'audio');
          if (!hasAudio) return reject(new Error('NO_AUDIO'));

          fluent(videoPath)
            .outputOptions('-vn')
            .audioCodec('libmp3lame')
            .audioQuality(2)
            .on('error', reject)
            .on('end', resolve)
            .save(audioPath);
        });
      });

      const asPtt = args.includes('ptt') || args.includes('vn');
      const audioBuffer = fs.readFileSync(audioPath);

      await sock.sendMessage(msg.chat, {
        audio: audioBuffer,
        mimetype: asPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
        ptt: asPtt,
      }, { quoted: msg });

      await msg.react('✔️');
    } catch (e) {
      console.error(e);
      if (e.message === 'NO_AUDIO') {
        await msg.reply('《✧》 Ese video no tiene audio, no puedo convertirlo a mp3');
      } else {
        await msg.reply(`> Error en tomp3: ${e.message}`);
      }
    } finally {
      clean(videoPath);
      clean(audioPath);
    }
  },
};