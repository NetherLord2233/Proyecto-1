import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import db from '#db';

try {
  const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
  const installedPath = ffmpegInstaller?.default?.path || ffmpegInstaller?.path;
  if (installedPath) ffmpeg.setFfmpegPath(installedPath);
} catch {
  ffmpeg.setFfmpegPath('ffmpeg');
}

const LANGUAGES = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  fr: 'Francés',
  it: 'Italiano',
  de: 'Alemán',
  ja: 'Japonés',
  ko: 'Coreano',
  ru: 'Ruso',
  zh: 'Chino'
};

async function translateText(text, targetLang) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    if (res.data && res.data[0]) {
      return res.data[0].map((item) => item[0]).join('');
    }
    return text;
  } catch {
    return text;
  }
}

function generateWaveform() {
  const waveform = new Uint8Array(64);
  for (let i = 0; i < 64; i++) waveform[i] = Math.floor(Math.random() * 60) + 15;
  return waveform;
}

function getAtempoFilters(factor) {
  const filters = [];
  let current = factor;
  while (current < 0.5) {
    filters.push('atempo=0.5');
    current /= 0.5;
  }
  while (current > 2.0) {
    filters.push('atempo=2.0');
    current /= 2.0;
  }
  filters.push(`atempo=${current.toFixed(4)}`);
  return filters;
}

async function toPTT(buffer, pitchVal = 5, speedVal = 5) {
  const tmpIn = path.join('./tmp', `${Date.now()}_in.media`);
  const tmpOut = path.join('./tmp', `${Date.now()}_out.opus`);
  await fs.promises.mkdir('./tmp', { recursive: true }).catch(() => {});
  await fs.promises.writeFile(tmpIn, buffer);

  const f_p = pitchVal <= 5 ? 0.5 + (pitchVal / 5) * 0.5 : 1.0 + ((pitchVal - 5) / 5) * 0.8;
  const f_v = speedVal <= 5 ? 0.5 + (speedVal / 5) * 0.5 : 1.0 + ((speedVal - 5) / 15) * 3.0;

  const baseRate = 24000;
  const targetRate = Math.round(baseRate * f_p);
  const netSpeedFactor = f_v / f_p;

  const audioFilters = [
    `asetrate=${targetRate}`,
    ...getAtempoFilters(netSpeedFactor)
  ];

  return new Promise((resolve, reject) => {
    ffmpeg(tmpIn)
      .noVideo()
      .audioCodec('libopus')
      .audioChannels(1)
      .audioFrequency(48000)
      .audioFilters(audioFilters)
      .outputOptions(['-b:a 64k', '-avoid_negative_ts make_zero', '-map_metadata -1'])
      .format('ogg')
      .on('end', async () => {
        try {
          const outBuffer = await fs.promises.readFile(tmpOut);
          await fs.promises.unlink(tmpIn).catch(() => {});
          await fs.promises.unlink(tmpOut).catch(() => {});
          resolve(outBuffer);
        } catch (e) {
          reject(e);
        }
      })
      .on('error', async (err) => {
        await fs.promises.unlink(tmpIn).catch(() => {});
        await fs.promises.unlink(tmpOut).catch(() => {});
        reject(err);
      })
      .save(tmpOut);
  });
}

