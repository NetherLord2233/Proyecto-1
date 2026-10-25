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

function esPrimo(num) {
  if (num <= 1) return false;
  for (let i = 2; i <= Math.sqrt(num); i++) {
    if (num % i === 0) return false;
  }
  return true;
}

const CONFIG_DIFICULTAD = {
  f1: { nombre: 'Fácil 1', maxRango: 100, intentos: 15, maxApuesta: 5000, multBase: 1.8 },
  f2: { nombre: 'Fácil 2', maxRango: 100, intentos: 10, maxApuesta: 10000, multBase: 2.5 },
  f3: { nombre: 'Fácil 3', maxRango: 100, intentos: 5, maxApuesta: 20000, multBase: 4.0 },

  n1: { nombre: 'Normal 1', maxRango: 500, intentos: 15, maxApuesta: 15000, multBase: 3.5 },
  n2: { nombre: 'Normal 2', maxRango: 500, intentos: 10, maxApuesta: 30000, multBase: 5.0 },
  n3: { nombre: 'Normal 3', maxRango: 500, intentos: 5, maxApuesta: 50000, multBase: 8.0 },

  d1: { nombre: 'Difícil 1', maxRango: 1000, intentos: 15, maxApuesta: 40000, multBase: 6.0 },
  d2: { nombre: 'Difícil 2', maxRango: 1000, intentos: 10, maxApuesta: 75000, multBase: 10.0 },
  d3: { nombre: 'Difícil 3', maxRango: 1000, intentos: 5, maxApuesta: 150000, multBase: 18.0 }
};

