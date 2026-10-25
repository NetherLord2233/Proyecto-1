import { delay } from 'baileys';
import db from '#db';

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} min`);
  parts.push(`${seconds} seg`);
  return parts.join(' ');
}

export default {
  command: ['coinflip', 'cf', 'caracruz', 'suerte'],
  category: 'economy',
  description: 'Aposta dinero a cara o cruz.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const chat = db.getChat(chatId);

    if (chat?.adminonly || !chat?.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }

    const botId = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : '';
    const bot = db.getSettings(botId);

    db.setCreate('chat_users', [chatId, msg.sender], 'lastcf', 0);
    db.setCreate('chat_users', [chatId, msg.sender], 'cfStreak', 0);

    let user = db.getChatUser(chatId, msg.sender) || {};
    let userCoins = user.coins || 0;
    const lastCf = user.lastcf || 0;
    const streak = user.cfStreak || 0;

    if (Date.now() - lastCf < 30000) {
      const restante = lastCf + 30000 - Date.now();
      return msg.reply(`ꕥ Debes esperar *${formatTime(restante)}* para volver a lanzar la moneda.`);
    }

    const eleccionInput = args[0]?.toLowerCase();
    const cantidadInput = args[1]?.toLowerCase();

    let eleccion = null;
    if (['cara', 'c', 'heads'].includes(eleccionInput)) eleccion = 'cara';
    if (['cruz', 'x', 'tails', 'sello'].includes(eleccionInput)) eleccion = 'cruz';

    if (!eleccion || !cantidadInput) {
      return msg.reply(`ꕥ Por favor, elige cara o cruz y la cantidad a apostar.\n> Ejemplo » *${usedPrefix + command} cara 500*\n> Ejemplo » *${usedPrefix + command} cruz all*`);
    }

    let apuesta = (cantidadInput === 'all' || cantidadInput === 'todo') ? userCoins : parseInt(cantidadInput);

    if (isNaN(apuesta) || apuesta <= 0) {
      return msg.reply(`ꕥ Ingresa una cantidad válida para apostar.`);
    }

    if (apuesta < 100 || apuesta > 100000) {
      return msg.reply(`ꕥ La apuesta debe estar entre *¥100* y *¥100,000*.`);
    }

    if (userCoins < apuesta) {
      return msg.reply(`ꕥ Tus fondos no son suficientes. Tienes *¥${userCoins.toLocaleString()}*.`);
    }

    db.updateChatUser(chatId, msg.sender, 'lastcf', Date.now());

    const opciones = ['cara', 'cruz'];
    const resultadoLanzamiento = opciones[Math.floor(Math.random() * opciones.length)];
    const gano = eleccion === resultadoLanzamiento;

    const simboloCara = '⍟';
    const simboloCruz = '⌬';

    const simboloEleccion = eleccion === 'cara' ? simboloCara : simboloCruz;
    const simboloResultado = resultadoLanzamiento === 'cara' ? simboloCara : simboloCruz;

    const renderFrame = (coinSymbol, statusMsg) => {
      return `─── ❛ *COINFLIP* ❜ ───

✦ ┊ *Lanzando la moneda...* [  ${coinSymbol}  ]

❖ Apuesta » *¥${apuesta.toLocaleString()}*
❖ Elección » *${eleccion.toUpperCase()}* ${simboloEleccion}${streak > 0 ? `\n❖ Racha » *${streak} victorias*` : ''}

${statusMsg}
───────────────`;
    };

    const animFrames = ['⍟', '⌬', '⍟', '⌬', '⍟', '⌬'];
    let currentText = renderFrame(animFrames[0], '✧ _La moneda está en el aire..._');
    let { key } = await sock.sendMessage(chatId, { text: currentText }, { quoted: msg });

    for (let i = 1; i < animFrames.length; i++) {
      await delay(250);
      await sock.sendMessage(chatId, { text: renderFrame(animFrames[i], '✧ _Girando en el aire..._'), edit: key }, { quoted: msg });
    }

    await delay(300);

    user = db.getChatUser(chatId, msg.sender) || {};
    userCoins = user.coins || 0;

    let newCoins = userCoins;
    let newStreak = streak;
    let statusResult = '';

    if (gano) {
      newStreak += 1;

      let porcentajeBonus = 0;
      if (newStreak === 3) porcentajeBonus = 0.05;
      else if (newStreak === 4) porcentajeBonus = 0.10;
      else if (newStreak >= 5) porcentajeBonus = 0.15;

      const bonusDinero = Math.floor(apuesta * porcentajeBonus);
      const gananciaNeta = apuesta + bonusDinero;

      newCoins += gananciaNeta;

      statusResult = `✧ *¡Victoria!* Salió *${resultadoLanzamiento.toUpperCase()}* ${simboloResultado}\n> ◈ Ganancia » *+¥${gananciaNeta.toLocaleString()}*`;

      if (bonusDinero > 0) {
        statusResult += `\n> ❖ Bonus Racha (${newStreak}) » *+¥${bonusDinero.toLocaleString()}* _(+${porcentajeBonus * 100}%)_`;
      }
    } else {
      newCoins = Math.max(0, userCoins - apuesta);
      statusResult = `✧ *Derrota.* Cayó *${resultadoLanzamiento.toUpperCase()}* ${simboloResultado}\n> ◈ Perdido » *-¥${apuesta.toLocaleString()}*`;

      if (streak > 0) {
        statusResult += `\n> ❖ *Racha reiniciada.*`;
      }

      newStreak = 0;
    }

    db.updateChatUser(chatId, msg.sender, 'cfStreak', newStreak);
    db.updateChatUser(chatId, msg.sender, 'coins', newCoins);

    const finalText = `─── ❛ *COINFLIP* ❜ ───

✦ ┊ *Resultado final:* [  ${simboloResultado}  ]

❖ Elegiste » *${eleccion.toUpperCase()}* ${simboloEleccion}
❖ Salió » *${resultadoLanzamiento.toUpperCase()}* ${simboloResultado}

${statusResult}

───────────────
❖ Saldo actual » *¥${newCoins.toLocaleString()}*
`;

    await sock.sendMessage(chatId, { text: finalText, edit: key }, { quoted: msg });
  }
};
