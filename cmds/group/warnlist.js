import db from '#db';

export default {
  command: ['warnlist', 'listwarns'],
  category: 'group',
  description: 'Ver la lista de todos los usuarios con advertencias en el grupo.',
  isAdmin: true,
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      const allChatUsers = (db.getChatUser ? db.getChatUser(msg.chat) : []) || [];
      const warnedUsers = [];

      for (const user of allChatUsers) {
        if (!user || !user.user_id) continue;
        let warnings = user.warnings;
        if (typeof warnings === 'string') {
          try {
            warnings = JSON.parse(warnings);
          } catch {
            warnings = [];
          }
        }
        if (Array.isArray(warnings) && warnings.length > 0) {
          warnedUsers.push({
            userId: user.user_id,
            count: warnings.length
          });
        }
      }

      if (warnedUsers.length === 0) {
        return sock.reply(msg.chat, '《✧》 No hay usuarios con advertencias registradas en este grupo.', msg);
      }

      warnedUsers.sort((a, b) => b.count - a.count);

      const listText = warnedUsers.map((u, i) => {
        const index = i + 1;
        const tag = `@${u.userId.split('@')[0]}`;
        return `\`#${index}\` » ${tag} — *${u.count}* ${u.count === 1 ? 'advertencia' : 'advertencias'}`;
      }).join('\n');

      const mentions = warnedUsers.map(u => u.userId);

      await sock.reply(msg.chat, `✐ *Lista de usuarios advertidos en el grupo:*\n\n${listText}`, msg, { mentions });
    } catch (e) {
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  },
};
