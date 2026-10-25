import db from "#db"
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default {
  command: ['bots', 'sockets'],
  category: 'socket',
  description: 'mira las sesiones y sockets activos en el grupo', 
  isAdmin: true,
  run: async ({ msg, sock, isStaff, isOwner, isDev }) => {
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const mainBotJid = global?.sock ? global?.sock?.user?.id?.split(':')[0] + '@s.whatsapp.net' : '';

    const from = msg.key.remoteJid;
    const groupMetadata = msg.isGroup ? await sock.groupMetadata(from).catch(() => {}) : '';
    const groupParticipants = groupMetadata?.participants?.map((p) => p.phoneNumber || p.jid || p.lid || p.id) || [];

    const isMainBotInGroup = mainBotJid ? groupParticipants.includes(mainBotJid) : false;

    const basePath = path.join(dirname, '../../Sessions');
    
    // Lectura asíncrona eficiente del directorio de Subs
    const getBotsFromFolder = async () => {
      const folderPath = path.join(basePath, 'Subs');
      try {
        const stats = await fs.stat(folderPath).catch(() => null);
        if (!stats || !stats.isDirectory()) return [];
        const dirs = await fs.readdir(folderPath);
        
        const checks = await Promise.all(
          dirs.map(async (dir) => {
            const credsPath = path.join(folderPath, dir, 'creds.json');
            try {
              const fileStats = await fs.stat(credsPath);
              return fileStats.isFile() ? dir.replace(/\D/g, '') : null;
            } catch {
              return null;
            }
          })
        );
        return checks.filter(Boolean);
      } catch {
        return [];
      }
    };

    const subs = await getBotsFromFolder();
    const categorizedBots = { Owner: [], Sub: [] };
    const mentionedJid = [];

    // Función segura para obtener configuraciones de forma síncrona
    const getSafeSettings = (jid) => {
      try {
        return db.getSettings(jid) || {};
      } catch {
        return {};
      }
    };

    // Función unificada para procesar bots
    const processBot = (jid, label, checkGroup = true) => {
      if (!jid) return null;
      if (checkGroup && !groupParticipants.includes(jid)) return null;
      
      if (!mentionedJid.includes(jid)) mentionedJid.push(jid);
      
      const data = getSafeSettings(jid);
      const name = data?.namebot2 || 'Bot';
      const number = jid.split('@')[0];
      
      return {
        jid,
        line: `- [${label} *${name}*] › @${number}`
      };
    };

    // Procesar Main Bot / Owner
    if (mainBotJid) {
      const mainData = getSafeSettings(mainBotJid);
      if (mainData) {
        const mainBotInfo = processBot(mainBotJid, 'Owner', true);
        if (mainBotInfo && isMainBotInGroup) {
          categorizedBots.Owner.push(mainBotInfo.line);
        }
      }
    }

    // Procesar Subs
    for (const num of subs) {
      const jid = num + '@s.whatsapp.net';
      const res = processBot(jid, 'Sub', true);
      if (res) categorizedBots.Sub.push(res.line);
    }

    const totalBots = 1 + subs.length;
    const totalInGroup = categorizedBots.Owner.length + categorizedBots.Sub.length;

    let message = `ꕥ Números de Sockets activos *(${totalBots})*\n\n`;
    message += `ੈ❖‧₊˚ Principales › *1*\n`;
    message += `ੈ✿‧₊˚ Subs › *${subs.length}*\n\n`;
    message += `➭ *Bots en el grupo ›* ${totalInGroup}\n`;

    for (const cat of ['Owner', 'Sub']) {
      if (categorizedBots[cat].length) message += categorizedBots[cat].join('\n') + '\n';
    }

    // Listado global para Staff / Owner / Dev
    if (isStaff || isOwner || isDev) {
      const allBotsList = [];

      if (mainBotJid) {
        const res = processBot(mainBotJid, 'Owner', false);
        if (res) allBotsList.push(res.line);
      }

      for (const num of subs) {
        const jid = num + '@s.whatsapp.net';
        const res = processBot(jid, 'Sub', false);
        if (res) allBotsList.push(res.line);
      }

      if (allBotsList.length) {
        message += `\n➭ *TOTAL BOTS ›* ${allBotsList.length}\n`;
        message += allBotsList.join('\n') + '\n';
      }
    }

    const currentBotData = getSafeSettings(botId);
    const icon = currentBotData?.icon || currentBotData?.banner || '';

    if (icon) {
      await sock.sendMessage(msg.chat, {
        image: { url: icon },
        caption: message.trim(),
        contextInfo: { mentionedJid }
      }, { quoted: msg });
    } else {
      await sock.sendMessage(msg.chat, {
        text: message.trim(),
        contextInfo: { mentionedJid }
      }, { quoted: msg });
    }
  },
};
