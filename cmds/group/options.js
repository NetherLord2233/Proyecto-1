/*
FUNCION AL COMIENZO DEL RUN EN LOS COMANDO: (VA AL PRINCIPIO DE TODO)



const chat = db.getChat(msg.chat);
if (chat.adminonly || !chat.game) {
  return msg.reply(`ꕥ Los comandos de *Juegos* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}juegos on*`);
}
*/

import db from '#db';
export default {
  command: [
    'welcome', 'bienvenida',
    'goodbye', 'despedida',
    'alerts', 'alertas',
    'nsfw',
    'antilink', 'antienlaces', 'antilinks', 
    'antistatus', 'antiestados', 
    'anticall', 'antillamadas', 
    'antierased', 'antieliminados', 'antidelete',
    'rpg', 'economy', 'economia', 
    'gacha', 
    'game', 'juegos', 'juego',
    'adminonly', 'onlyadmin'
  ],
  category: 'group',
  description: 'Configurar opciones del grupo.',
  isAdmin: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    let chatData = db.getChat(msg.chat);
    const botId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
    const botSettings = (db.getSettings ? db.getSettings(botId) : {}) || {};
    const botname = botSettings.botname || 'Bot';
    const stateArg = args[0]?.toLowerCase();
    const validStates = ['on', 'off', 'enable', 'disable'];
    const mapTerms = {
      antilinks: 'antilinks',
      antienlaces: 'antilinks',
      antilink: 'antilinks',
      antistatus: 'antistatus',
      antiestados: 'antistatus',
      anticall: 'anticall',
      antillamadas: 'anticall',
      antierased: 'antierased',
      antieliminados: 'antierased',
      antidelete: 'antierased',
      welcome: 'welcome',
      bienvenida: 'welcome',
      goodbye: 'goodbye',
      despedida: 'goodbye',
      alerts: 'alerts',
      alertas: 'alerts',
      economy: 'economy',
      economia: 'economia',
      adminonly: 'adminonly',
      onlyadmin: 'adminonly',
      nsfw: 'antinsfw',
      rpg: 'gacha',
      gacha: 'gacha',
      game: 'game',
      juegos: 'game',
      juego: 'game'
    };
    const featureNames = {
      antilinks: 'el *AntiEnlace*',
      antistatus: 'el *AntiEstado*',
      anticall: 'el *AntiLlamadas*',
      antierased: 'el *AntiEliminados*',
      welcome: 'el mensaje de *Bienvenida*',
      goodbye: 'el mensaje de *Despedida*',
      alerts: 'las *Alertas*',
      economy: 'los comandos de *Economía*',
      gacha: 'los comandos de *Gacha*',
      game: 'los comandos de *Juegos*',
      adminonly: 'el modo *Solo Admin*',
      nsfw: 'el filtro *AntiNSFW*',
    };
    const featureTitles = {
      antilinks: 'AntiEnlace',
      antistatus: 'AntiEstado',
      anticall: 'AntiLlamadas',
      antierased: 'AntiEliminados',
      welcome: 'Bienvenida',
      goodbye: 'Despedida',
      alerts: 'Alertas',
      economy: 'Economía',
      gacha: 'Gacha',
      game: 'Juegos',
      adminonly: 'AdminOnly',
      nsfw: 'AntiNSFW',
    };
    const messages = {
      antilinks: `> Si el *antienlace* está activado, *${botname}* eliminará a todos los usuarios que envíen links de otros grupos.`,
      antistatus: `> Si el *antiestado* está activado, *${botname}* eliminará a todos los usuarios que envié o mencionen al grupo en sus estado.`,
      anticall: `> Si el *antillamadas* está activado, *${botname}* eliminará a todos los usuarios que inicien una llamada, videollamada o chat de voz en el grupo.`,
      antierased: `> Si el *antieliminados* está activado, cuando un usuario elimine un mensaje propio, *${botname}* lo citará, etiquetará a su autor y enviará de nuevo el contenido original (texto, imagen, video, audio, sticker, documento, etc.).`,
      welcome: `> Si el mensaje de bienvenida está activado, *${botname}* enviará un mensaje de bienvenida a los nuevos miembros del grupo.`,
      goodbye: `> Si el mensaje de despedida está activado, *${botname}* enviará un mensaje de despedida en el momento que un usuario abandone el grupo.`,
      alerts: `> Si las alertas están activadas, *${botname}* avisará a los administradores cuando se realicen cambios en admins.`,
      adminonly: `> Si el modo *Solo Admin* está activado, solo los administradores podrán utilizar los comandos de *${botname}*.`,
      nsfw: `> Si el filtro *antinsfw* está activado, *${botname}* detectará y eliminará automáticamente imágenes, GIFs o stickers NSFW.`
    };

    const normalizedKey = mapTerms[command] || command;
    const isGlobal = normalizedKey === 'antigroup';

    const current = isGlobal 
      ? (botSettings[normalizedKey] === true || botSettings[normalizedKey] === 1)
      : (chatData[normalizedKey] === true || chatData[normalizedKey] === 1);

    const estado = current ? '✓ Activado' : '✗ Desactivado';
    const nombreBonito = featureNames[normalizedKey] || `la función *${normalizedKey}*`;
    const titulo = featureTitles[normalizedKey] || normalizedKey;
    const types = messages[normalizedKey] || "";

    if (!stateArg) {
      return sock.reply(msg.chat, `*✩ ${titulo} (✿❛◡❛)*\n\nꕥ Un administrador puede activar o desactivar ${nombreBonito} utilizando:\n\n● _Habilitar ›_ *${usedPrefix + normalizedKey} enable*\n● _Deshabilitar ›_ *${usedPrefix + normalizedKey} disable*\n\n❒ *Estado actual ›* ${estado}\n${types}`, msg);
    }
    if (!validStates.includes(stateArg)) {
      return sock.reply(msg.chat, `✎ Estado no válido. Usa *on*, *off*, *enable* o *disable*\n\nEjemplo:\n${usedPrefix}${normalizedKey} enable`);
    }
    const enabled = ['on', 'enable'].includes(stateArg);
    const newValue = enabled ? 1 : 0;

    if (current === enabled) {
      return sock.reply(msg.chat, `✎ *${titulo}* ya estaba *${enabled ? 'activado' : 'desactivado'}*.`);
    }

    if (isGlobal) {
      botSettings[normalizedKey] = newValue;
      if (db.updateSettings) {
        db.updateSettings(botId, normalizedKey, newValue);
      } else if (db.data?.settings?.[botId]) {
        db.data.settings[botId][normalizedKey] = newValue;
      }

    } else {
      chatData[normalizedKey] = newValue;
      db.updateChat(msg.chat, normalizedKey, newValue);
      if (normalizedKey === 'antinsfw') {
        chatData['nsfw'] = newValue;
        db.updateChat(msg.chat, 'nsfw', newValue);
      }
    }

    return sock.reply(msg.chat, `✎ Has *${enabled ? 'activado' : 'desactivado'}* ${nombreBonito}.`);
  }
};
