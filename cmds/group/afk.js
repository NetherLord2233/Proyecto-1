import db from '#db';
export default {
  command: ['afk'],
  category: 'profile',
  description: 'Activar el modo ausente (AFK).',
  run: async ({ msg, sock, args }) => {
    db.updateChatUser(msg.chat, msg.sender, 'afk', Date.now());
    db.updateChatUser(msg.chat, msg.sender, 'afkReason', args.join(' '));    
    const userData = db.getUser(msg.sender);
    const nombre = userData?.name || 'Usuario';
    const motivo = args.length ? `${args.join(' ')}` : 'Sin Especificar!';    
    return await sock.reply(msg.chat, `ꕥ El Usuario *${nombre}* estará AFK.
> ○ Motivo » *${motivo}*`, msg);
  }
};
