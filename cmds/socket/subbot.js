import db from "#db";
import makeWASocket, { Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, jidDecode, initAuthCreds, BufferJSON, proto } from 'baileys';
import NodeCache from 'node-cache';
import handler from '#handler';
import events from '#events';
import qrcode from "qrcode";
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import chalk from 'chalk';
import { smsg, patchGroupMetadata } from '#serialize';

// Carpeta de las sesiones ORIGINALES (respaldo). La conexión vive en SQL (bloque más abajo).
const SUBS_DIR = path.join(import.meta.dirname, '../../Sessions/Subs');

const MAX_SUBS_DEFAULT = 200;
const COOLDOWN_MS = 120_000;        // espera entre vinculaciones (no aplica al owner)
const LINK_TIMEOUT_MS = 3 * 60_000; // tiempo máximo para vincular un sub-bot nuevo
const MSG_LIMIT = 1000;             // mensajes guardados por sub para getMessage
const REPLACE_MIN_MS = 15_000;      // mínimo entre una solicitud y su reemplazo




const CUSTOM_PAIRING_CODE = '0ELAINA0';




const PAIRING_CODE_REGEX = /^[A-Z0-9]{8}$/;
function getPairingCode() {
  const code = String(CUSTOM_PAIRING_CODE || '').trim().toUpperCase();
  if (!code) return undefined;
  if (!PAIRING_CODE_REGEX.test(code)) {
    console.log(chalk.yellow(`[ ✿  ]  CUSTOM_PAIRING_CODE "${code}" no es válido (8 caracteres, solo A-Z y 0-9). Se usará uno aleatorio.`));
    return undefined;
  }
  return code;
}

global.conns ||= [];
global.SUBS_ACTIVE ||= new Map();   
global.SUBS_STOPPED ||= new Set();  
global.waVersionCache ||= { value: null, expiresAt: 0 };

