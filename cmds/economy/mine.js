import db from '#db';

export default {
  command: ['mine', 'minar'],
  category: 'economy',
  description: 'Realizar trabajos de minería y ganar coins con sistema de riesgos variable.',
  run: async ({ msg, sock, usedPrefix }) => {
    const chat = db.getChat(msg.chat);
    if (chat.adminonly || !chat.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }

    const botId = sock?.user?.id.split(':')[0] + '@s.whatsapp.net';
    const botSettings = db.getSettings(botId);
    const monedas = botSettings?.currency || 'Coins';

    db.setCreate('chat_users', [msg.chat, msg.sender], 'tools', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastmine', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'coins', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'stamina', 100);

    let user = db.getChatUser(msg.chat, msg.sender);
    if (user.tools && typeof user.tools === 'string') {
      try { user.tools = JSON.parse(user.tools); } catch { user.tools = {}; }
    }

    const senderNum = String(msg.sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const ownersList = (global.owner || []).map(x => String(x).replace(/\D/g, ''));
    const isOwner = ownersList.includes(senderNum) || msg.sender === botId;

    const remaining = user.lastmine - Date.now();
    if (!isOwner && remaining > 0) {
      return msg.reply(`ꕥ Debes esperar *${msToTime(remaining)}* para minar de nuevo.`);
    }

    const staminaConsumed = Math.floor(Math.random() * 5) + 1;
    if (user.stamina < staminaConsumed) {
      return msg.reply(`ꕥ No tienes suficiente energía para ir a minar.\n> Usa *${usedPrefix}heal* para curarte.`);
    }

    if (!user.tools?.pico) {
      return msg.reply(`ꕥ Necesitas un Pico para minar.\n> Compra uno en la tienda con: *${usedPrefix}buy pico*`);
    }

    if (user.tools.pico.durability <= 10) {
      delete user.tools.pico;
      db.updateChatUser(msg.chat, msg.sender, 'tools', user.tools);
      return msg.reply(`ꕥ Tu Pico se ha roto por el uso y ha sido eliminado de tu inventario.\n> Compra uno nuevo con: *${usedPrefix}buy pico*`);
    }

    user.stamina -= staminaConsumed;
    db.updateChatUser(msg.chat, msg.sender, 'stamina', user.stamina);

    const durabilityConsumed = Math.floor(Math.random() * 15) + 1;
    user.tools.pico.durability -= durabilityConsumed;
    if (user.tools.pico.durability <= 10) {
      delete user.tools.pico;
    }
    db.updateChatUser(msg.chat, msg.sender, 'tools', user.tools);

    if (!isOwner) {
      user.lastmine = Date.now() + 10 * 60 * 1000;
      db.updateChatUser(msg.chat, msg.sender, 'lastmine', user.lastmine);
    }

    const currentCoins = user.coins || 0;
    const isCaveIn = Math.random() < 0.32;

    if (isCaveIn) {
      const isSevere = Math.random() < 0.25;
      const minLoss = isSevere ? 5000 : 300;
      const maxLoss = isSevere ? 18000 : 3500;
      
      const loss = Math.floor(Math.random() * (maxLoss - minLoss + 1)) + minLoss;
      const actualLoss = Math.min(loss, currentCoins);
      user.coins = currentCoins - actualLoss;
      db.updateChatUser(msg.chat, msg.sender, 'coins', user.coins);

      const failStory = generateMineStory(false, isSevere);
      const severityTag = isSevere ? '🚨 *¡CATÁSTROFE EN LA MINA!*' : '⚠️ *¡Inconveniente en la Mina!*';
      return sock.reply(msg.chat, `${severityTag}\n\n${failStory}\n\n📉 Perdiste: *¥${actualLoss.toLocaleString()} ${monedas}*`, msg);
    }

    let isLegendary = Math.random() < 0.05;
    let reward = 0;
    let bonusMsg = '';

    if (isLegendary) {
      reward = Math.floor(Math.random() * 10000) + 15000;
      bonusMsg = '\nꕥ ¡Hallazgo Legendario conseguido!';
    } else {
      reward = Math.floor(Math.random() * 5500) + 7000;
      if (Math.random() < 0.20) {
        const bonus = Math.floor(Math.random() * 4000) + 2000;
        reward += bonus;
        bonusMsg = `\n「✿」 ¡Bonus de veta abundante! Ganaste *${bonus.toLocaleString()}* ${monedas} extra.`;
      }
    }

    user.coins += reward;
    db.updateChatUser(msg.chat, msg.sender, 'coins', user.coins);

    const successStory = generateMineStory(true, false);
    let caption = `❀ *Expedición de Minería* ❀\n\n${successStory} *${reward.toLocaleString()} ${monedas}*`;
    if (bonusMsg) caption += `\n${bonusMsg}`;

    await sock.reply(msg.chat, caption, msg);
  }
};

function msToTime(duration) {
  let seconds = Math.floor((duration / 1000) % 60);
  let minutes = Math.floor((duration / (1000 * 60)) % 60);
  minutes = minutes < 10 ? '0' + minutes : minutes;
  seconds = seconds < 10 ? '0' + seconds : seconds;
  if (minutes === '00') return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
  return `${minutes} minuto${minutes > 1 ? 's' : ''}, ${seconds} segundo${seconds > 1 ? 's' : ''}`;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateMineStory(success, isSevere) {
  const escenarios = [
    'una cueva oscura y húmeda', 'la cima de una montaña nevada', 'un abismo rocoso subterráneo',
    'una mina de carbón abandonada', 'un túnel cubierto de cuarzo cristalino', 'las ruinas de una cantera olvidada',
    'un volcán extinto rico en minerales', 'un cañón profundo'
  ];

  const exitoAcciones = [
    'desenterraste un cofre antiguo que contenía', 'rompiste una densa roca y encontraste',
    'hallaste un saco olvidado cargado con', 'excavaste una veta pura repleta de',
    'hallaste un yacimiento oculto de', 'extrajiste minerales raros valorados en'
  ];

  const leveAcciones = [
    'se te cayeron algunas monedas por una pequeña grieta',
    'roza con una roca afilada rasgó tu morral y perdiste algo de cambio',
    'tuviste que gastar un poco de dinero en reparar una linterna rota',
    'un murciélago te asustó y dejaste caer unas pocas pertenencias'
  ];

  const graveAcciones = [
    'un colapso estructural masivo destruyó tu campamento entero y maquinaria',
    'una explosión de gas de metano calcinó completamente tus reservas de valor',
    'un terremoto subterráneo sepultó la cavidad donde guardabas tus bolsas de monedas',
    'quedaste atrapado bajo toneladas de roca y pagaste un rescate médico crítico'
  ];

  const lugar = pickRandom(escenarios);
  if (success) {
    const accion = pickRandom(exitoAcciones);
    return `En ${lugar}, ${accion}`;
  } else {
    const accion = isSevere ? pickRandom(graveAcciones) : pickRandom(leveAcciones);
    return `Mientras excavabas en ${lugar}, ${accion}.`;
  }
}
