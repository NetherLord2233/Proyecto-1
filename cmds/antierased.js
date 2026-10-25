import fs from 'fs';
import path from 'path';
import pino from 'pino';
import chalk from 'chalk';
import db from '#db';
import { downloadMediaMessage, normalizeMessageContent, getContentType } from 'baileys';

// ═══════════════════════════════════════════════════════════════════════════
//  ANTI-ERASED (cmds/antierased.js)
//  Cuando alguien elimina SU PROPIO mensaje en un grupo con el interruptor activado
//  (#antierased enable), el bot cita el mensaje original, etiqueta a la persona y
//  reenvía el contenido: texto, imagen, video, audio, sticker, documento, contacto o ubicación.
//
//  Se registra desde events.js:  registerAntierased(sock)
// ═══════════════════════════════════════════════════════════════════════════

const TTL_MS = 30 * 60 * 1000;               // cuánto tiempo se recuerda un mensaje
const MAX_ENTRIES = 1500;                    // mensajes recordados por bot
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;    // archivos más grandes no se guardan por adelantado
const RECOVER_VIEW_ONCE = false;             // true = también reenvía los de "ver una vez"
const INCLUDE_OTHERS_DELETES = false;        // true = también cuando un admin borra el mensaje de OTRO

// El index limpia ./tmp cada hora (archivos de más de 30 min), por eso TTL_MS = 30 min.
const DIR = path.join(import.meta.dirname, '..', 'tmp', 'antierased');

const TEXT_TYPES = new Set(['conversation', 'extendedTextMessage']);
const MEDIA_TYPES = new Set(['imageMessage', 'videoMessage', 'ptvMessage', 'audioMessage', 'stickerMessage', 'documentMessage']);
const OTHER_TYPES = new Set(['contactMessage', 'contactsArrayMessage', 'locationMessage']);

const NOUN = {
  conversation: 'un mensaje',
  extendedTextMessage: 'un mensaje',
  imageMessage: 'una imagen',
  videoMessage: 'un video',
  ptvMessage: 'un video',
  audioMessage: 'un audio',
  stickerMessage: 'un sticker',
  documentMessage: 'un documento',
  contactMessage: 'un contacto',
  contactsArrayMessage: 'unos contactos',
  locationMessage: 'una ubicación',
};

const VIEW_ONCE_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
const REVOKE_STUB = 1;      // WebMessageInfo.StubType.REVOKE (evento messages.update)
const REVOKE_PROTOCOL = 0;  // ProtocolMessage.Type.REVOKE (mensaje de protocolo)

const logger = pino({ level: 'silent' });

// Un almacén por bot (sobrevive a las reconexiones del mismo bot)
global.ANTIERASED_STORES ||= new Map();

const userPart = (jid = '') => String(jid).split('@')[0].split(':')[0];
const idsOf = (key) => [key?.participant, key?.participantAlt].filter(Boolean).map(userPart);

function isViewOnce(message) {
  let m = message;
  for (let i = 0; i < 4 && m; i++) {
    if (VIEW_ONCE_KEYS.some((k) => m[k])) return true;
    m = m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message || null;
  }
  return false;
}

function classify(message) {
  const content = normalizeMessageContent(message);
  if (!content) return null;
  const type = getContentType(content);
  if (!type) return null;
  return { content, type, viewOnce: isViewOnce(message) || !!content[type]?.viewOnce };
}

function dropEntry(store, k) {
  const e = store.get(k);
  store.delete(k);
  if (e?.file) fs.promises.unlink(e.file).catch(() => {});
}

function sweep(store) {
  const now = Date.now();
  for (const k of store.keys()) {
    if (now - store.get(k).at <= TTL_MS) break; // el Map está en orden cronológico
    dropEntry(store, k);
  }
}

