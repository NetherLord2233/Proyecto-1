import db from '#db';

export default {
  command: ['warns'],
  category: 'group',
  description: 'Ver las advertencias de un miembro o la lista general del grupo.',
  isAdmin: true,
  run: async ({ msg, sock, args }) => {
    if (args[0] === 'list') {
      const allChatUsers = db.getChatUser(msg.chat) || [];
      let warnedUsers = [];
      for (const u of allChatUsers) {
        let warnings = u.warnings;
        if (typeof warnings === 'string') {
          try { warnings = JSON.parse(warnings); } catch { warnings = []; }
        }
        if (Array.isArray(warnings) && warnings.length > 0) {
          warnedUsers.push({
            userId: u.user_id,
            count: warnings.length
          });
        }
      }
      if (warnedUsers.length === 0) {
        return sock.reply(msg.chat, '《✧》 No hay usuarios con advertencias registradas en este grupo.', msg);
      }
      warnedUsers.sort((a, b) => b.count - a.count);
      let listText = `✐ *Lista de usuarios con advertencias:*\n\n`;
      const mentions = [];
      warnedUsers.forEach((u, i) => {
        listText += `\`#${i + 1}\` » @${u.userId.split('@')[0]} ⟡ *${u.count}* ${u.count === 1 ? 'advertencia' : 'advertencias'}\n`;
        mentions.push(u.userId);
      });
      return sock.reply(msg.chat, listText.trim(), msg, { mentions });
    }

    const userId = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    if (!userId) {
      return msg.reply('《✧》 Menciona a un usuario, responde a su mensaje o usa `.warnlist` para ver la lista completa.');
    }
    db.setCreate('chat_users', [msg.chat, userId], 'warnings', []);
    let user = db.getChatUser(msg.chat, userId);
    let warnings = user.warnings;
    if (typeof warnings === 'string') {
      try { warnings = JSON.parse(warnings); } catch { warnings = []; }
    }
    const total = warnings?.length || 0;
    if (total === 0) {
      return sock.reply(msg.chat, `《✧》 @${userId.split('@')[0]} no tiene advertencias registradas.`, msg, { mentions: [userId] });
    }
    const userGlobal = db.getUser(userId);
    const name = userGlobal?.name || 'Usuario';
    const warningList = warnings.map((w, i) => {
      const index = total - i;
      const author = w.by ? `\n> » Por: @${w.by.split('@')[0]}` : '';
      return `\`#${index}\` » ${w.reason}\n> » Fecha: ${w.timestamp}${author}`;
    }).join('\n');
    const mentions = [userId, ...warnings.map(w => w.by).filter(Boolean)];
    await sock.reply(msg.chat, `✐ Advertencias de @${userId.split('@')[0]} (${name}):\n> ✧ Total de advertencias: \`${total}\`\n\n${warningList}`, msg, { mentions });
  },
};
