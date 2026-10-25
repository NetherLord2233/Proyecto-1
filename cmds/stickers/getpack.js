import axios from 'axios';
import fs from 'fs';
import db from '#db';

export default {
  command: ['getpack', 'pack', 'stickerpack'],
  category: 'stickers',
  description: 'Descargar un paquete de stickers tuyo previamente guardado.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (!args.length) {
        return msg.reply('《✧》Especifica el nombre o término del paquete de stickers.');
      }

      const query = args.join(' ').trim();
      const queryLower = query.toLowerCase();      
      let pack = null;
      let packOwner = msg.sender;

      try {
        const stickerPackData = db.getStickersPack ? db.getStickersPack(msg.sender) : null;
        const myPacks = stickerPackData?.packs || stickerPackData || [];
        const packsList = Array.isArray(myPacks) ? myPacks : Object.values(myPacks);
        pack = packsList.find(p => p?.name?.toLowerCase() === queryLower);
      } catch {}

      if (!pack) {
        try {
          const allUsers = db.getStickersPack ? db.getStickersPack() : [];
          const usersList = Array.isArray(allUsers) ? allUsers : Object.values(allUsers);
          for (const userData of usersList) {
            const userPacks = userData?.packs ? (typeof userData.packs === 'string' ? JSON.parse(userData.packs) : userData.packs) : [];
            const publicPack = userPacks.find(p => p?.name?.toLowerCase() === queryLower && p?.spackpublic === 1);
            if (publicPack) {
              pack = publicPack;
              packOwner = userData.id || msg.sender;
              break;
            }
          }
        } catch {}
      }

      if (pack && Array.isArray(pack.stickers) && pack.stickers.length > 0) {
        const validStickers = pack.stickers.map(s => {
          try { return Buffer.from(s, 'base64'); } catch { return null; }
        }).filter(s => s && Buffer.isBuffer(s) && s.length > 0);

        if (validStickers.length > 0) {
          const selected = validStickers.slice(0, 50);
          const cover = selected[0];
          let packOwnerUser = null;
          try { packOwnerUser = db.getUser(packOwner); } catch {}
          const name = packOwnerUser?.name || packOwner.split('@')[0];
          const ownerMeta1 = packOwnerUser?.metadatos ? String(packOwnerUser.metadatos).trim() : '';
          const ownerMeta2 = packOwnerUser?.metadatos2 ? String(packOwnerUser.metadatos2).trim() : '';
          const stickerPackname = ownerMeta1 || pack.name;
          const stickerAuthor = ownerMeta1 ? (ownerMeta2 || '') : (pack.desc || '');

          const webp = await import('node-webpmux');
          const stickerResults = await Promise.all(selected.map(async (buffer) => {
            try {
              const img = new webp.default.Image();
              await img.load(buffer);
              const json = { 'sticker-pack-id': 'https://github.com/NetherLord2233/Proyecto-1', 'sticker-pack-name': stickerPackname, 'sticker-pack-publisher': stickerAuthor, emojis: ['🎭'] };
              const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
              const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
              const exif = Buffer.concat([exifAttr, jsonBuff]);
              exif.writeUIntLE(jsonBuff.length, 14, 4);
              img.exif = exif;
              const tmpOut = `./tmp/pack-sticker-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
              await img.save(tmpOut);
              const stickerBuf = fs.readFileSync(tmpOut);
              fs.unlinkSync(tmpOut);
              return { sticker: stickerBuf, isAnimated: false, isLottie: false, emojis: ['🎭'] };
            } catch {
              return { sticker: buffer, isAnimated: false, isLottie: false, emojis: ['🎭'] };
            }
          }));

          await msg.react('✔️');
          return await sock.sendMessage(msg.chat, { stickerPack: { name: pack.name, publisher: `${pack.author || 'Pack'} (${name})`, description: pack.desc || '', cover, stickers: stickerResults } }, { quoted: msg });
        }
      }

      const apiUrl = (global.APIs?.evogb?.url || 'https://api.evogb.org').replace(/\/$/, '');
      const apiKey = global.APIs?.evogb?.key || 'null';

      let searchData = null;
      try {
        const res = await axios.get(`${apiUrl}/stickerly/search`, {
          params: { key: apiKey, query, q: query },
          timeout: 15000
        });
        searchData = res.data;
      } catch {}

      if (!searchData) {
        try {
          const res = await axios.get(`${apiUrl}/stickerly`, {
            params: { key: apiKey, query, q: query },
            timeout: 15000
          });
          searchData = res.data;
        } catch {}
      }

      const items = searchData?.result || searchData?.data || searchData?.results || (Array.isArray(searchData) ? searchData : []);
      if (!Array.isArray(items) || items.length === 0) {
        return msg.reply('《✧》No se encontró un paquete con ese nombre ni en tus registros ni en Sticker.ly.');
      }

      const targetPack = items[0];
      const packId = targetPack.id || targetPack.packId || targetPack.url || targetPack.code;

      let detailData = null;
      try {
        const res = await axios.get(`${apiUrl}/stickerly/detail`, {
          params: { key: apiKey, id: packId, url: packId, packId: packId, code: packId },
          timeout: 15000
        });
        detailData = res.data;
      } catch {}

      const packDetails = detailData?.result || detailData?.data || detailData;
      const stickersList = packDetails?.stickers || targetPack?.stickers || [];

      if (!Array.isArray(stickersList) || stickersList.length === 0) {
        return msg.reply('《✧》No se pudieron obtener los stickers del paquete seleccionado.');
      }

      const downloadedStickers = [];
      for (const s of stickersList.slice(0, 50)) {
        try {
          const imgUrl = typeof s === 'string' ? s : (s.url || s.image || s.file);
          if (!imgUrl) continue;
          const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
          if (imgRes.data) downloadedStickers.push(Buffer.from(imgRes.data));
        } catch {}
      }

      if (downloadedStickers.length === 0) {
        return msg.reply('《✧》No se pudieron descargar las imágenes de los stickers.');
      }

      const cover = downloadedStickers[0];
      const webp = await import('node-webpmux');
      const stickerResults = await Promise.all(downloadedStickers.map(async (buffer) => {
        try {
          const img = new webp.default.Image();
          await img.load(buffer);
          const json = { 'sticker-pack-id': 'https://github.com/NetherLord2233/Proyecto-1', 'sticker-pack-name': packDetails?.title || targetPack?.title || query, 'sticker-pack-publisher': packDetails?.author || targetPack?.author || 'Sticker.ly', emojis: ['🎭'] };
          const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
          const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
          const exif = Buffer.concat([exifAttr, jsonBuff]);
          exif.writeUIntLE(jsonBuff.length, 14, 4);
          img.exif = exif;
          const tmpOut = `./tmp/pack-sticker-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
          await img.save(tmpOut);
          const stickerBuf = fs.readFileSync(tmpOut);
          fs.unlinkSync(tmpOut);
          return { sticker: stickerBuf, isAnimated: false, isLottie: false, emojis: ['🎭'] };
        } catch {
          return { sticker: buffer, isAnimated: false, isLottie: false, emojis: ['🎭'] };
        }
      }));

      await msg.react('✔️');
      await sock.sendMessage(msg.chat, { stickerPack: { name: packDetails?.title || targetPack?.title || query, publisher: packDetails?.author || targetPack?.author || 'Sticker.ly', description: packDetails?.description || targetPack?.description || '', cover, stickers: stickerResults } }, { quoted: msg });
    } catch (e) {
      await msg.react('✖️');
      msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
