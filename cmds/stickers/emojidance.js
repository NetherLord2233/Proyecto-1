//creditos a gus
import axios from 'axios';

export default {
    command: ['emojidance', 'emojibaila', 'emojidancing'],
    category: 'stickers',
    description: 'Convierte un emoji en un sticker animado bailando.',
    run: async ({ sock, msg, args }) => {
        const chat = msg.chat;
        const emoji = args[0];

        if (!emoji) {
            return sock.sendMessage(chat, {
                text: `✿ Usa el comando así:\n● .emojidance 😁\n● .emojidance 😭`
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(chat, { react: { text: "💃", key: msg.key } });

            const api = `https://api-faa.my.id/faa/emojigerak?emoji=${encodeURIComponent(emoji)}`;

            const res = await axios.get(api, {
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const contentType = res.headers['content-type'] || "";
            let stickerBuffer;

            if (contentType.includes('application/json')) {
                const json = JSON.parse(Buffer.from(res.data).toString());
                const videoUrl = json.result || json.url || json.data;
                const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
                stickerBuffer = Buffer.from(videoRes.data);
            } else {
                stickerBuffer = Buffer.from(res.data);
            }

            await sock.sendMessage(chat, {
                sticker: stickerBuffer
            }, { quoted: msg });

            await sock.sendMessage(chat, { react: { text: "✅", key: msg.key } });

        } catch (e) {
            await sock.sendMessage(chat, {
                text: `❌ Ocurrió un error al procesar el emoji *${emoji}*.`
            }, { quoted: msg });
        }
    }
};
