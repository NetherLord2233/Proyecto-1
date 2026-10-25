import db from '#db';

const MAX_LENGTH = 7958; //largo de Rap God

export default {
  command: ['setdescription', 'setdesc'],
  category: 'profile',
  description: 'Establecer tu descripción de perfil.',
  run: async ({ msg, args, usedPrefix, command }) => {
    const user = db.getUser(msg.sender);
    const input = args.join(' ').trim();    
    
    if (!input) {
      return msg.reply(`《✧》 Debes especificar una descripción válida para tu perfil.\n\n> ✐ Ejemplo » *${usedPrefix + command} Hola, uso WhatsApp!*`);
    }

    if (input.length > MAX_LENGTH) {
      return msg.reply(`《✧》 La descripción no puede exceder los *${MAX_LENGTH}* caracteres. (Tu texto tiene *${input.length}* caracteres).`);
    }

    db.updateUser(msg.sender, 'description', input);
    return msg.reply(`✎ Se ha establecido tu descripción, puedes revisarla con ${usedPrefix}profile ฅ^•ﻌ•^ฅ`);
  },
};
