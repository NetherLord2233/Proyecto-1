import axios from 'axios';
import fs from 'fs';
import db from '#db';

export default {
  command: ['qc'],
  category: 'stickers',
  description: 'Crear un sticker con texto estilo quote.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      let textFinal = args.join(' ') || msg.quoted?.text;
      if (!textFinal) {
        return msg.reply(`《✧》 Ingresa un texto para crear el sticker.`);
      }

      let target = msg.quoted ? msg.quoted.sender : msg.sender;
      let pp = 'https://telegra.ph/file/24fa902ead26340f3df2c.png';
      try {
        const fetchedPp = await sock.profilePictureUrl(target, 'image');
        if (fetchedPp) pp = fetchedPp;
      } catch {}

      let userGlobal = db.getUser ? db.getUser(target) : (db.data?.users?.[target] || {});
      const nombre = userGlobal?.name || msg.pushName || target.split('@')[0];

      if (textFinal.length > 80) {
        await msg.react('✖️');
        return msg.reply(`《✧》 El texto no puede tener más de 80 caracteres.`);
      }

      await msg.react('🕒');

      const quoteObj = {
        type: 'quote',
        format: 'png',
        backgroundColor: '#000000',
        width: 512,
        height: 768,
        scale: 2,
        messages: [
          {
            entities: [],
            avatar: true,
            from: {
              id: 1,
              name: nombre,
              photo: { url: pp }
            },
            text: textFinal,
            replyMessage: {}
          }
        ]
      };

      let buffer = null;

      try {
        const res = await axios.post('https://bot.lyo.su/quote/generate', quoteObj, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        if (res.data?.result?.image) {
          buffer = Buffer.from(res.data.result.image, 'base64');
        }
      } catch {}

      if (!buffer) {
        try {
          const res2 = await axios.post('https://qc.botcahx.eu.org/generate', quoteObj, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          if (res2.data?.result?.image) {
            buffer = Buffer.from(res2.data.result.image, 'base64');
          }
        } catch {}
      }

      if (!buffer) {
        try {
          const res3 = await axios.post('https://quote-api.vercel.app/generate', quoteObj, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          if (res3.data?.result?.image) {
            buffer = Buffer.from(res3.data.result.image, 'base64');
          }
        } catch {}
      }

      if (!buffer) {
        throw new Error('Servidor de Quote no disponible temporalmente.');
      }

      let user = db.getUser ? db.getUser(msg.sender) : (db.data?.users?.[msg.sender] || {});
      const name = user.name || msg.sender.split('@')[0];
      const meta1 = user.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user.metadatos2 ? String(user.metadatos2).trim() : '';
      let texto1 = meta1 ? meta1 : 'Elaina 💜';
      let texto2 = meta1 ? (meta2 ? meta2 : '') : `@${name}`;

      const tmpFile = `./tmp/qc-${Date.now()}.png`;
      fs.writeFileSync(tmpFile, buffer);

      if (typeof sock.sendImageAsSticker === 'function') {
        await sock.sendImageAsSticker(msg.chat, tmpFile, msg, { packname: texto1, author: texto2 });
      } else {
        await sock.sendMessage(msg.chat, { sticker: buffer }, { quoted: msg });
      }

      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      await msg.react('✔️');

    } catch (e) {
      await msg.react('✖️');
      return msg.reply(`> Ocurrió un error al ejecutar el comando *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
        
