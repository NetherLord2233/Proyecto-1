import db from '#db';

export default {
  command: ['prefix'],
  customPrefix: /^prefix\s*$/i,
  description: 'Revela los prefijos qué usa el bot (funciona con la palabra sola sin prefix)',
  category: 'info',

  run: async ({ msg, sock }) => {
    const botJid = sock.user?.id
      ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
      : (sock.user?.lid || '');
    const settings = (await db.getSettings(botJid)) || {};
    const p = settings.prefijo;

    let texto;
    if (p === 1 || p === true) {
      texto = 'ꕤ Este bot funciona *sin prefijo*, solo escribe el comando.';
    } else if (Array.isArray(p) && p.length) {
      texto = `ꕤ Prefijos del bot:\n${p.map(x => `✎ *${x}*`).join('\n')}`;
    } else if (typeof p === 'string' && p) {
      texto = `ꕤ Prefijo del bot: *${p}*`;
    }

    return msg.reply(texto);
  }
};