// ═══ SQL de las sesiones: INICIO ═════════════════════════════════════════════
const { subDb, q } = (global.SUBS_SQL ||= (() => {
  const ROOT = path.join(import.meta.dirname, '../..');
  const DB_FILE = path.join(ROOT, 'Sessions', 'subs.db');
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

  const subDb = new DatabaseSync(DB_FILE);
  subDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS sub_sessions (
      id          TEXT PRIMARY KEY,
      creds       TEXT NOT NULL,
      registered  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_keys (
      session_id  TEXT NOT NULL,
      type        TEXT NOT NULL,
      key_id      TEXT NOT NULL,
      value       TEXT NOT NULL,
      PRIMARY KEY (session_id, type, key_id)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS sub_legacy_keys (
      session_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      value       TEXT NOT NULL,
      PRIMARY KEY (session_id, name)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS sub_flags (
      session_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      value       TEXT NOT NULL DEFAULT '1',
      PRIMARY KEY (session_id, name)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS sub_migrated (
      session_id  TEXT PRIMARY KEY
    );
  `);

  const q = {
    getSession: subDb.prepare('SELECT creds, registered, updated_at FROM sub_sessions WHERE id = ?'),
    hasSession: subDb.prepare('SELECT 1 AS ok FROM sub_sessions WHERE id = ?'),
    upsertSession: subDb.prepare(`
      INSERT INTO sub_sessions (id, creds, registered, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET creds = excluded.creds, registered = excluded.registered, updated_at = excluded.updated_at`),
    listSessions: subDb.prepare(`SELECT id, registered, updated_at FROM sub_sessions WHERE substr(id, 1, 2) <> '__' ORDER BY created_at`),
    countLinked: subDb.prepare(`SELECT COUNT(*) AS n FROM sub_sessions WHERE registered = 1 AND substr(id, 1, 2) <> '__'`),

    getKey: subDb.prepare('SELECT value FROM sub_keys WHERE session_id = ? AND type = ? AND key_id = ?'),
    setKey: subDb.prepare(`
      INSERT INTO sub_keys (session_id, type, key_id, value) VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, type, key_id) DO UPDATE SET value = excluded.value`),
    delKey: subDb.prepare('DELETE FROM sub_keys WHERE session_id = ? AND type = ? AND key_id = ?'),

    getLegacy: subDb.prepare('SELECT value FROM sub_legacy_keys WHERE session_id = ? AND name = ?'),
    setLegacy: subDb.prepare(`
      INSERT INTO sub_legacy_keys (session_id, name, value) VALUES (?, ?, ?)
      ON CONFLICT(session_id, name) DO UPDATE SET value = excluded.value`),
    delLegacy: subDb.prepare('DELETE FROM sub_legacy_keys WHERE session_id = ? AND name = ?'),

    getFlag: subDb.prepare('SELECT value FROM sub_flags WHERE session_id = ? AND name = ?'),
    setFlag: subDb.prepare(`
      INSERT INTO sub_flags (session_id, name, value) VALUES (?, ?, ?)
      ON CONFLICT(session_id, name) DO UPDATE SET value = excluded.value`),

    isMigrated: subDb.prepare('SELECT 1 AS ok FROM sub_migrated WHERE session_id = ?'),
    markMigrated: subDb.prepare('INSERT OR IGNORE INTO sub_migrated (session_id) VALUES (?)'),
  };

  return { subDb, q };
})());

function tx(fn) {
  subDb.exec('BEGIN');
  try {
    const result = fn();
    subDb.exec('COMMIT');
    return result;
  } catch (err) {
    try { subDb.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

const legacyName = (type, keyId) => `${type}-${String(keyId).replace(/\//g, '__').replace(/:/g, '-')}`;

export const sessionExists = (id) => !!q.hasSession.get(String(id));

export function listSessions() {
  return q.listSessions.all().map((r) => ({ id: r.id, registered: !!r.registered, updatedAt: r.updated_at }));
}

export const countLinked = () => q.countLinked.get().n;

export function deleteSession(id) {
  id = String(id);
  tx(() => {
    subDb.prepare('DELETE FROM sub_sessions WHERE id = ?').run(id);
    subDb.prepare('DELETE FROM sub_keys WHERE session_id = ?').run(id);
    subDb.prepare('DELETE FROM sub_legacy_keys WHERE session_id = ?').run(id);
    subDb.prepare('DELETE FROM sub_flags WHERE session_id = ?').run(id);
  });
}

export const getFlag = (id, name) => !!q.getFlag.get(String(id), name);
export const setFlag = (id, name, value = '1') => { q.setFlag.run(String(id), name, String(value)); };

export function useSqlAuthState(id) {
  id = String(id);
  const row = q.getSession.get(id);
  const creds = row ? JSON.parse(row.creds, BufferJSON.reviver) : initAuthCreds();

  const saveCreds = async () => {
    const now = Date.now();
    q.upsertSession.run(id, JSON.stringify(creds, BufferJSON.replacer), creds.registered ? 1 : 0, now, now);
  };

  if (!row) {
    const now = Date.now();
    q.upsertSession.run(id, JSON.stringify(creds, BufferJSON.replacer), creds.registered ? 1 : 0, now, now);
  }

  const readKey = (type, keyId) => {
    let raw = q.getKey.get(id, type, String(keyId))?.value;
    if (raw === undefined) {
      const name = legacyName(type, keyId);
      const legacy = q.getLegacy.get(id, name)?.value;
      if (legacy === undefined) return null;
      tx(() => {
        q.setKey.run(id, type, String(keyId), legacy);
        q.delLegacy.run(id, name);
      });
      raw = legacy;
    }
    let value = JSON.parse(raw, BufferJSON.reviver);
    if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
    return value;
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const keyId of ids) {
            try { data[keyId] = readKey(type, keyId); } catch { data[keyId] = null; }
          }
          return data;
        },
        set: async (data) => {
          tx(() => {
            for (const type in data) {
              for (const keyId in data[type]) {
                const value = data[type][keyId];
                if (value) q.setKey.run(id, type, keyId, JSON.stringify(value, BufferJSON.replacer));
                else q.delKey.run(id, type, keyId);
                q.delLegacy.run(id, legacyName(type, keyId));
              }
            }
          });
        },
      },
    },
    saveCreds,
  };
}

export const OWNER_SESSION_ID = '__owner__';

function importFolderSession(id, folder, log, label = id) {
  try {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return 'skipped';
    if (q.isMigrated.get(id) || sessionExists(id)) return 'skipped';

    const credsFile = path.join(folder, 'creds.json');
    if (!fs.existsSync(credsFile)) return 'skipped';

    const credsText = fs.readFileSync(credsFile, 'utf8');
    const creds = JSON.parse(credsText, BufferJSON.reviver);

    if (!creds.registered) { q.markMigrated.run(id); return 'skipped'; }

    const mtime = Math.round(fs.statSync(credsFile).mtimeMs);
    const files = fs.readdirSync(folder);

    tx(() => {
      q.upsertSession.run(id, credsText, 1, mtime, mtime);
      for (const file of files) {
        const full = path.join(folder, file);
        if (file === 'creds.json') continue;
        if (file === 'msg_sent.flag') { q.setFlag.run(id, 'msg_sent', '1'); continue; }
        if (file === 'channels.flag') { q.setFlag.run(id, 'channels', '1'); continue; }
        if (!file.endsWith('.json')) continue;
        q.setLegacy.run(id, file.slice(0, -'.json'.length), fs.readFileSync(full, 'utf8'));
      }
      q.markMigrated.run(id);
    });

    log(`[ SQL ] Sesión ${label} importada (${files.length} archivos). La carpeta original se conserva.`);
    return 'migrated';
  } catch (err) {
    log(`[ SQL ] No se pudo importar la sesión ${label}: ${err?.message || err}`);
    return 'failed';
  }
}

export function migrateLegacySessions(dir, log = console.log) {
  const result = { migrated: 0, skipped: 0, failed: 0 };
  if (!fs.existsSync(dir)) return result;
  for (const id of fs.readdirSync(dir)) result[importFolderSession(id, path.join(dir, id), log)]++;
  return result;
}

export function migrateOwnerSession(folder = './Sessions/Owner', log = console.log) {
  return importFolderSession(OWNER_SESSION_ID, folder, log, 'principal (Owner)');
}
// ═══ SQL de las sesiones: FIN ════════════════════════════════════════════════

const msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 120, useClones: false });
const userDevicesCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });
const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

const cleanJid = (jid = '') => jid.replace(/:\d+/, '').split('@')[0];
const backoff = (n) => Math.min(3000 * n, 60_000);

async function getVersion() {
  const cache = global.waVersionCache;
  if (cache.value && Date.now() < cache.expiresAt) return cache.value;
  try {
    const latest = await fetchLatestBaileysVersion();
    cache.value = latest.version;
    cache.expiresAt = Date.now() + (latest.error ? 60_000 : 3_600_000);
  } catch {
    cache.value ||= [2, 3000, 1033105955];
  }
  return cache.value;
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

function dispose(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.ws?.close(); } catch {}
  try { sock.end?.(new Error('replaced')); } catch {}
}

function removeFromConns(sock) {
  const i = global.conns.indexOf(sock);
  if (i >= 0) global.conns.splice(i, 1);
}

export function stopSubBot(id) {
  const entry = global.SUBS_ACTIVE.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  clearTimeout(entry.linkTimer);
  global.SUBS_ACTIVE.delete(id);
  dispose(entry.sock);
  removeFromConns(entry.sock);
}

function scheduleDelete(client, chatId, msgs, ms = 60_000) {
  return setTimeout(async () => {
    for (const m of msgs) {
      try { if (m?.key) await client.sendMessage(chatId, { delete: m.key }); } catch {}
    }
  }, ms);
}

async function abandon(id) {
  const entry = global.SUBS_ACTIVE.get(id);
  if (!entry || entry.linked) return;
  const { client, msg, chatId, qrMsg } = entry.ctx;
  stopSubBot(id);
  try { deleteSession(id); } catch {}
  console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${id} no se vinculó a tiempo. Sesión eliminada.`));
  if (client && msg) {
    try { if (qrMsg?.key) await client.sendMessage(chatId || msg.chat, { delete: qrMsg.key }); } catch {}
    try { await client.sendMessage(chatId || msg.chat, { text: '✎ Se agotó el tiempo para vincular el *SUB BOT*. Vuelve a intentarlo.' }, { quoted: msg }); } catch {}
  }
}

function scheduleRetry(id, delay) {
  const entry = global.SUBS_ACTIVE.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(async () => {
    if (global.SUBS_ACTIVE.get(id) !== entry) return;
    try {
      await connect(id, entry);
    } catch (e) {
      console.error(`[ ✿  ]  SUB-BOT ${id} error al reconectar »`, e?.message || e);
      entry.retries++;
      scheduleRetry(id, backoff(entry.retries));
    }
  }, delay);
}

async function joinChannels(sock, id) {
  if (getFlag(id, 'channels')) return;
  for (const value of Object.values(global.my || {})) {
    if (typeof value === 'string' && value.endsWith('@newsletter')) {
      await sock.newsletterFollow(value).catch(() => console.log(chalk.gray(`\n[ ✿ ] Error al seguir el canal ${value}`)));
    }
  }
  try { setFlag(id, 'channels'); } catch {}
}

async function connect(id, entry) {
  const ctx = entry.ctx;
  const sessionFolder = path.join(SUBS_DIR, id);

  const { state, saveCreds } = useSqlAuthState(id);
  const version = await getVersion();
  if (global.SUBS_ACTIVE.get(id) !== entry) return;

  clearTimeout(entry.linkTimer);
  if (!state.creds.registered) {
    const left = ctx.linkDeadline - Date.now();
    if (left <= 0) return abandon(id);
    entry.linkTimer = setTimeout(() => abandon(id), left);
    ctx.codeSent = false;
  }

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.windows('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    keepAliveIntervalMs: 30_000,
    msgRetryCounterCache,
    userDevicesCache,
    getMessage: async (key) => entry.store.get(key.remoteJid + ':' + key.id),
  });
  entry.sock = sock;
  patchGroupMetadata(sock);

  const rememberMessage = (m) => {
    if (!m?.message || !m?.key?.id) return;
    entry.store.set(m.key.remoteJid + ':' + m.key.id, m.message);
    if (entry.store.size > MSG_LIMIT) entry.store.delete(entry.store.keys().next().value);
  };

  const baseSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const sent = await baseSendMessage(...args);
    rememberMessage(sent);
    return sent;
  };

  sock.isInit = false;
  sock.commandTriggered = ctx.isCommand;
  sock.triggerSender = ctx.senderId;
  sock.triggerChatId = ctx.chatId;
  sock.triggerClient = ctx.client;
  sock.triggerIsCode = ctx.isCode;
  sock.sessionFolder = sessionFolder;
  sock.sessionId = id;

  sock.ev.on('creds.update', saveCreds);

  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/.test(jid)) {
      const decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
    }
    return jid;
  };

  let bootTime = Date.now();
  let botReady = false;

  const processMessage = async (raw) => {
    try {
      if (!raw?.message || raw.key?.remoteJid === 'status@broadcast') return;
      const ts = Number(raw.messageTimestamp);
      if (ts && ts * 1000 < bootTime - 15_000) return;
      if (raw.message.ephemeralMessage) raw.message = raw.message.ephemeralMessage.message;
      raw.sender = sock.decodeJid(await resolveSender(sock, raw));
      const m = await smsg(sock, raw);
      if (typeof handler === 'function') await handler(sock, m);
    } catch (err) {
      console.error('[ ✿  ]  Main Sub »', err?.message || err);
    }
  };

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (!botReady || type !== 'notify') return;
    for (const raw of messages) {
      rememberMessage(raw);
      if (!raw?.message) continue;
      processMessage(raw);
    }
  });

  try { await events(sock, null); } catch (err) { console.log(chalk.gray(`[ EVENT ERROR  ]  → ${err}`)); }

  const handleQr = async (qr) => {
    const { client, msg, chatId, caption, isCode } = ctx;
    if (entry.linked || !client || !msg || !chatId) return;

    if (isCode) {
      if (ctx.codeSent) return;
      ctx.codeSent = true;
      try {
        let code = await sock.requestPairingCode(ctx.phone, getPairingCode());
        code = code.match(/.{1,4}/g)?.join('-') || code;
        const msg1 = await msg.reply(caption);
        const msg2 = await msg.reply(code);
        ctx.codeMsgs = [msg1, msg2];
        ctx.deleteTimer = scheduleDelete(client, chatId, ctx.codeMsgs);
      } catch (err) {
        ctx.codeSent = false;
        console.error('[Código Error]', err);
      }
      return;
    }

    try {
      if (ctx.qrMsg?.key) { try { await client.sendMessage(chatId, { delete: ctx.qrMsg.key }); } catch {} }
      ctx.qrMsg = await client.sendMessage(msg.chat, { image: await qrcode.toBuffer(qr, { scale: 8 }), caption }, { quoted: msg });
    } catch (err) {
      console.error('[QR Error]', err);
    }
  };

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, isNewLogin, qr }) => {
    if (isNewLogin) sock.isInit = false;
    if (qr) await handleQr(qr);

    if (connection === 'open') {
      bootTime = Date.now();
      botReady = true;
      entry.linked = true;
      entry.retries = 0;
      entry.fatal = 0;
      clearTimeout(entry.linkTimer);

      sock.uptime = Date.now();
      sock.isInit = true;
      sock.userId = cleanJid(sock.user?.id);

      const i = global.conns.findIndex((c) => c.userId === sock.userId);
      if (i >= 0) global.conns[i] = sock; else global.conns.push(sock);

      console.log(chalk.gray(`[ ✿  ]  SUB-BOT conectado: ${sock.userId}`));
      joinChannels(sock, id).catch(() => {});

      if (ctx.qrMsg?.key && ctx.client) {
        try { await ctx.client.sendMessage(ctx.chatId || ctx.msg.chat, { delete: ctx.qrMsg.key }); } catch {}
        ctx.qrMsg = null;
      }
      if (sock.commandTriggered && !getFlag(id, 'msg_sent') && ctx.client && ctx.msg) {
        try {
          await ctx.client.sendMessage(ctx.msg.chat, { text: `✎ Has conectado un nuevo socket de tipo *SUB BOT*.` }, { quoted: ctx.msg });
          setFlag(id, 'msg_sent');
          sock.commandTriggered = false;
        } catch (err) {
          console.error('[Aviso Sub Error]', err?.message || err);
        }
      }
    }

    if (connection === 'close') {
      const activeId = sock.sessionId || id;
      dispose(sock);
      removeFromConns(sock);
      if (global.SUBS_ACTIVE.get(activeId) !== entry) return;

      if (!sessionExists(activeId)) { stopSubBot(activeId); return; }

      const reason = lastDisconnect?.error?.output?.statusCode || 0;

      if (reason === DisconnectReason.connectionReplaced) {
        console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${activeId} reemplazado por otra conexión. Detenido.`));
        global.SUBS_STOPPED.add(activeId);
        stopSubBot(activeId);
        return;
      }

      if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.forbidden) {
        entry.fatal++;
        if (entry.fatal <= 3) {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${activeId} Conexión cerrada (código ${reason}) intento ${entry.fatal}/3 → Reintentando...`));
          scheduleRetry(activeId, 3000);
          return;
        }
        if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${activeId} Falló tras 3 intentos. Eliminando sesión.`));
          try { deleteSession(activeId); } catch (e) {}
        } else {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${activeId} restringido (403). Se conserva la sesión.`));
          global.SUBS_STOPPED.add(activeId);
        }
        stopSubBot(activeId);
        return;
      }

      if (reason === DisconnectReason.restartRequired) {
        scheduleRetry(activeId, 1000);
        return;
      }

      entry.retries++;
      scheduleRetry(activeId, backoff(entry.retries));
    }
  });
}

export async function startSubBot(
  msg,
  client,
  caption = '',
  isCode = false,
  phone = '',
  chatId = '',
  isCommand = false,
) {
  const id = phone || cleanJid(msg?.sender || '');
  if (!id) throw new Error('startSubBot: no se pudo determinar el id de la sesión');

  const active = global.SUBS_ACTIVE.get(id);
  if (active) return active.sock;
  global.SUBS_STOPPED.delete(id);

  const entry = {
    sock: null,
    ctx: {
      msg, client, caption, isCode, chatId, isCommand,
      phone: phone || id,
      senderId: msg?.sender,
      startedAt: Date.now(),
      linkDeadline: Date.now() + LINK_TIMEOUT_MS,
      codeSent: false,
      codeMsgs: null,
      deleteTimer: null,
      qrMsg: null,
    },
    retries: 0,
    fatal: 0,
    timer: null,
    linkTimer: null,
    linked: false,
    store: new Map(),
  };
  global.SUBS_ACTIVE.set(id, entry);

  try {
    await connect(id, entry);
  } catch (e) {
    stopSubBot(id);
    throw e;
  }
  return entry.sock;
}

function countSubs() {
  const pending = [...global.SUBS_ACTIVE.values()].filter((e) => !e.linked).length;
  return countLinked() + pending;
}

export default {
  command: ['code', 'qr'],
  category: 'socket',
  description: 'pide un codigo o qr para ser sub-bot',
  run: async ({ msg, sock: client, args, command }) => {
    const isCode = /^(code)$/.test(command);
    const isLid = msg.sender.endsWith('@lid');

    const user = await db.getUser(msg.sender);

    const senderNumber = msg.sender.replace(/[^0-9]/g, '');
    const isOwner = [].concat(global.owner || []).some((o) => String(o).replace(/[^0-9]/g, '') === senderNumber);

    // 1. Extraemos el teléfono si el usuario especificó uno como argumento
    let phone = args[0] ? args[0].replace(/\D/g, '') : '';

    // 2. Si no hay teléfono ingresado, aplicamos la resolución robusta de LID y emisor
    if (!phone) {
      if (isLid) {
        try {
          const alt = msg.key?.participantAlt || msg.key?.remoteJidAlt;
          if (typeof alt === 'string' && alt.endsWith('@s.whatsapp.net')) {
            phone = alt.split('@')[0].replace(/[^0-9]/g, '');
          } else {
            const pn = await client.signalRepository?.lidMapping?.getPNForLID?.(msg.sender);
            if (typeof pn === 'string' && pn.includes('@s.whatsapp.net')) {
              phone = pn.split('@')[0].replace(/[^0-9]/g, '');
            }
          }
        } catch (e) {}
      }
      if (!phone) {
        phone = msg.sender.split('@')[0].replace(/[^0-9]/g, '');
      }
    }

    const toCancel = new Set();
    for (const [id, e] of global.SUBS_ACTIVE) {
      if (!e.linked && e.ctx.senderId === msg.sender) toCancel.add(id);
    }

    if (phone) {
      const active = global.SUBS_ACTIVE.get(phone);
      if (active?.linked) {
        return client.reply(msg.chat, `✎ Ese número ya tiene un *SUB BOT* activo.`, msg);
      }
    }

    if (!isOwner) {
      const recent = [...toCancel]
        .map((id) => global.SUBS_ACTIVE.get(id)?.ctx.startedAt || 0)
        .find((t) => Date.now() - t < REPLACE_MIN_MS);
      if (recent) {
        return client.reply(
          msg.chat,
          `❖ Espera *${Math.ceil((REPLACE_MIN_MS - (Date.now() - recent)) / 1000)} segundos* antes de pedir otro código.`,
          msg,
        );
      }
    }

    const wait = (user.Subs || 0) + COOLDOWN_MS - Date.now();
    if (!isOwner && toCancel.size === 0 && wait > 0) {
      return client.reply(
        msg.chat,
        `❖ Debes esperar *${msToTime(wait)}* para volver a intentar vincular un socket.`,
        msg,
      );
    }

    for (const id of toCancel) await cancelPending(id);

    const maxSubs = global.maxSubs || MAX_SUBS_DEFAULT;
    const subsCount = countSubs();

    if (subsCount >= maxSubs) {
      return client.reply(
        msg.chat,
        `✎ Se ha alcanzado el límite de conexiones (${subsCount}/${maxSubs}) para registrar un \`Sub-Bot\`.`,
        msg,
      );
    }

    const rtx = '`✤` Vincula tu *cuenta* usando el *codigo.*\n\n> ✥ Sigue las *instrucciones*\n\n*›* Click en los *3 puntos*\n*›* Toque *dispositivos vinculados*\n*›* Vincular *nuevo dispositivo*\n*›* Selecciona *Vincular con el número de teléfono*';
    const rtx2 = "`✤` Vincula tu *cuenta* usando *codigo qr.*\n\n> ✥ Sigue las *instrucciones*\n\n*›* Click en los *3 puntos*\n*›* Toque *dispositivos vinculados*\n*›* Vincular *nuevo dispositivo*\n*›* Escanea el código *QR.*";

    const caption = isCode ? rtx : rtx2;

    await startSubBot(msg, client, caption, isCode, phone, msg.chat, true);

    if (!isOwner) await db.updateUser(msg.sender, 'Subs', Date.now());
  }
};

async function cancelPending(id) {
  const entry = global.SUBS_ACTIVE.get(id);
  if (!entry || entry.linked) return false;
  const { client, msg, chatId, qrMsg, codeMsgs, deleteTimer } = entry.ctx;
  clearTimeout(deleteTimer);
  stopSubBot(id);
  try { deleteSession(id); } catch {}
  if (client && (chatId || msg?.chat)) {
    for (const m of [...(codeMsgs || []), qrMsg]) {
      try { if (m?.key) await client.sendMessage(chatId || msg.chat, { delete: m.key }); } catch {}
    }
  }
  return true;
}

function msToTime(duration) {
  const seconds = Math.max(0, Math.ceil(duration / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes) return `${minutes} minuto${minutes > 1 ? 's' : ''}, ${rest} segundo${rest !== 1 ? 's' : ''}`;
  return `${rest} segundo${rest !== 1 ? 's' : ''}`;
}
