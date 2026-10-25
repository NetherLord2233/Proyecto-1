import { getSettings } from '#db';
import moment from "moment";
import os from "os"; 
import fs from "fs"; 
import path from "path";
import { fileURLToPath } from 'url'; 
import { exec } from 'child_process';
import { promisify } from 'util'; 

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getFolderSize = (dirPath) => {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(dirPath, files[i]);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) size += stats.size;
      else if (stats.isDirectory() && !['node_modules', '.git', '.cache'].includes(files[i])) {
        size += getFolderSize(filePath);
      }
    }
  } catch (e) { return 0; }
  return size;
};

const getRank = (jid) => {
  const num = jid.split('@')[0].replace(/\D/g, '');
  const match = (list) =>
    (list || []).some((n) => {
      const [id, server] = n.split('@');
      return id.replace(/\D/g, '') === num && (!server || jid.endsWith(`@${server}`));
    });

  if (match(global.owner)) return 'Owner';
  if (match(global.devs)) return 'Dev';
  if (match(global.staff)) return 'Staff';
  if (match(global.inv)) return 'Invitado';
  return 'Usuario';
};

export default {
  command: ["st"],
  isInv: true,
  description: 'Ver el estado del bot y GitHub.',
  category: "info",
  run: async ({ sock, msg }) => {

    const start = Date.now();
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const settings = getSettings(botJid);

    const senderNumber = msg.sender.split('@')[0].replace(/\D/g, '');
    const userTag = msg.pushName || senderNumber || "Usuario";
    const userRank = getRank(msg.sender);

    const { key } = await sock.sendMessage(
      msg.chat,
      { text: `⌗°亗˚₊\n\`Usuario:\` *${userTag}*\n────────────────\n❀ *Calculando ping…*\n────────────────` },
      { quoted: msg }
    );

    let gitStatus = "";
    try {
      await execPromise('git fetch origin main');
      const { stdout: local } = await execPromise('git rev-parse HEAD');
      const { stdout: remote } = await execPromise('git rev-parse origin/main');

      if (local.trim() !== remote.trim()) {
        const { stdout: log } = await execPromise(
          'git log HEAD..origin/main --name-only --pretty=format:"@@%an"',
          { maxBuffer: 1024 * 1024 * 10 }
        );

        const lastAuthor = new Map();
        let author = '';
        for (const line of log.split('\n')) {
          const l = line.trim();
          if (!l) continue;
          if (l.startsWith('@@')) { author = l.slice(2); continue; }
          if (!lastAuthor.has(l)) lastAuthor.set(l, author);
        }

        const entries = [...lastAuthor.entries()];
        const count = entries.length;
        const MAX = 30;
        let listFormatted = entries
          .slice(0, MAX)
          .map(([file, who]) => `- ${file} →\n\`${who}\``)
          .join('\n');
        if (count > MAX) listFormatted += `\n... y ${count - MAX} más`;

        gitStatus = `\n────────────────\n*¡Actualización disponible!*\n✎ \`GitHub:\` ${count} archivos.\n────────────────\n\`\`\`\n${listFormatted}\n\`\`\``;
      }
    } catch (e) {
      gitStatus = `\n\`GitHub:\` Error en la consulta.`;
    }

    const latency = Date.now() - start;

    const up = process.uptime();
    const h = Math.floor(up / 3600);
    const min = Math.floor((up % 3600) / 60);
    const s = Math.floor(up % 60);
    const uptimeStr = `[ ${h}h ${min}m ${s}s ]`;
    const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const usedRom = (getFolderSize(process.cwd()) / 1024 / 1024).toFixed(2);

    const mentions = [msg.sender];
    let tagReinicio = 'Nadie';
    let tagUpdate = 'Nadie';

    if (settings?.restartFor) {
      tagReinicio = `@${settings.restartFor.split('@')[0]}`;
      mentions.push(settings.restartFor);
    }
    if (settings?.updateFor) {
      tagUpdate = `@${settings.updateFor.split('@')[0]}`;
      mentions.push(settings.updateFor);
    }

    let m = `⌗°亗°₊\n\`Usuario:\` *${userTag}*\n`;
    m += `\`Rango:\` *${userRank}*\n`;
    m += `────────────────\n❀ \`Ping:\` ${latency} ms\n────────────────\n`;
    m += `*ⴵ* \`Uptime:\` ${uptimeStr}\n`;
    m += `────────────────\n`;
    m += `*ⴵ* \`Último en reiniciar:\` ${tagReinicio}\n`;
    m += `*ⴵ* \`Último en actualizar:\` ${tagUpdate}\n`;
    m += `ꕥ \`RAM usada:\` ${ram} MB\n`;
    m += `ꕥ \`Almac. usado:\` ${usedRom} MB${gitStatus}\n────────────────\n`;

    await sock.sendMessage(msg.chat, { text: m.trim(), edit: key, mentions: mentions });
  },
};
