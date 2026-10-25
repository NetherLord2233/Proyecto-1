import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'database.db');

if (!global.__db_instance) {
  global.__db_instance = new DatabaseSync(DB_PATH);
  global.__db_instance.exec('PRAGMA journal_mode = WAL;');
  global.__db_instance.exec('PRAGMA busy_timeout = 5000;');
}

const db = global.__db_instance;

export const defUser = {
  name: '', exp: 0, sugCooldown: 0, level: 0, Subs: 0, usedcommands: 0,
  pasatiempo: '', description: '', marry: '', genre: '', birth: '', metadatos: null, metadatos2: null
};
export const defChat = {
  bannedGrupo: 1, welcomeMessage: '', byeMessage: '', welcome: 0, goodbye: 0, nsfw: 0, alerts: 0,
  gacha: 1, rpg: 1, adminonly: 0, expulsar: 0, warnLimit: 0, primaryBot: null, antilinks: 1, antistatus: 0,
  anticall: 0, personajesReservados: [], intercambios: [], timeTrade: 0, scheduledActions: [], groupOpenStatus: 0
};
export const defChatUser = {
  coins: 0, bank: 0, lastdungeon: 0, lasthunt: 0, lastfish: 0, lastslot: 0, dailyStreak: 0,
  characters: [], personajesEnVenta: [], crimeCooldown: 0, mineCooldown: 0, ritualCooldown: 0, workCooldown: 0,
  rtCooldown: 0, slutCooldown: 0, roboCooldown: 0, pptCooldown: 0, lastDaily: 0, voteCooldown: 0, rwCooldown: 0, buyCooldown: 0,
  stats: {}, usedTime: null, warnings: [], muted: 0, mutedReason: ''
};
export const defSets = {
  self: 0, prefijo: ['/', '#', '.'], commandsejecut: 0, type: 'Sub', link: 'https://api.stellarwa.xyz',
  banner: 'https://cdn.evogb.org/Bryan/IsxIE-IMG-20261020-WA1265.jpg',
  icon: 'https://cdn.evogb.org/Bryan/SrGf8-IMG-20261020-WA1269.jpg',
  currency: '¥', namebot: 'Elaina', namebot2: 'Elaina', owner: '𝐴𝑒𝑡ℎ𝑒𝑟 𝐿𝐴𝐵𝑆'
};
export const defStickerPack = { packs: [] };

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS chat_users (key TEXT PRIMARY KEY, chat_id TEXT, user_id TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS sticker_packs (id TEXT PRIMARY KEY, data TEXT);
  `);
}
initDB();

const parse = (d, def) => ({...def,...JSON.parse(d) });
const save = (table, id, obj) => db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?,?)`).run(id, JSON.stringify(obj));
const saveCU = (key, chat_id, user_id, obj) => db.prepare(`INSERT OR REPLACE INTO chat_users (key, chat_id, user_id, data) VALUES (?,?,?,?)`).run(key, chat_id, user_id, JSON.stringify(obj));

export function getUser(id, opt = {}) {
  if (!id) {
    let users = db.prepare(`SELECT data FROM users`).all().map(r => parse(r.data, defUser));
    if (opt.orderBy) users.sort((a,b) => (opt.desc!== false? (b[opt.orderBy]||0)-(a[opt.orderBy]||0) : (a[opt.orderBy]||0)-(b[opt.orderBy]||0)));
    return users;
  }
  const row = db.prepare(`SELECT data FROM users WHERE id =?`).get(id);
  if (!row) { const n = {...defUser, id }; save('users', id, n); return n; }
  return parse(row.data, defUser);
}
export function updateUser(id, field, val) {
  const u = getUser(id); u[field] = val; save('users', id, u); return true;
}

export function getChat(id) {
  if (!id) return db.prepare(`SELECT data FROM chats`).all().map(r => parse(r.data, defChat));
  const row = db.prepare(`SELECT data FROM chats WHERE id =?`).get(id);
  if (!row) { const n = {...defChat, id }; save('chats', id, n); return n; }
  return parse(row.data, defChat);
}
export function updateChat(id, field, val) {
  const c = getChat(id); c[field] = val; save('chats', id, c); return true;
}

export function getChatUser(chatId, userId, opt = {}) {
  if (!chatId) return db.prepare(`SELECT data FROM chat_users`).all().map(r => parse(r.data, defChatUser));
  if (!userId) {
    let users = db.prepare(`SELECT data FROM chat_users WHERE chat_id =?`).all(chatId).map(r => parse(r.data, defChatUser));
    if (opt.orderBy) users.sort((a,b) => (opt.desc!== false? (b[opt.orderBy]||0)-(a[opt.orderBy]||0) : (a[opt.orderBy]||0)-(b[opt.orderBy]||0)));
    return users;
  }
  const key = `${chatId}:${userId}`;
  const row = db.prepare(`SELECT data FROM chat_users WHERE key =?`).get(key);
  if (!row) { const n = {...defChatUser, chat_id: chatId, user_id: userId }; saveCU(key, chatId, userId, n); return n; }
  return parse(row.data, defChatUser);
}
export function updateChatUser(chatId, userId, field, val) {
  const cu = getChatUser(chatId, userId); cu[field] = val; saveCU(`${chatId}:${userId}`, chatId, userId, cu); return true;
}

export function getSettings(id) {
  const row = db.prepare(`SELECT data FROM settings WHERE id =?`).get(id);
  if (!row) { const n = {...defSets, id }; save('settings', id, n); return n; }
  return parse(row.data, defSets);
}
export function updateSettings(id, field, val) {
  const s = getSettings(id); s[field] = val; save('settings', id, s); return true;
}

export function getStickersPack(id) {
  if (!id) return db.prepare(`SELECT data FROM sticker_packs`).all().map(r => parse(r.data, defStickerPack));
  const row = db.prepare(`SELECT data FROM sticker_packs WHERE id =?`).get(id);
  if (!row) { const n = {...defStickerPack, id }; save('sticker_packs', id, n); return n; }
  return parse(row.data, defStickerPack);
}
export function updateStickersPack(id, field, val) {
  const p = getStickersPack(id); p[field] = val; save('sticker_packs', id, p); return true;
}

export function deletedb(type,...ids) {
  if (type === 'user') db.prepare(`DELETE FROM users WHERE id =?`).run(ids[0]);
  if (type === 'chat') db.prepare(`DELETE FROM chats WHERE id =?`).run(ids[0]);
  if (type === 'chatuser') db.prepare(`DELETE FROM chat_users WHERE key =?`).run(`${ids[0]}:${ids[1]}`);
  if (type === 'settings') db.prepare(`DELETE FROM settings WHERE id =?`).run(ids[0]);
  if (type === 'stickerpack') db.prepare(`DELETE FROM sticker_packs WHERE id =?`).run(ids[0]);
  return true;
}
export function setCreate(table, identifier, field, value) {
  if (table === 'chat_users') {
    const [c,u] = identifier; const data = getChatUser(c,u);
    if (!(field in data)) { data[field]=value; saveCU(`${c}:${u}`, c, u, data); }
    return data[field];
  }
  const fn = table === 'users'? getUser : table === 'chats'? getChat : getSettings;
  const data = fn(identifier);
  if (!(field in data)) { data[field]=value; save(table, identifier, data); }
  return data[field];
}
export function clearCache() { return true; }

export default { initDB, getUser, updateUser, getChat, updateChat, getChatUser, updateChatUser, getSettings, updateSettings, getStickersPack, updateStickersPack, deletedb, setCreate, clearCache, db };
