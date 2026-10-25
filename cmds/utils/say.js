export default {
  command: ['say', 'decir'],
  category: 'utils',
  description: 'Repetir un mensaje como el bot.',
  run: async ({ msg, sock, args, usedPrefix, command, text }) => {
    const groupMetadata = msg.isGroup ? await sock.groupMetadata(msg.chat).catch(() => null) : null;
    const groupParticipants = groupMetadata?.participants || [];
    const allMentions = groupParticipants.map(p => p.id).filter(Boolean);
    const userText = (args.join(' ') || '').trim();
    const isQuoted = Boolean(msg.quoted);
    const src = msg.quoted || msg;
    const hasImage = Boolean(src.message?.imageMessage || src.mtype === 'imageMessage');
    const hasVideo = Boolean(src.message?.videoMessage || src.mtype === 'videoMessage');
    const hasAudio = Boolean(src.message?.audioMessage || src.mtype === 'audioMessage');
    const hasSticker = Boolean(src.message?.stickerMessage || src.mtype === 'stickerMessage');

    // Solo extrae texto original si realmente proviene de un mensaje citado
    const originalText = isQuoted ? (msg.quoted.caption || msg.quoted.text || msg.quoted.body || '').trim() : '';
    
    let rawText = (userText || originalText || '').trim();
    
    const textToCheck = rawText.replace(/^[\p{L}\p{N}]*[\p{P}\p{S}]+\s*/u, '').trim();

    const explicitMentions = allMentions.filter(jid => textToCheck.includes(jid.split('@')[0]));
    try {
      const options = { quoted: null, mentions: explicitMentions.length ? explicitMentions : [] };
      if (hasImage || hasVideo) {
        const media = await src.download();
        if (hasImage) {
          return sock.sendMessage(msg.chat, { image: media, caption: textToCheck || '', ...options });
        } else {
          return sock.sendMessage(msg.chat, { video: media, mimetype: 'video/mp4', caption: textToCheck || '', ...options });
        }
      }
      if (hasAudio) {
        const media = await src.download();
        return sock.sendMessage(msg.chat, { audio: media, mimetype: 'audio/mp4', fileName: 'hidetag.mp3', ...options });
      }      
      if (hasSticker) {
        const media = await src.download();
        return sock.sendMessage(msg.chat, { sticker: media, ...options });
      }      
      if (textToCheck) {
        return sock.sendMessage(msg.chat, { text: textToCheck, ...options });
      }      

      return msg.reply('*ღゝ◡╹ )ノ* `Debes escribir algo para que yo lo repita`');
    } catch (e) {
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
};
