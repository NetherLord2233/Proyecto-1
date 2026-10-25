import { delay } from 'baileys';
import db from '#db';

export default {
  command: ['dice', 'dados'],
  category: 'economy',
  description: 'Apostar coins en la mesa de dados.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const chatData = db.getChat(chatId);

    if (chatData.adminonly || !chatData.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }

    db.setCreate('chat_users', [chatId, msg.sender], 'lastDice', 0);
    const user = db.getChatUser(chatId, msg.sender) || {};
    const userCoins = user.coins || 0;

    const tiempoEspera = 30 * 1000;
    const ahora = Date.now();

    if (user.lastDice && ahora - user.lastDice < tiempoEspera) {
      const restante = user.lastDice + tiempoEspera - ahora;
      const tiempoRestante = formatTime(restante);
      return sock.reply(chatId, `ꕥ Debes esperar *${tiempoRestante}* para volver a tirar los dados.`, msg);
    }

    if (!args[0] || !args[1]) {
      return sock.reply(chatId, `ꕥ Uso correcto del comando:\n> *${usedPrefix + command} <monto> <opcion>*\n\n✦ ┊ 𝙾𝚙𝚌𝚒𝚘𝚗𝚎𝚜 𝚍𝚎 𝚊𝚙𝚞𝚎𝚜𝚝𝚊:\n> ◈ *<7* » Menor a 7 (x2)\n> ◈ *>7* » Mayor a 7 (x2)\n> ◈ *7* » Siete exacto (x5)\n> ◈ *snake* » Par de unos [1-1] (x10)\n> ◈ *boxcars* » Par de seises [6-6] (x12)\n\n*Ejemplo:* ${usedPrefix + command} 500 >7`, msg);
    }

    let apuesta = 0;
    if (/all/i.test(args[0])) {
      apuesta = userCoins;
    } else {
      apuesta = parseInt(args[0]);
    }

    if (isNaN(apuesta) || apuesta <= 0) {
      return sock.reply(chatId, `ꕥ Ingresa un monto válido para apostar.`, msg);
    }

    if (userCoins < apuesta) {
      return sock.reply(chatId, `ꕥ No tienes suficiente saldo en tu cartera. Tienes *¥${userCoins.toLocaleString()}*.`, msg);
    }

    const eleccion = args[1].toLowerCase();
    const opcionesValidas = ['<7', '>7', '7', 'snake', 'boxcars'];

    if (!opcionesValidas.includes(eleccion)) {
      return sock.reply(chatId, `ꕥ Opción no válida. Elige entre: *<7*, *>7*, *7*, *snake*, *boxcars*.`, msg);
    }

    db.updateChatUser(chatId, msg.sender, 'lastDice', ahora);

    const dado1 = Math.floor(Math.random() * 6) + 1;
    const dado2 = Math.floor(Math.random() * 6) + 1;
    const suma = dado1 + dado2;

    const dadosEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const emoji1 = dadosEmojis[dado1 - 1];
    const emoji2 = dadosEmojis[dado2 - 1];

    let { key } = await sock.sendMessage(chatId, { text: "🎲 *El tirador hace rodar los dados sobre la mesa...*" }, { quoted: msg });
    await delay(1800);

    let gano = false;
    let multiplicador = 0;

    if (eleccion === '<7' && suma < 7) {
      gano = true;
      multiplicador = 2;
    } else if (eleccion === '>7' && suma > 7) {
      gano = true;
      multiplicador = 2;
    } else if (eleccion === '7' && suma === 7) {
      gano = true;
      multiplicador = 5;
    } else if (eleccion === 'snake' && dado1 === 1 && dado2 === 1) {
      gano = true;
      multiplicador = 10;
    } else if (eleccion === 'boxcars' && dado1 === 6 && dado2 === 6) {
      gano = true;
      multiplicador = 12;
    }

    let resultadoTexto = "";
    let nuevoSaldo = userCoins;

    if (gano) {
      const gananciaNeta = apuesta * multiplicador;
      nuevoSaldo = userCoins - apuesta + gananciaNeta;
      db.updateChatUser(chatId, msg.sender, 'coins', nuevoSaldo);

      resultadoTexto = `✦ ┊ 𝚁𝚎𝚜𝚞𝚕𝚝𝚊𝚍𝚘 » *¡VICTORIA!* (x${multiplicador})
> Has acertado tu pronóstico en la mesa.
> ◈ Ganancia » *+¥${gananciaNeta.toLocaleString()}*`;
    } else {
      nuevoSaldo = userCoins - apuesta;
      db.updateChatUser(chatId, msg.sender, 'coins', nuevoSaldo);

      resultadoTexto = `✦ ┊ 𝚁𝚎𝚜𝚞𝚕𝚝𝚊𝚍𝚘 » *DERROTA*
> La combinación no coincidió con tu apuesta.
> ◈ Pérdida » *-¥${apuesta.toLocaleString()}*`;
    }

    const casinoText = `─❖𝙼𝙴𝚂𝙰 𝙳𝙴 𝙳𝙰𝙳𝙾𝚂❖─

✦ ┊ 𝙹𝚞𝚐𝚊𝚍𝚊
> ◈ Dados » \`\`\`[ ${emoji1} ${emoji2} ] =${suma}\`\`\`
> ◈ Tu apuesta » \`\`\`${eleccion.toUpperCase()}\`\`\`

${resultadoTexto}

───────────────
❖ Saldo en cuenta » *¥${nuevoSaldo.toLocaleString()}*`;

    await sock.sendMessage(chatId, { text: casinoText, edit: key }, { quoted: msg });
  }
};

function formatTime(ms) {
  if (ms <= 0 || isNaN(ms)) return 'Ahora';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const partes = [];
  if (min) partes.push(`${min} min`);
  partes.push(`${sec} seg`);
  return partes.join(' ');
}