import axios from 'axios';
import fs from 'fs';
import db from '#db';

export default {
  command: ['emojimix'],
  category: 'stickers',
  description: 'Mezclar dos emojis en un sticker.',
  run: async ({ msg, sock, args, usedPrefix, command, text }) => {
    try {
      if (!text) {
        return msg.reply(`《✧》 Ingresa 2 emojis para combinar.\n> Ejemplo: *${usedPrefix + command}* 👻+👀`);
      }

      const emojis = text.match(/\p{Extended_Pictographic}/gu);
      if (!emojis || emojis.length === 0) {
        return msg.reply(`《✧》 Ingresa 2 emojis para combinar.\n> Ejemplo: *${usedPrefix + command}* 👻+👀`);
      }

      let emoji1 = emojis[0];
      let emoji2 = emojis.length > 1 ? emojis[1] : emoji1;

      await msg.react('🕒');

      if (!db.data) db.data = {};
      if (!db.data.users) db.data.users = {};
      let user = db.getUser ? db.getUser(msg.sender) : (db.data.users[msg.sender] || {});
      
      const name = user.name || msg.sender.split('@')[0];
      const meta1 = user.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user.metadatos2 ? String(user.metadatos2).trim() : '';
      let texto1 = meta1 ? meta1 : 'Elaina 💜';
      let texto2 = meta1 ? (meta2 ? meta2 : '') : `@${name}`;

      const apiUrl = (global.APIs?.evogb?.url || 'https://api.evogb.org').replace(/\/$/, '');
      const apiKey = global.APIs?.evogb?.key || 'null';

      let imageBuffer = null;

      try {
        const res = await axios.get(`${apiUrl}/tools/emojimix`, {
          params: { key: apiKey, emoji1, emoji2 },
          responseType: 'arraybuffer',
          timeout: 15000
        });
        if (res.status === 200 && res.data) {
          imageBuffer = Buffer.from(res.data);
        }
      } catch {}

      if (!imageBuffer) {
        try {
          const res = await axios.get(`${apiUrl}/emojimix`, {
            params: { key: apiKey, emoji1, emoji2 },
            responseType: 'arraybuffer',
            timeout: 15000
          });
          if (res.status === 200 && res.data) {
            imageBuffer = Buffer.from(res.data);
          }
        } catch {}
      }

      if (!imageBuffer) {
        try {
          const altRes = await axios.get(`https://api.siputzx.my.id/api/tools/emojimix?emoji1=${encodeURIComponent(emoji1)}&emoji2=${encodeURIComponent(emoji2)}`, { responseType: 'arraybuffer' });
          if (altRes.data) imageBuffer = Buffer.from(altRes.data);
        } catch {}
      }

      if (!imageBuffer) {
        throw new Error('No se pudo generar el emojimix con la API.');
      }

      const tmpFile = `./tmp/emojimix-${Date.now()}.webp`;
      fs.writeFileSync(tmpFile, imageBuffer);
      
      await sock.sendImageAsSticker(msg.chat, tmpFile, msg, { packname: texto1, author: texto2 });
      fs.unlinkSync(tmpFile);
      
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      return msg.reply(`> Ocurrió un error al ejecutar el comando *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