export function registerAntierased(sock) {
  if (sock.__antierasedRegistered) return;
  sock.__antierasedRegistered = true;

  const botJid = () => (sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '');
  const getStore = () => {
    const id = botJid() || 'default';
    if (!global.ANTIERASED_STORES.has(id)) global.ANTIERASED_STORES.set(id, new Map());
    return global.ANTIERASED_STORES.get(id);
  };

  // Mismas reglas que antilink: interruptor del chat, modo self, bot primario (y chat silenciado)
  async function isActive(chatId) {
    const chat = await db.getChat(chatId);
    if (!chat?.antierased) return false;
    const botId = botJid();
    const botSettings = await db.getSettings(botId);
    if (botSettings?.self) return false;
    if (chat.isMute) return false;
    if (chat.primaryBot && chat.primaryBot !== botId) return false;
    return true;
  }

  async function resolveAuthor(raw) {
    const p = raw.key?.participant;
    if (!p) return null;
    if (!p.endsWith('@lid')) return p.replace(/:\d+@/, '@');
    try {
      const alt = raw.key.participantAlt;
      if (typeof alt === 'string' && alt.endsWith('@s.whatsapp.net')) return alt.replace(/:\d+@/, '@');
      const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(p);
      if (typeof pn === 'string' && pn.includes('@s.whatsapp.net')) return pn.replace(/:\d+@/, '@');
    } catch {}
    return p.replace(/:\d+@/, '@');
  }

  const download = (raw) =>
    downloadMediaMessage(raw, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });

  // Guarda el mensaje (y su archivo, si pesa poco) por si lo borran
  async function capture(msg) {
    const key = msg?.key;
    const chatId = key?.remoteJid;
    if (!msg?.message || !key?.id || key.fromMe || !chatId?.endsWith('@g.us')) return;

    const info = classify(msg.message);
    if (!info) return;
    const { type, content, viewOnce } = info;
    if (!TEXT_TYPES.has(type) && !MEDIA_TYPES.has(type) && !OTHER_TYPES.has(type)) return;
    if (viewOnce && !RECOVER_VIEW_ONCE) return;
    if (!(await isActive(chatId))) return;

    const store = getStore();
    sweep(store);
    while (store.size >= MAX_ENTRIES) dropEntry(store, store.keys().next().value);

    const entry = { raw: msg, type, ids: idsOf(key), at: Date.now(), file: null, ready: null };
    store.set(chatId + ':' + key.id, entry);

    if (MEDIA_TYPES.has(type)) {
      const size = Number(content[type]?.fileLength || 0);
      if (size <= MAX_MEDIA_BYTES) {
        entry.ready = (async () => {
          try {
            const buffer = await download(msg);
            fs.mkdirSync(DIR, { recursive: true });
            const file = path.join(DIR, String(key.id).replace(/[^\w-]/g, '_') + '.bin');
            await fs.promises.writeFile(file, buffer);
            entry.file = file;
          } catch {
            // si no se pudo ahora, se intentará de nuevo al recuperar
          }
        })();
        await entry.ready;
      }
    }
  }

  async function sendHeaderAnd(chatId, entry, header, mentions, content) {
    const opts = { quoted: entry.raw };
    if (content) {
      await sock.sendMessage(chatId, { text: header, mentions }, opts);
      await sock.sendMessage(chatId, content, opts);
    } else {
      await sock.sendMessage(chatId, { text: header, mentions }, opts);
    }
  }

  async function recover(chatId, entry) {
    const authorJid = await resolveAuthor(entry.raw);
    const mentions = authorJid ? [authorJid] : [];
    const who = authorJid ? `@${userPart(authorJid)}` : 'Alguien';
    const header = `「✎」 *${who}* eliminó ${NOUN[entry.type] || 'un mensaje'}.`;
    const opts = { quoted: entry.raw };

    const content = normalizeMessageContent(entry.raw.message);
    const m = content?.[entry.type];
    if (!m) return;

    // Texto
    if (TEXT_TYPES.has(entry.type)) {
      const text = content.conversation || content.extendedTextMessage?.text || '';
      return sock.sendMessage(chatId, { text: `${header}\n\n${text}`, mentions }, opts);
    }

    // Contactos y ubicación
    if (entry.type === 'contactMessage') {
      return sendHeaderAnd(chatId, entry, header, mentions, {
        contacts: { displayName: m.displayName, contacts: [{ vcard: m.vcard }] },
      });
    }
    if (entry.type === 'contactsArrayMessage') {
      return sendHeaderAnd(chatId, entry, header, mentions, {
        contacts: { displayName: m.displayName, contacts: (m.contacts || []).map((c) => ({ vcard: c.vcard })) },
      });
    }
    if (entry.type === 'locationMessage') {
      return sendHeaderAnd(chatId, entry, header, mentions, {
        location: { degreesLatitude: m.degreesLatitude, degreesLongitude: m.degreesLongitude, name: m.name },
      });
    }

    // Archivos: primero el guardado, si no se intenta bajar de nuevo
    let buffer = null;
    if (entry.file) { try { buffer = await fs.promises.readFile(entry.file); } catch {} }
    if (!buffer) { try { buffer = await download(entry.raw); } catch {} }
    if (!buffer) {
      return sock.sendMessage(chatId, { text: `${header}\n\n> No se pudo recuperar el archivo.`, mentions }, opts);
    }

    const caption = m.caption ? `${header}\n\n${m.caption}` : header;

    switch (entry.type) {
      case 'imageMessage':
        return sock.sendMessage(chatId, { image: buffer, caption, mentions }, opts);
      case 'videoMessage':
        return sock.sendMessage(chatId, { video: buffer, caption, mentions, mimetype: m.mimetype, gifPlayback: !!m.gifPlayback }, opts);
      case 'ptvMessage':
        return sock.sendMessage(chatId, { video: buffer, caption, mentions, ptv: true }, opts);
      case 'documentMessage':
        return sock.sendMessage(chatId, { document: buffer, caption, mentions, mimetype: m.mimetype, fileName: m.fileName }, opts);
      case 'audioMessage':
        return sendHeaderAnd(chatId, entry, header, mentions, {
          audio: buffer, mimetype: m.mimetype || 'audio/mpeg', ptt: !!m.ptt, seconds: m.seconds,
        });
      case 'stickerMessage':
        return sendHeaderAnd(chatId, entry, header, mentions, { sticker: buffer });
    }
  }

  // Se llama por cada mensaje eliminado (llega por messages.update y por el mensaje de protocolo)
  async function onRevoke(chatId, deletedId, revokeKey) {
    if (!chatId?.endsWith('@g.us') || !deletedId || revokeKey?.fromMe) return; // fromMe = lo borró el propio bot (p. ej. antilink)
    const store = getStore();
    const k = chatId + ':' + deletedId;
    const entry = store.get(k);
    if (!entry) return;
    store.delete(k); // evita enviarlo dos veces

    try {
      await entry.ready;

      const revoker = idsOf(revokeKey);
      const isOwn = !revoker.length || revoker.some((id) => entry.ids.includes(id));
      if (!isOwn && !INCLUDE_OTHERS_DELETES) return;
      if (!(await isActive(chatId))) return;

      await recover(chatId, entry);
    } finally {
      if (entry.file) fs.promises.unlink(entry.file).catch(() => {});
    }
  }

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        const protocol = normalizeMessageContent(msg.message)?.protocolMessage;
        if (protocol?.type === REVOKE_PROTOCOL && protocol.key?.id) {
          await onRevoke(msg.key?.remoteJid, protocol.key.id, msg.key);
        } else {
          await capture(msg);
        }
      } catch (err) {
        console.log(chalk.gray(`[ ANTIERASED ERROR ] → ${err?.message || err}`));
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates) {
      if (update?.messageStubType !== REVOKE_STUB) continue;
      try {
        await onRevoke(key?.remoteJid, key?.id, update.key || key);
      } catch (err) {
        console.log(chalk.gray(`[ ANTIERASED ERROR ] → ${err?.message || err}`));
      }
    }
  });
}