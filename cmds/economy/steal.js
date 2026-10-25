import db from '#db';

export default {
  command: ['robar', 'steal', 'rob'],
  category: 'economy',
  description: 'Intentar robar el bolsillo o el banco de un usuario.',
  run: async ({ msg, sock, usedPrefix, command, args }) => {
    const chatData = db.getChat(msg.chat);
    if (chatData.adminonly || !chatData.economy) {
      return msg.reply('Los comandos de economía están desactivados en este grupo.');
    }

    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const bot = db.getSettings(botId);
    const currency = bot?.currency || 'coins';

    db.setCreate('chat_users', [msg.chat, msg.sender], 'laststeal', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'coins', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'bank', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'stealthLevel', 1);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'tools', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'inventory', {});

    let user = db.getChatUser(msg.chat, msg.sender);
    if (typeof user.tools === 'string') { try { user.tools = JSON.parse(user.tools); } catch { user.tools = {}; } }
    if (typeof user.inventory === 'string') { try { user.inventory = JSON.parse(user.inventory); } catch { user.inventory = {}; } }

    const senderNum = String(msg.sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const ownersList = (global.owner || []).map(x => String(x).replace(/\D/g, ''));
    const isOwner = ownersList.includes(senderNum) || msg.sender === botId;

    const cooldown = 45 * 60 * 1000;
    if (!isOwner && Date.now() < user.laststeal) {
      const restante = user.laststeal - Date.now();
      return sock.reply(msg.chat, `La policía vigila la zona. Debes esperar ${formatTime(restante)} para volver a actuar.`, msg);
    }

    const who = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    if (!who) {
      return sock.reply(msg.chat, `Debes mencionar o responder al mensaje de alguien para intentar robarle.\nUso: ${usedPrefix + command} [@usuario] [pocket/bank]`, msg);
    }

    if (who === msg.sender) {
      return sock.reply(msg.chat, `No puedes robarte a ti mismo.`, msg);
    }

    const target = db.getChatUser(msg.chat, who);
    if (!target) {
      return sock.reply(msg.chat, `El usuario no está registrado en la base de datos.`, msg);
    }

    const mode = (args.find(arg => ['bank', 'banco', 'pocket', 'bolsillo'].includes(arg.toLowerCase())) || 'pocket').toLowerCase();
    const isTargetBank = mode === 'bank' || mode === 'banco';

    let usedToolKey = null;

    if (isTargetBank) {
      if (user.tools?.kit_hackeo && user.tools.kit_hackeo.durability > 0) {
        usedToolKey = 'kit_hackeo';
      } else if (user.inventory?.kit_hackeo && user.inventory.kit_hackeo > 0) {
        usedToolKey = 'kit_hackeo_inv';
      }

      if (!usedToolKey) {
        return sock.reply(msg.chat, `Para asaltar el Banco de un usuario necesitas un Kit de Hackeo Bancario (kit_hackeo) comprado en la tienda (${usedPrefix}shop).`, msg);
      }
    } else {
      if (user.tools?.ganzua && user.tools.ganzua.durability > 0) {
        usedToolKey = 'ganzua';
      } else if (user.inventory?.ganzua && user.inventory.ganzua > 0) {
        usedToolKey = 'ganzua_inv';
      }
    }

    let toolWarn = '';
    if (usedToolKey) {
      if (usedToolKey === 'kit_hackeo' || usedToolKey === 'ganzua') {
        user.tools[usedToolKey].durability -= 1;
        if (user.tools[usedToolKey].durability <= 0) {
          const toolName = usedToolKey === 'kit_hackeo' ? 'Kit de Hackeo Bancario' : 'Ganzúa';
          delete user.tools[usedToolKey];
          toolWarn = `\nTu ${toolName} se ha roto y ha quedado inservible.`;
        }
        db.updateChatUser(msg.chat, msg.sender, 'tools', user.tools);
      } else if (usedToolKey === 'kit_hackeo_inv' || usedToolKey === 'ganzua_inv') {
        const rawKey = usedToolKey.replace('_inv', '');
        user.inventory[rawKey] -= 1;
        if (user.inventory[rawKey] <= 0) {
          delete user.inventory[rawKey];
          const toolName = rawKey === 'kit_hackeo' ? 'Kit de Hackeo Bancario' : 'Ganzúa';
          toolWarn = `\nHas gastado tu último/a ${toolName}.`;
        }
        db.updateChatUser(msg.chat, msg.sender, 'inventory', user.inventory);
      }
    }

    const name = (db.getUser(who))?.name || who.split('@')[0];
    const stealthLvl = user.stealthLevel || 1;

    let baseFailChance = isTargetBank ? 0.50 : 0.30;
    if (usedToolKey) baseFailChance -= 0.10;
    baseFailChance = Math.max(0.10, baseFailChance - (stealthLvl * 0.02));

    const isFailure = Math.random() < baseFailChance;

    if (!isOwner) {
      db.updateChatUser(msg.chat, msg.sender, 'laststeal', Date.now() + cooldown);
    }

    const currentCoins = user.coins || 0;
    const currentBank = user.bank || 0;
    const totalUserWealth = currentCoins + currentBank;

    if (isFailure) {
      const isSevere = Math.random() < 0.35;
      const minLoss = isSevere ? 5000 : 1200;
      const maxLoss = isSevere ? 20000 : 4000;
      let loss = Math.floor(Math.random() * (maxLoss - minLoss + 1)) + minLoss;
      loss = Math.min(loss, totalUserWealth);

      if (user.coins >= loss) {
        db.updateChatUser(msg.chat, msg.sender, 'coins', user.coins - loss);
      } else {
        const diff = loss - user.coins;
        db.updateChatUser(msg.chat, msg.sender, 'coins', 0);
        db.updateChatUser(msg.chat, msg.sender, 'bank', Math.max(0, currentBank - diff));
      }

      const failStory = generateStealStory(false, isSevere, isTargetBank);
      return sock.reply(msg.chat, `${failStory}\n\nMultas y penalización: ¥${loss.toLocaleString()} ${currency}.${toolWarn}`, msg, { mentions: [who] });
    }

    const targetPocket = target.coins || 0;
    const targetBank = target.bank || 0;
    const availablePool = isTargetBank ? targetBank : targetPocket;

    if (availablePool < 500) {
      return sock.reply(msg.chat, `${name} no tiene suficientes ${currency} ${isTargetBank ? 'en el banco' : 'en el bolsillo'} como para que valga la pena el riesgo.${toolWarn}`, msg, { mentions: [who] });
    }

    const minSteal = isTargetBank ? 5000 : 2000;
    const maxSteal = isTargetBank ? Math.min(25000, Math.floor(availablePool * 0.50)) : Math.min(10000, Math.floor(availablePool * 0.60));

    if (minSteal > availablePool) {
      return sock.reply(msg.chat, `El objetivo no posee suficientes fondos acumulados para efectuar el golpe.${toolWarn}`, msg, { mentions: [who] });
    }

    const stolenAmount = Math.floor(Math.random() * (maxSteal - minSteal + 1)) + minSteal;

    if (isTargetBank) {
      db.updateChatUser(msg.chat, who, 'bank', targetBank - stolenAmount);
    } else {
      db.updateChatUser(msg.chat, who, 'coins', targetPocket - stolenAmount);
    }

    db.updateChatUser(msg.chat, msg.sender, 'coins', currentCoins + stolenAmount);

    if (Math.random() < 0.35 && stealthLvl < 10) {
      db.updateChatUser(msg.chat, msg.sender, 'stealthLevel', stealthLvl + 1);
    }

    const successStory = generateStealStory(true, false, isTargetBank);
    const responseText = `${successStory} a ${name}.\n\nBotín asegurado: ¥${stolenAmount.toLocaleString()} ${currency}\nNivel de Sigilo: Lv. ${stealthLvl}${toolWarn}`;
    await sock.reply(msg.chat, responseText, msg, { mentions: [who] });
  }
};

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function generateStealStory(success, isSevere, isBank) {
  const bankSuccess = [
    'Lograste reventar la caja fuerte digital con éxito',
    'Burlaste los protocolos de cifrado del banco central',
    'Manipulaste los terminales de transferencia cifrada',
    'Hackeaste el servidor principal de la bóveda subterránea'
  ];
  const pocketSuccess = [
    'Deslizaste tus manos con extrema destreza en su bolsillo',
    'Aprovechaste un punto ciego en la multitud para despojarlo',
    'Interceptaste su morral sin que se percatara en absoluto',
    'Ejecutaste un carterazo de categoría profesional'
  ];
  const severeFail = [
    'Activaste una alarma silenciosa conectada al escuadrón táctico.',
    'Fuerzas especiales rodearon el perímetro y confiscaron tus fondos.',
    'El sistema de seguridad automatizado te impuso una sanción monumental.'
  ];
  const mildFail = [
    'El objetivo se dio cuenta a tiempo y te propinó una paliza.',
    'Perdiste parte de tu dinero al correr despavorido de la policía.',
    'Un testigo presencial frustró tu plan y tuviste que pagar un soborno.'
  ];

  if (success) {
    const action = isBank ? pickRandom(bankSuccess) : pickRandom(pocketSuccess);
    return action;
  } else {
    const action = isSevere ? pickRandom(severeFail) : pickRandom(mildFail);
    return action;
  }
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
      }