export default {
  command: ['adivina', 'guess', 'num', 'pista', 'difguess', 'dificultades'],
  category: 'economy',
  description: 'Juego de adivinar el número con dificultades, pistas y multiplicadores.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const chat = db.getChat(chatId);

    if (chat?.adminonly || !chat?.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }

    db.setCreate('chat_users', [chatId, msg.sender], 'lastguess', 0);
    db.setCreate('chat_users', [chatId, msg.sender], 'guessGame', null);

    const user = db.getChatUser(chatId, msg.sender) || {};
    const userCoins = user.coins || 0;
    const lastGuess = user.lastguess || 0;
    let game = user.guessGame;

    const subCommand = args[0]?.toLowerCase();

    if (
      command === 'difguess' || 
      command === 'dificultades' || 
      ['dificultades', 'dificultad', 'dif', 'help'].includes(subCommand)
    ) {
      const menuDificultades = `─── ❛ *DIFICULTADES :: ADIVINANZA* ❜ ───

✦ ┊ *FÁCIL* [ Rango 1 - 100 ]
> \`\`\`f1\`\`\` » 15 intentos ✦ Tope: *¥5,000* ✦ Mult: *x1.8*
> \`\`\`f2\`\`\` » 10 intentos ✦ Tope: *¥10,000* ✦ Mult: *x2.5*
> \`\`\`f3\`\`\` » 05 intentos ✦ Tope: *¥20,000* ✦ Mult: *x4.0*

✦ ┊ *NORMAL* [ Rango 1 - 500 ]
> \`\`\`n1\`\`\` » 15 intentos ✦ Tope: *¥15,000* ✦ Mult: *x3.5*
> \`\`\`n2\`\`\` » 10 intentos ✦ Tope: *¥30,000* ✦ Mult: *x5.0*
> \`\`\`n3\`\`\` » 05 intentos ✦ Tope: *¥50,000* ✦ Mult: *x8.0*

✦ ┊ *DIFÍCIL* [ Rango 1 - 1000 ]
> \`\`\`d1\`\`\` » 15 intentos ✦ Tope: *¥40,000* ✦ Mult: *x6.0*
> \`\`\`d2\`\`\` » 10 intentos ✦ Tope: *¥75,000* ✦ Mult: *x10.0*
> \`\`\`d3\`\`\` » 05 intentos ✦ Tope: *¥150,000* ✦ Mult: *x18.0*

───────────────
✧ Inicia una partida con » *${usedPrefix}adivina iniciar <código> <apuesta>*
> Ejemplo » *${usedPrefix}adivina iniciar f1 500*

> ── ❖ 𝙴𝚕𝚕𝚎𝚗 𝙹𝚘𝚎 ❖ ──`;

      return sock.sendMessage(chatId, { text: menuDificultades }, { quoted: msg });
    }

    if (subCommand === 'pista' || subCommand === 'hint') {
      if (!game) {
        return msg.reply(`ꕥ No tienes ningún juego activo.\n> Inicia uno con » *${usedPrefix + command} iniciar <dif> <apuesta>*`);
      }

      if (game.pistasUsadas >= 3) {
        return msg.reply(`ꕥ Ya has utilizado el límite máximo de *3 pistas* en esta partida.`);
      }

      game.pistasUsadas += 1;
      game.multiplicador = Math.max(1.1, game.multiplicador - 0.25);

      let pistaTexto = '';
      if (game.pistasUsadas === 1) {
        const esPar = game.numeroSecreto % 2 === 0;
        pistaTexto = `El número secreto es *${esPar ? 'PAR' : 'IMPAR'}*.`;
      } else if (game.pistasUsadas === 2) {
        const primo = esPrimo(game.numeroSecreto);
        pistaTexto = `El número secreto *${primo ? 'ES PRIMO' : 'NO ES PRIMO'}*.`;
      } else if (game.pistasUsadas === 3) {
        const margen = Math.floor(game.maxRango * 0.15);
        const minRango = Math.max(1, game.numeroSecreto - margen);
        const maxRango = Math.min(game.maxRango, game.numeroSecreto + margen);
        pistaTexto = `El número se encuentra entre el rango de \`\`\`${minRango}\`\`\` y \`\`\`${maxRango}\`\`\`.`;
      }

      db.updateChatUser(chatId, msg.sender, 'guessGame', game);

      const hintText = `─── ❛ *ADIVINANZA :: PISTA* ❜ ───

✦ ┊ *Pista ${game.pistasUsadas}/3*
> ${pistaTexto}

───────────────
❖ Multiplicador actual » *x${game.multiplicador.toFixed(2)}*
❖ Intentos restantes » *${game.intentos}*

> ── ❖ 𝙴𝚕𝚕𝚎𝚗 𝙹𝚘𝚎 ❖ ──`;

      return sock.sendMessage(chatId, { text: hintText }, { quoted: msg });
    }

    if (subCommand === 'iniciar' || subCommand === 'start') {
      if (game) {
        return msg.reply(`ꕥ Ya tienes una partida activa. Adivina con » *${usedPrefix + command} <número>* o pide una pista con » *${usedPrefix + command} pista*`);
      }

      if (Date.now() - lastGuess < 15000) {
        const restante = lastGuess + 15000 - Date.now();
        return msg.reply(`ꕥ Debes esperar *${formatTime(restante)}* para iniciar otra partida.`);
      }

      const diffKey = args[1]?.toLowerCase();
      const config = CONFIG_DIFICULTAD[diffKey];

      if (!config) {
        return msg.reply(`ꕥ Selecciona una dificultad válida.\n> Usa *${usedPrefix}difguess* para ver la lista de dificultades disponbles.\n> Ejemplo » *${usedPrefix + command} iniciar f1 500*`);
      }

      const cantidadInput = args[2]?.toLowerCase();
      if (!cantidadInput) {
        return msg.reply(`ꕥ Ingresa la cantidad a apostar.\n> Ejemplo » *${usedPrefix + command} iniciar ${diffKey} 500*`);
      }

      let apuesta = (cantidadInput === 'all' || cantidadInput === 'todo') ? userCoins : parseInt(cantidadInput);

      if (isNaN(apuesta) || apuesta <= 0) {
        return msg.reply(`ꕥ Ingresa una cantidad válida para apostar.`);
      }

      if (apuesta < 100) {
        return msg.reply(`ꕥ La apuesta mínima es de *¥100*.`);
      }

      if (apuesta > config.maxApuesta) {
        return msg.reply(`ꕥ El límite de apuesta para *${config.nombre}* es de *¥${config.maxApuesta.toLocaleString()}*.`);
      }

      if (userCoins < apuesta) {
        return msg.reply(`ꕥ Tus fondos no son suficientes. Tienes *¥${userCoins.toLocaleString()}*.`);
      }

      const numeroSecreto = Math.floor(Math.random() * config.maxRango) + 1;

      game = {
        modo: config.nombre,
        numeroSecreto,
        maxRango: config.maxRango,
        apuesta,
        intentosMax: config.intentos,
        intentos: config.intentos,
        pistasUsadas: 0,
        multiplicador: config.multBase
      };

      db.updateChatUser(chatId, msg.sender, 'lastguess', Date.now());
      db.updateChatUser(chatId, msg.sender, 'guessGame', game);

      const startText = `─── ❛ *ADIVINANZA* ❜ ───

✦ ┊ *Partida Iniciada* [ ${config.nombre} ]
> He pensado un número del \`\`\`1\`\`\` al \`\`\`${config.maxRango}\`\`\`.

❖ Apuesta » *¥${apuesta.toLocaleString()}*
❖ Intentos » *${config.intentos}*
❖ Multiplicador Máximo » *x${config.multBase.toFixed(2)}*

───────────────
✧ Usa » *${usedPrefix + command} <número>* para intentar adivinar.
✧ Usa » *${usedPrefix + command} pista* para solicitar ayuda.

> ── ❖ 𝙴𝚕𝚕𝚎𝚗 𝙹𝚘𝚎 ❖ ──`;

      return sock.sendMessage(chatId, { text: startText }, { quoted: msg });
    }

    if (!game) {
      return msg.reply(`ꕥ No tienes ninguna partida activa.\n> Inicia una con » *${usedPrefix + command} iniciar <dif> <apuesta>*\n> Ver dificultades con » *${usedPrefix}difguess*`);
    }

    const intento = parseInt(args[0]);

    if (isNaN(intento) || intento < 1 || intento > game.maxRango) {
      return msg.reply(`ꕥ Ingresa un número válido entre \`\`\`1\`\`\` y \`\`\`${game.maxRango}\`\`\`.`);
    }

    if (intento === game.numeroSecreto) {
      const premioTotal = Math.floor(game.apuesta * game.multiplicador);
      const gananciaNeta = premioTotal - game.apuesta;
      const newCoins = userCoins + gananciaNeta;

      db.updateChatUser(chatId, msg.sender, 'coins', newCoins);
      db.updateChatUser(chatId, msg.sender, 'guessGame', null);

      const winText = `─── ❛ *ADIVINANZA* ❜ ───

✦ ┊ *¡ACERTASTE!*
> El número secreto era \`\`\`${game.numeroSecreto}\`\`\`.

✧ *Victoria Lograda* [ ${game.modo} ]
> ◈ Multiplicador Final » *x${game.multiplicador.toFixed(2)}*
> ◈ Ganancia Neta » *+¥${gananciaNeta.toLocaleString()}*

───────────────
❖ Saldo restante » *¥${newCoins.toLocaleString()}*

> ── ❖ 𝙴𝚕𝚕𝚎𝚗 𝙹𝚘𝚎 ❖ ──`;

      return sock.sendMessage(chatId, { text: winText }, { quoted: msg });
    }

    game.intentos -= 1;
    const reduccionPorIntento = game.multiplicador * 0.05;
    game.multiplicador = Math.max(1.05, game.multiplicador - reduccionPorIntento);

    if (game.intentos <= 0) {
      const newCoins = userCoins - game.apuesta;

      db.updateChatUser(chatId, msg.sender, 'coins', newCoins);
      db.updateChatUser(chatId, msg.sender, 'guessGame', null);

      const loseText = `─── ❛ *ADIVINANZA* ❜ ───

✦ ┊ *SIN INTENTOS*
> Se agotaron tus oportunidades. El número era \`\`\`${game.numeroSecreto}\`\`\`.

✧ *Derrota*
> ◈ Perdido » *-¥${game.apuesta.toLocaleString()}*

───────────────
❖ Saldo restante » *¥${newCoins.toLocaleString()}*

> ── ❖ 𝙴𝚕𝚕𝚎𝚗 𝙹𝚘𝚎 ❖ ──`;

      return sock.sendMessage(chatId, { text: loseText }, { quoted: msg });
    }

    db.updateChatUser(chatId, msg.sender, 'guessGame', game);

    const orientacion = intento < game.numeroSecreto ? 'MAYOR' : 'MENOR';

    const continueText = `─── ❛ *ADIVINANZA* ❜ ───

✦ ┊ *Intento Incorrecto*
> El número secreto es *${orientacion}* que \`\`\`${intento}\`\`\`.

❖ Intentos restantes » *${game.intentos}*
❖ Multiplicador actual » *x${game.multiplicador.toFixed(2)}*

───────────────
✧ Tip » Pide una pista con *${usedPrefix + command} pista*

> ── ❖ 𝙴𝚕𝚕𝚎𝚗 𝙹𝚘𝚎 ❖ ──`;

    await sock.sendMessage(chatId, { text: continueText }, { quoted: msg });
  }
};
