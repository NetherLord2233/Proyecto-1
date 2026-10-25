import moment from 'moment-timezone';
import db from '#db';

const DEFAULT_BIRTH = '11/09/2001';

const growth = Math.pow(Math.PI / Math.E, 1.618) * Math.E * 0.75;

function xpRange(level, multiplier = global.multiplier || 2) {
  if (level < 0) throw new TypeError('level cannot be negative value');
  level = Math.floor(level);
  const min = level === 0 ? 0 : Math.round(Math.pow(level, growth) * multiplier) + 1;
  const max = Math.round(Math.pow(level + 1, growth) * multiplier);
  return { min, max, xp: max - min };
}

export default {
  command: ['profile', 'perfil'],
  category: 'profile',
  description: 'Ver tu perfil o el de un usuario.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const userId = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender;
    db.setCreate('chat_users', [msg.chat, userId], 'favorite', '');
    const user = db.getChatUser(msg.chat, userId);    

    if (!user) {
      return msg.reply('✎ El usuario *mencionado* no está *registrado* en el bot');
    }

    const gDb = global.db || db;
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net' || '';
    const settings = db.getSettings(idBot) || {};
    const currency = settings.currency || '';
    const user2 = db.getUser(userId) || {};

    const name = user2.name || msg.pushName || 'Usuario';
    const birth = user2.birth || DEFAULT_BIRTH;
    const genero = user2.genre || 'Oculto';
    const comandos = user2.usedcommands || user2.commandCount || '0';    

    let pareja = 'Nadie';
    if (user2.marry) {
      const partner = db.getUser(user2.marry) || {};
      pareja = partner?.name || 'Alguien';
    }

    const estadoCivil = genero === 'Mujer' ? 'Casada con' : genero === 'Hombre' ? 'Casado con' : 'Casadx con';
    const pasatiempo = user2.pasatiempo ? `${user2.pasatiempo}` : 'No definido';


    const descText = user2.description ? user2.description : `El ingrediente secreto de mi sopa de ingrediente secreto…
Ven, el ingrediente secreto es…
Nada…
Ya me oíste, nada…
No hay un ingrediente secreto.
Para preparar algo especial solo hay que creér que es especial.
`;



    const exp = user2.exp || 0;
    const nivel = user2.level || 0;

    const chocolates = Number(user.coins || user2.coins || 0);
    const banco = Number(user.bank || user2.bank || 0);
    const totalCoins = chocolates + banco;

    const favId = user.favorite || user2.favorite;
    let favLine = '';

    const charactersList = gDb.data?.characters || global.db?.data?.characters || [];
    const getCharDetails = (charId) => {
      if (Array.isArray(charactersList)) {
        return charactersList.find(c => c.id === charId || c._id === charId);
      } else if (typeof charactersList === 'object' && charactersList !== null) {
        return charactersList[charId];
      }
      return null;
    };

    if (favId) {
      const character = getCharDetails(favId);
      if (character) {
        favLine = `\n๑ Claim favorito » *${character.name || '???'}*`;
      }
    }    

    const ownedIDs = Array.isArray(user.characters) ? user.characters : (Array.isArray(user2.characters) ? user2.characters : []);
    let haremValue = 0;    
    for (const item of ownedIDs) {
      const charId = typeof item === 'object' && item !== null ? (item.id || item._id) : item;
      const character = getCharDetails(charId);
      if (character) {
        haremValue += Number(character.value || character.precio || 0);
      } else if (typeof item === 'object' && item !== null) {
        haremValue += Number(item.value || item.precio || 0);
      }
    }    

    const haremCount = ownedIDs.length;
    const perfil = await sock.profilePictureUrl(userId, 'image').catch((_) => 'https://cdn.yuki-wabot.my.id/files/2PVh.jpeg');    

    let users = [];
    if (typeof db.getUser === 'function') {
      const allUsers = db.getUser();
      if (Array.isArray(allUsers)) {
        users = allUsers.map(u => ({ ...u, jid: u.id || u.jid }));
      } else if (typeof allUsers === 'object' && allUsers !== null) {
        users = Object.entries(allUsers).map(([jid, u]) => ({ ...u, jid }));
      }
    } else if (gDb.data?.users) {
      users = Object.entries(gDb.data.users).map(([jid, u]) => ({ ...u, jid }));
    }

    const sortedLevel = users.sort((a, b) => (b.level || 0) - (a.level || 0));    

    try {
      const rankIndex = sortedLevel.findIndex((u) => u.jid === userId);
      const rank = rankIndex !== -1 ? rankIndex + 1 : 1;
      const { min, xp } = xpRange(nivel, global.multiplier || 2);
      const progreso = Math.max(0, exp - min);
      const porcentaje = xp > 0 ? Math.min(100, Math.floor((progreso / xp) * 100)) : 0;      

      const profileText = `「✿」 *Perfil* ◢ ${name} ◤

♛ Cumpleaños › *${birth}*
⸙ Pasatiempo › *${pasatiempo}*
⚥ Género › *${genero}*
♡ ${estadoCivil} › *${pareja}*

✿ Nivel › *${nivel}*
❀ Experiencia › *${exp.toLocaleString()}*
➨ Progreso › *${progreso.toLocaleString()} => ${xp.toLocaleString()}* _(${porcentaje}%)_
☆ Puesto › *#${rank}*

ꕥ Harem › *${haremCount}*
♤ Valor total › *${haremValue.toLocaleString()}*${favLine}
⛁ Coins totales › *¥${totalCoins.toLocaleString()} ${currency}*
❒ Comandos ejecutados › *${Number(comandos).toLocaleString()}*

> Descripción:
${descText}`;     

      await sock.sendMessage(msg.chat, { image: { url: perfil }, caption: profileText }, { quoted: msg });
    } catch (e) {
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
};
