import db from '#db';

let proposals = {};

export default {
  command: ['marry', 'casarse'],
  category: 'profile',
  description: 'Casarte con alguien.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    const chatId = msg.chat;
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const proposer = msg.sender;
    const proposee = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    const proposerUser = db.getUser(proposer);
    const proposeeUser = db.getUser(proposee);
    if (!proposee) return sock.reply(msg.chat, `《✧》 Debes mencionar a alguien para aceptar o proponer matrimonio.\n> Ejemplo » *${usedPrefix + command}* @${idBot.split('@')[0]}`, msg, { mentions: [idBot] });
    if (proposer === proposee) return msg.reply(`《✧》 No puedes proponerte matrimonio a ti ${proposerUser.genre === 'Mujer' ? 'misma' : proposerUser.genre === 'Hombre' ? 'mismo' : 'mismx'}`);      
    if (!proposerUser || !proposeeUser) {
      return msg.reply('《✧》 Uno de los usuarios no está registrado en el bot.');
    }    
    if (proposerUser?.marry) {
      const partner = db.getUser(proposerUser.marry);
      return msg.reply(`《✧》 Ya estás ${partner.genre === 'Mujer' ? 'casada' : partner.genre === 'Hombre' ? 'casado' : 'casadx'} con *${partner?.name || 'alguien'}*.`);
    }    
    if (proposeeUser?.marry) {
      const partner = db.getUser(proposeeUser.marry);
      return msg.reply(`《✧》 *${proposeeUser.name || proposee.split('@')[0]}* ya está ${partner.genre === 'Mujer' ? 'casada' : partner.genre === 'Hombre' ? 'casado' : 'casadx'} con *${partner?.name || 'alguien'}*.`);
    }    
    setTimeout(() => {
      delete proposals[proposer];
    }, 120000);    
    if (proposals[proposee] === proposer) {
      delete proposals[proposee];
      db.updateUser(proposer, 'marry', proposee);
      db.updateUser(proposee, 'marry', proposer);
      return msg.reply(`✩.･:｡≻───── ⋆♡⋆ ─────.•:｡✩\n¡Se han Casado! ฅ^•ﻌ•^ฅ*:･ﾟ✧\n\n*•.¸♡ ${proposerUser.genre === 'Mujer' ? 'Esposa' : proposerUser.genre === 'Hombre' ? 'Esposo' : 'Esposx'} ${proposerUser.name || proposer.split('@')[0]} ♡¸.•*\n*•.¸♡ ${proposeeUser.genre === 'Mujer' ? 'Esposa' : proposeeUser.genre === 'Hombre' ? 'Esposo' : 'Esposx'} ${proposeeUser.name || proposee.split('@')[0]} ♡¸.•*\n\n\`Disfruten de su luna de miel\`\n\n✩.･:｡≻───── ⋆♡⋆ ─────.•:｡✩`);
    } else {
      proposals[proposer] = proposee;
      return sock.sendMessage(chatId, { text: `♡ ${proposeeUser.name || proposee.split('@')[0]}, el usuario ${proposerUser.name || proposer.split('@')[0]} te ha enviado una propuesta de matrimonio, ¿aceptas? •(=^●ω●^=)•\n\n⚘ *Responde con:*\n> ● *_${usedPrefix + command} ${proposerUser.name || proposer.split('@')[0]}_* para confirmar.\n> ● La propuesta expirará en 2 minutos.`, mentions: [proposer, proposee] }, { quoted: msg });
    }
  }
};
