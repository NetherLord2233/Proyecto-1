import { updateSettings } from '../../lib/system/database.js';

export default {
  command: ['restart'],
  category: 'owner',
  description: 'Reiniciar el host.',
  isOwner: true,
  run: async ({ msg, sock }) => {
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    try {
      updateSettings(botJid, 'restartFor', msg.sender);
    } catch (e) {
      console.error('No se pudo guardar restartFor:', e);
    }

    await sock.reply(msg.chat, `✎ Reiniciando el Socket...\n> *Espere un momento...*`, msg);
    setTimeout(() => {
      if (process.send) {
        process.send("restart");
      } else {
        process.exit(0);
      }
    }, 3000);
  },
};