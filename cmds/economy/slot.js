import { delay } from 'baileys';
import db from '#db';

const SYMBOLS = [
  { name: 'JACKPOT', emoji: '🎰', weight: 1.03, multiplier: 50 },
  { name: 'SIETE', emoji: '7️⃣', weight: 3.47, multiplier: 20 },
  { name: 'DIAMANTE', emoji: '💎', weight: 12, multiplier: 10 },
  { name: 'UVA', emoji: '🍇', weight: 22, multiplier: 5 },
  { name: 'NARANJA', emoji: '🍊', weight: 31, multiplier: 5 },
  { name: 'LIMÓN', emoji: '🍋', weight: 86, multiplier: 3 },
  { name: 'CEREZA', emoji: '🍒', weight: 86, multiplier: 3 }
];

const getRandomSymbol = () => {
  const totalWeight = SYMBOLS.reduce((acc, s) => acc + s.weight, 0);
  let random = Math.random() * totalWeight;
  for (const symbol of SYMBOLS) {
    if (random < symbol.weight) return symbol;
    random -= symbol.weight;
  }
  return SYMBOLS[SYMBOLS.length - 1];
};

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
  command: ['slot', 'slots', 'casinopost'],
  category: 'economy',
  description: 'Aposta tus coins en la máquina tragamonedas del casino.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const chat = db.getChat(chatId);

    if (chat?.adminonly || !chat?.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }

    const botId = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : '';
    const bot = db.getSettings(botId);

    db.setCreate('chat_users', [chatId, msg.sender], 'lastslot', 0);
    db.setCreate('chat_users', [chatId, msg.sender], 'slotStreak', 0);

    let user = db.getChatUser(chatId, msg.sender) || {};
    let userCoins = user.coins || 0;
    const lastSlot = user.lastslot || 0;
    const streak = user.slotStreak || 0;

    if (Date.now() - lastSlot < 30000) {
      const restante = lastSlot + 30000 - Date.now();
      return msg.reply(`ꕥ Debes esperar *${formatTime(restante)}* para volver a apostar.`);
    }

    const cantidadInput = args[0]?.toLowerCase();

    if (!cantidadInput) {
      return msg.reply(`❀ Por favor, ingresa la cantidad que deseas apostar.\n> Ejemplo » *${usedPrefix + command} 500*`);
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

    db.updateChatUser(chatId, msg.sender, 'lastslot', Date.now());

    const finalSlot1 = getRandomSymbol();
    const finalSlot2 = getRandomSymbol();
    const finalSlot3 = getRandomSymbol();

    const renderSlotFrame = (s1, s2, s3, statusMsg) => {
      return `─── ❛ *CASINO SLOTS* ❜ ───

🎰 ┊ ⁞  ${s1.emoji}  ⁞  ${s2.emoji}  ⁞  ${s3.emoji}  ⁞ 

${statusMsg}

───────────────
💵 Apuesta » *¥${apuesta.toLocaleString()}*${streak > 0 ? `\n🔥 Racha » *${streak} victorias*` : ''}`;
    };

    let currentText = renderSlotFrame({ emoji: '🌀' }, { emoji: '🌀' }, { emoji: '🌀' }, '🎲 _Girando carretes..._');
    let { key } = await sock.sendMessage(chatId, { text: currentText }, { quoted: msg });

    for (let i = 0; i < 3; i++) {
      await delay(150);
      const r1 = i === 2 ? finalSlot1 : getRandomSymbol();
      const r2 = getRandomSymbol();
      const r3 = getRandomSymbol();
      await sock.sendMessage(chatId, { text: renderSlotFrame(r1, r2, r3, '🎲 _Girando carretes..._'), edit: key }, { quoted: msg });
    }

    for (let i = 0; i < 2; i++) {
      await delay(180);
      const r2 = i === 1 ? finalSlot2 : getRandomSymbol();
      const r3 = getRandomSymbol();
      await sock.sendMessage(chatId, { text: renderSlotFrame(finalSlot1, r2, r3, '⚡ _Frenando carrete 2..._'), edit: key }, { quoted: msg });
    }

    const delaysLentos = [300, 450, 650, 850];
    for (let i = 0; i < 4; i++) {
      await delay(delaysLentos[i]);
      const r3 = i === 3 ? finalSlot3 : getRandomSymbol();
      await sock.sendMessage(chatId, { text: renderSlotFrame(finalSlot1, finalSlot2, r3, '🔥 _Último giro..._'), edit: key }, { quoted: msg });
    }

    await delay(400);

    let gananciaBase = 0;
    let esGanador = false;
    let esMini = false;

    if (finalSlot1.name === finalSlot2.name && finalSlot2.name === finalSlot3.name) {
      esGanador = true;
      gananciaBase = apuesta * finalSlot1.multiplier;
    } else if (finalSlot1.name === finalSlot2.name || finalSlot1.name === finalSlot3.name || finalSlot2.name === finalSlot3.name) {
      esGanador = true;
      esMini = true;
      gananciaBase = Math.floor(apuesta * 1.5);
    }

    user = db.getChatUser(chatId, msg.sender) || {};
    userCoins = user.coins || 0;

    let newCoins = userCoins;
    let newStreak = streak;
    let statusResult = '';

    if (esGanador) {
      newStreak += 1;

      let porcentajeBonus = 0;
      if (newStreak === 3) porcentajeBonus = 0.05;
      else if (newStreak === 4) porcentajeBonus = 0.10;
      else if (newStreak >= 5) porcentajeBonus = 0.15;

      const bonusDinero = Math.floor(gananciaBase * porcentajeBonus);
      const pagoBruto = gananciaBase + bonusDinero;
      const gananciaNeta = pagoBruto - apuesta;

      newCoins += gananciaNeta;

      if (esMini) {
        statusResult = `🎉 *¡MINI PREMIO!* _(2 Iguales)_\n> 💸 Ganancia » *+¥${gananciaBase.toLocaleString()}*`;
      } else {
        statusResult = `🥳 *¡¡JACKPOT TRIPLE!!* _(${finalSlot1.name})_\n> 💸 Ganancia base » *+¥${gananciaBase.toLocaleString()}*`;
      }

      if (bonusDinero > 0) {
        statusResult += `\n> 🔥 Bonus Racha (${newStreak}🔥) » *+¥${bonusDinero.toLocaleString()}* _(+${porcentajeBonus * 100}%)_`;
      }

      statusResult += `\n> 📈 Ganancia neta » *+¥${gananciaNeta.toLocaleString()}*`;
    } else {
      newCoins = Math.max(0, userCoins - apuesta);
      statusResult = `💔 *Mala suerte, has perdido.*\n> 💸 Perdido » *-¥${apuesta.toLocaleString()}*`;

      if (streak > 0) {
        statusResult += `\n> ❄ *Racha reiniciada.*`;
      }

      newStreak = 0;
    }

    db.updateChatUser(chatId, msg.sender, 'slotStreak', newStreak);
    db.updateChatUser(chatId, msg.sender, 'coins', newCoins);

    const finalText = `─── ❛ *CASINO SLOTS* ❜ ───

🎰 ┊ ⁞  ${finalSlot1.emoji}  ⁞  ${finalSlot2.emoji}  ⁞  ${finalSlot3.emoji}  ⁞ 

${statusResult}

───────────────
💵 Saldo actual » *¥${newCoins.toLocaleString()}*`;

    await sock.sendMessage(chatId, { text: finalText, edit: key }, { quoted: msg });
  }
};
