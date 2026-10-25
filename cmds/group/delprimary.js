import fs from 'fs';
import path from 'path';
import db from '#db';

const sessionsPath = path.resolve(process.cwd(), 'Sessions');
const subsPath = path.join(sessionsPath, 'Subs');
const cleanNumber = (value = '') => String(value).split('@')[0].split(':')[0].replace(/\D/g, '');

export default {
  command: ['delprimary'],
  category: 'group',
  description: 'Remover el bot primario del grupo.',
  isAdmin: true,
  run: async ({ msg, sock, groupMetadata, participants }) => {
    const chat = db.getChat(msg.chat);

    if (!chat.primaryBot) {
      return sock.reply(msg.chat, '《✧》 Este grupo no tiene ningún bot primario establecido actualmente.', msg);
    }

    const previousBot = chat.primaryBot;
    
    chat.primaryBot = null;
    db.updateChat(msg.chat, 'primaryBot', null);

    await sock.reply(
      msg.chat, 
      `ꕥ Se ha removido a @${previousBot.split('@')[0]} como bot primario de este grupo.\n> Ahora los comandos volverán a ser manejados por el bot principal o por defecto.`, 
      msg, 
      { mentions: [previousBot] }
    );
  },
};
