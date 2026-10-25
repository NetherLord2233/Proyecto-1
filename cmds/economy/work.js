import db from '#db';

export default {
  command: ['w', 'work', 'chambear', 'trabajar'],
  category: 'economy',
  description: 'Ganar o perder monedas en trabajos aleatorios.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const chat = db.getChat(msg.chat);
    if (chat.adminonly || !chat.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con:\n» *${usedPrefix}economy on*`);
    }

    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const settings = db.getSettings(botId);
    const monedas = settings.currency || 'coins';

    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastwork', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'coins', 0);

    const user = db.getChatUser(msg.chat, msg.sender);

    const senderNum = String(msg.sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const ownersList = (global.owner || []).map(x => String(x).replace(/\D/g, ''));
    const isOwner = ownersList.includes(senderNum) || msg.sender === botId;

    const baseCooldown = 3 * 60 * 1000;

    if (!isOwner && Date.now() < user.lastwork) {
      const tiempoRestante = formatTime(user.lastwork - Date.now());
      return sock.reply(msg.chat, `ꕥ Debes descansar *${tiempoRestante}* antes de volver a trabajar.`, msg);
    }

    const currentCoins = user.coins || 0;
    const isFailure = Math.random() < 0.35;

    if (isFailure) {
      const loss = Math.floor(Math.random() * 4500) + 1500;
      const actualLoss = Math.min(loss, currentCoins);

      if (!isOwner) db.updateChatUser(msg.chat, msg.sender, 'lastwork', Date.now() + baseCooldown);
      db.updateChatUser(msg.chat, msg.sender, 'coins', currentCoins - actualLoss);

      const storyFail = generateRandomStory(false);
      return sock.reply(msg.chat, `⚠️ *¡Infortunio Laboral!*\n\n${storyFail}\n\n📉 Perdiste: *¥${actualLoss.toLocaleString()} ${monedas}*`, msg);
    }

    let finalEarn = Math.floor(Math.random() * (12000 - 2000 + 1)) + 2000;
    let bonusText = '';

    if (Math.random() > 0.80) {
      finalEarn = Math.floor(finalEarn * 2.2);
      bonusText = '\n✦ *¡Rendimiento Excepcional!* Recibiste una bonificación especial.';
    }

    if (!isOwner) db.updateChatUser(msg.chat, msg.sender, 'lastwork', Date.now() + baseCooldown);
    db.updateChatUser(msg.chat, msg.sender, 'coins', currentCoins + finalEarn);

    const storySuccess = generateRandomStory(true);

    const response = `❀ *Jornada Completada* ❀\n\n${storySuccess}\n\n💰 Ganancia: *¥${finalEarn.toLocaleString()} ${monedas}*${bonusText}`;
    await sock.sendMessage(msg.chat, { text: response }, { quoted: msg });
  }
};

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} m`);
  parts.push(`${seconds} s`);
  return parts.join(' ');
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateRandomStory(success) {
  const places = [
    'una mina de diamantes', 'una plataforma petrolera', 'un laboratorio clandestino',
    'un rascacielos en construcción', 'un barco en alta mar', 'una red de servidores',
    'un taller mecánico', 'un centro de investigación', 'un casino clandestino',
    'una expedición de alto riesgo', 'un fondo de inversión privado', 'un estudio de animación'
  ];

  const successActions = [
    'completaste un contrato de alto valor', 'resolviste un problema crítico',
    'lograste una hazaña increíble', 'superaste todas las expectativas del cliente',
    'extrajiste recursos extremadamente valiosos', 'ejecutaste una operación perfecta'
  ];

  const failActions = [
    'un grave accidente destruyó el material', 'una inspección te impuso una multa cuantiosa',
    'un error de cálculo causó severas pérdidas', 'un fallo en el equipo arruinó el trabajo',
    'un sabotaje destruyó el cargamento', 'sufriste una sanción por incumplimiento'
  ];

  const place = pickRandom(places);
  if (success) {
    const action = pickRandom(successActions);
    return `Durante tu labor en *${place}*, ${action} con éxito.`;
  } else {
    const action = pickRandom(failActions);
    return `Mientras trabajabas en *${place}*, ${action}.`;
  }
      }
    
