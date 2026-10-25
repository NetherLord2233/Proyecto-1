import db from '#db';

export default {
  command: ['bot'],
  category: 'group',
  description: 'Activar o desactivar el bot en el grupo.',
  isAdmin: true,
  run: async ({ msg, sock, args, isOwner }) => {
    const chat = db.getChat(msg.chat);
    const botId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
    const isSocket = msg.sender === botId || msg.key.fromMe;
    const botSettings = db.getSettings(botId) || {};
    const namebot = botSettings.namebot || 'Bot';

    const estado = chat.isBanned ? 1 : 0;

    if (estado && !isOwner && !isSocket) return;

    if (args[0] === 'off') {
      if (estado) return msg.reply('《✧》 El *Bot* ya estaba *desactivado* en este grupo.');

      chat.isBanned = 1;
      db.updateChat(msg.chat, 'isBanned', 1);

      return msg.reply(`《✧》 Has *Desactivado* a *${namebot}* en este grupo.\n> A partir de ahora solo los *Owners* pueden reactivarlo.`);
    }

    if (args[0] === 'on') {
      if (!estado) return msg.reply(`《✧》 *${namebot}* ya estaba *activado* en este grupo.`);

      chat.isBanned = 0;
      db.updateChat(msg.chat, 'isBanned', 0);

      return msg.reply(`《✧》 Has *Activado* a *${namebot}* en este grupo.`);
    }

    return msg.reply(`*✿ Estado de ${namebot} (｡•́‿•̀｡)*\n✐ *Actual ›* ${estado ? '✗ Desactivado' : '✓ Activado'}\n\n✎ Puedes cambiarlo con:\n> ● _Activar ›_ *bot on*\n> ● _Desactivar ›_ *bot off*`);
  },
};