export default {
  command: ['voz', 'voice', 'pitch', 'tono', 'vel', 'velocidad', 'idioma', 'lang', 'language'],
  category: 'utils',
  description: 'Generar audio TTS con traducción automática al idioma configurado, tono y velocidad personalizados.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const user = db.getChatUser(msg.chat, msg.sender) || {};

    const currentPitch = typeof user.ttsPitch === 'number' ? user.ttsPitch : 5;
    const currentSpeed = typeof user.ttsSpeed === 'number' ? user.ttsSpeed : 5;
    const currentLang = user.ttsLang || 'es';

    const cmd = command.toLowerCase();

    if (['idioma', 'lang', 'language'].includes(cmd)) {
      if (!args[0]) {
        const langList = Object.entries(LANGUAGES)
          .map(([code, name]) => `• \`${code}\` -> ${name}`)
          .join('\n');

        const currentName = LANGUAGES[currentLang] ? ` (${LANGUAGES[currentLang]})` : '';

        return msg.reply(
          `🌐 *Configuración de Idioma (TTS)*\n\n` +
          `> Tu idioma actual es: *${currentLang}*${currentName}\n\n` +
          `_Para cambiarlo usa: *${usedPrefix + command} <código de idioma>*_\n` +
          `_Ejemplo: *${usedPrefix + command} en* (Inglés) o *${usedPrefix + command} ja* (Japonés)_\n\n` +
          `*Idiomas sugeridos:*\n${langList}`
        );
      }

      const selectedLang = args[0].toLowerCase().trim();
      if (!/^[a-z]{2}(-[a-z]{2,4})?$/i.test(selectedLang)) {
        return msg.reply('⚠️ Por favor ingresa un código de idioma válido (ej: `es`, `en`, `pt`, `fr`, `ja`, `de`).');
      }

      db.updateChatUser(msg.chat, msg.sender, 'ttsLang', selectedLang);
      const name = LANGUAGES[selectedLang] ? ` (${LANGUAGES[selectedLang]})` : '';
      return msg.reply(`✅ *Idioma guardado correctamente:* \`${selectedLang}\`${name}\n\n_Cualquier texto ingresado será traducido y narrado en este idioma._`);
    }

    if (['pitch', 'tono'].includes(cmd)) {
      if (!args[0]) {
        return msg.reply(`🎚️ *Configuración de Tono (Pitch)*\n\n> Tu tono actual es: *${currentPitch}* / 10\n\n_Para cambiarlo usa: *${usedPrefix + command} <0.0 a 10.0>*_\n_Ejemplo: *${usedPrefix + command} 2.5* (Grave) o *${usedPrefix + command} 8* (Agudo)_`);
      }

      const val = parseFloat(args[0].replace(',', '.'));
      if (isNaN(val) || val < 0 || val > 10) {
        return msg.reply('⚠️ Por favor ingresa un número válido entre *0* y *10* (ej: 3.5, 7, 5.0).');
      }

      db.updateChatUser(msg.chat, msg.sender, 'ttsPitch', val);
      return msg.reply(`✅ *Tono guardado correctamente:* \`${val}\` / 10\n\n_Valor original = 5.0_`);
    }

    if (['vel', 'velocidad'].includes(cmd)) {
      if (!args[0]) {
        return msg.reply(`⚡ *Configuración de Velocidad*\n\n> Tu velocidad actual es: *${currentSpeed}* / 20\n\n_Para cambiarla usa: *${usedPrefix + command} <0.0 a 20.0>*_\n_Ejemplo: *${usedPrefix + command} 3* (Lento), *${usedPrefix + command} 10* (2x) o *${usedPrefix + command} 20* (4x)_`);
      }

      const val = parseFloat(args[0].replace(',', '.'));
      if (isNaN(val) || val < 0 || val > 20) {
        return msg.reply('⚠️ Por favor ingresa un número válido entre *0* y *20* (ej: 2.1, 10, 20.0).');
      }

      db.updateChatUser(msg.chat, msg.sender, 'ttsSpeed', val);
      return msg.reply(`✅ *Velocidad guardada correctamente:* \`${val}\` / 20\n\n_Valor original = 5.0 (1x) | Máximo = 20 (4x)_`);
    }

    if (['voz', 'voice'].includes(cmd)) {
      const userText = (args.join(' ') || '').trim();
      const isQuoted = Boolean(msg.quoted);

      const originalText = isQuoted ? (msg.quoted.caption || msg.quoted.text || msg.quoted.body || '').trim() : '';
      const textToSpeak = (userText || originalText || '').trim();

      if (!textToSpeak) {
        const langName = LANGUAGES[currentLang] ? ` (${LANGUAGES[currentLang]})` : '';
        return msg.reply(`*ღゝ◡╹ )ノ* \`Escribe un texto o responde a un mensaje para convertirlo a voz.\`\n\n\n_Tus ajustes:_\n\`\`\`Idioma:\`\`\` *${currentLang}*${langName}\n\`\`\`Tono:\`\`\` *${currentPitch}*\n\`\`\`Velocidad:\`\`\` *${currentSpeed}*`);
      }

      if (textToSpeak.length > 500) {
        return msg.reply('《✧》 El texto es demasiado largo. Por favor ingresa un texto menor a 500 caracteres.');
      }

      try {
        const translatedText = await translateText(textToSpeak, currentLang);

        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(translatedText)}&tl=${encodeURIComponent(currentLang)}&client=tw-ob`;
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
          },
          responseType: 'arraybuffer',
          timeout: 8000
        });

        const rawBuffer = Buffer.from(res.data);
        const voiceBuffer = await toPTT(rawBuffer, currentPitch, currentSpeed);

        return sock.sendMessage(
          msg.chat,
          {
            audio: voiceBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            waveform: generateWaveform()
          },
          { quoted: msg }
        );
      } catch (e) {
        return msg.reply(`> Error al generar el audio de voz: *${e.message}*`);
      }
    }
  }
};
