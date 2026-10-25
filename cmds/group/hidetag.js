import { sendHidetag } from '../../lib/hidetag.js';

export default {
  command: ['hidetag', 'tag'],
  category: 'group',
  description: 'Enviar un mensaje mencionando a todos los usuarios del grupo.',
  isAdmin: true,
  run: async ({ msg, sock, args, usedPrefix, command, participants }) => {
    const userText = args.join(' ').trim();
    const isQuoted = Boolean(msg.quoted);
    const src = msg.quoted || msg;
    const fallbackText = isQuoted ? (src.caption || src.text || src.body || '').trim() : '';
    try {
      const sent = await sendHidetag(sock, msg.chat, participants, { text: userText, src, fallbackText });
      if (!sent) return msg.reply('《✧》 *Ingresa* un texto o *responde* a uno');
    } catch (e) {
      return msg.reply(`> Ocurrió un error inesperado al ejecutar el comando *${usedPrefix + command}*. Intenta de nuevo o contacta a soporte si el problema persiste.\n> [Error: *${e.message}*]`);
    }
  },
};
