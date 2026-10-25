import db from '#db';
import { sendHidetag } from '../../lib/hidetag.js';

const BATCH_SIZE = 5;          // Usuarios por llamada a groupParticipantsUpdate
const BATCH_DELAY = 3000;      // Pausa entre lotes (ms)
const INACTIVE_DAYS = 30;
const REQUIRE_CONFIRM = true;  // Acciones masivas piden "confirmar" al final
const DEFAULT_REASON = 'Sin motivo especificado';
const MAX_REASON = 500;

const running = new Set();     // Chats con una eliminación masiva en curso

const sleep = ms => new Promise(r => setTimeout(r, ms));

const base = jid => {
  if (typeof jid !== 'string') return '';
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
};

const idsOf = p => [p?.id, p?.lid, p?.phoneNumber, p?.jid].map(base).filter(Boolean);

const isAdmin = p => p?.admin === 'admin' || p?.admin === 'superadmin';

const phoneOf = p => {
  const jid = [p?.phoneNumber, p?.jid, p?.id].find(j => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
  return jid ? base(jid) : base(p?.id || '');
};

const tagList = jids => jids.map(j => `⭔ @${base(j)}`).join('\n');

// ── Jerarquía de Rangos ───────────────────────────────────────────────────────
const ROLES = {
  user: 0,
  invitado: 1,
  staff: 2,
  dev: 3,
  owner: 4,
  root: 5
};

function getUserRole(p) {
  if (!p) return 'user';
  const cleanNums = idsOf(p);
  const uniqueNums = [...new Set(cleanNums)];

  for (const num of uniqueNums) {
    if (!num) continue;
    
    // 1. Verificación del ROOT (vía global.protectedOwner del index.js)
    const rootNum = String(global.protectedOwner || '').replace(/\D/g, '');
    if (rootNum && (num === rootNum || num.endsWith('128178894') || rootNum.endsWith(num))) {
      return 'root';
    }
    if (num.endsWith('128178894')) return 'root';

    // 2. Verificación en Owners globales (vía global.owner del index.js)
    const owners = [].concat(global.owner ?? []).flat(Infinity).map(o => String(o).replace(/\D/g, ''));
    if (owners.includes(num)) {
      return 'owner';
    }

    // 3. Verificación en Base de Datos (db / global.db)
    try {
      const database = global.db || db;
      const userDb = 
        database?.getUser?.(num) || 
        database?.getUser?.(`${num}@s.whatsapp.net`) || 
        database?.data?.users?.[num] || 
        database?.data?.users?.[`${num}@s.whatsapp.net`] ||
        (p?.id && database?.getUser?.(p.id));

      if (userDb) {
        const roleVal = userDb.role || userDb.rango || userDb.nivel || userDb.level;
        if (roleVal && typeof roleVal === 'string') {
          const lower = roleVal.toLowerCase();
          if (ROLES[lower] !== undefined) return lower;
        }
      }
    } catch {}
  }

  // 4. Verificación en propiedades directas del objeto participante
  for (const prop of [p.role, p.rango, p.nivel, p.level]) {
    if (prop && typeof prop === 'string') {
      const lower = prop.toLowerCase();
      if (ROLES[lower] !== undefined) return lower;
    }
  }

  return 'user';
}

const PROTECTED = {
  bot: { full: '《✧》 No puedo eliminar al *bot* del grupo', short: 'es el bot' },
  groupOwner: { full: '《✧》 No puedo eliminar al *propietario* del grupo', short: 'propietario del grupo' },
  role: { full: '《✧》 El usuario posee un *rango protegido* e inmune (Invitado o superior)', short: 'rango protegido' }
};

function buildProtector({ sock, participants, groupMetadata }) {
  const botIds = new Set([base(sock.decodeJid(sock.user?.id)), base(sock.user?.lid)].filter(Boolean));
  
  const groupOwners = new Set(
    [base(groupMetadata?.owner), base(groupMetadata?.ownerPn),
      ...participants.filter(p => p.admin === 'superadmin').flatMap(idsOf)].filter(Boolean)
  );

  return p => {
    const ids = idsOf(p);
    
    // 1. Inmunidad del Bot
    if (ids.some(i => botIds.has(i))) return 'bot';
    
    // 2. Inmunidad del Propietario del Grupo
    if (ids.some(i => groupOwners.has(i))) return 'groupOwner';

    // 3. Inmunidad Absoluta a partir de Invitado (Nivel >= 1)
    const roleName = getUserRole(p);
    const roleLevel = ROLES[roleName] ?? 0;

    if (roleLevel >= ROLES.invitado) {
      return 'role';
    }

    return null;
  };
}

const failText = status => {
  const s = String(status);
  if (s === '403') return 'sin permisos';
  if (s === '406') return 'no permitido';
  if (s === '404') return 'no está en el grupo';
  return `código ${s}`;
};

async function removeUsers(sock, chat, jids) {
  const removed = [];
  const errors = [];
  for (let i = 0; i < jids.length; i += BATCH_SIZE) {
    const batch = jids.slice(i, i + BATCH_SIZE);
    try {
      const res = await sock.groupParticipantsUpdate(chat, batch, 'remove');
      const results = Array.isArray(res) ? res : [];
      const resultMap = new Map(results.map(x => [x?.jid, String(x?.status)]));

      for (const jid of batch) {
        const status = resultMap.get(jid);
        if (!status || status === '200') removed.push(jid);
        else errors.push(`@${base(jid)}: ${failText(status)}`);
      }
    } catch (e) {
      for (const jid of batch) errors.push(`@${base(jid)}: ${e.message}`);
    }
    if (i + BATCH_SIZE < jids.length) await sleep(BATCH_DELAY);
  }
  return { removed, errors };
}

async function execMass({ msg, sock, jids, skipped, title, confirmed, retryCmd }) {
  if (REQUIRE_CONFIRM && !confirmed) {
    return msg.reply(`《✧》 Se eliminarán *${jids.length}* usuarios (${title}).\n> Para continuar, repite el comando agregando *confirmar* al final:\n> *${retryCmd} confirmar*`);
  }
  if (running.has(msg.chat)) return msg.reply('《✧》 Ya hay un proceso de eliminación en curso en este grupo.');
  running.add(msg.chat);
  try {
    await msg.reply(`《✧》 *Eliminando ${title}* (${jids.length})\n> El proceso tomará unos segundos...`);
    const { removed, errors } = await removeUsers(sock, msg.chat, jids);
    let res = `《✧》 Proceso completado.\n> Usuarios eliminados: *${removed.length}*`;
    if (skipped > 0) res += `\n> Usuarios omitidos (admins/protegidos/rangos): *${skipped}*`;
    if (errors.length) res += `\n> Errores: *${errors.length}*\n${errors.join('\n')}`;
    return msg.reply(res);
  } finally {
    running.delete(msg.chat);
  }
}

export default {
  command: ['kick', 'ban', 'bang'],
  category: 'group',
  description: 'Expulsar a uno o varios usuarios del grupo con protección absoluta de rangos.',
  isAdmin: true,
  botAdmin: true,
  run: async ({ msg, sock, args, usedPrefix, command, groupMetadata, participants = [] }) => {
    try {
      const protect = buildProtector({ sock, participants, groupMetadata });
      const sub = args[0]?.toLowerCase();
      const confirmed = args[args.length - 1]?.toLowerCase() === 'confirmar';
      const cmd = usedPrefix + command;

      // ── Por prefijo de país ──────────────────────────────────────────────
      if (sub === 'num' || sub === 'listnum') {
        const prefix = (args[1] || '').replace(/\+/g, '');
        if (!/^\d{1,4}$/.test(prefix)) {
          return msg.reply(`《✧》 Ingrese algún prefijo de un país\n> ✎ Ejemplo: *${cmd} num +54*`);
        }
        const matches = participants.filter(p => p.id && phoneOf(p).startsWith(prefix));
        if (!matches.length) return msg.reply(`《✧》 Aquí no hay ningún número con el prefijo +${prefix}`);

        if (sub === 'listnum') {
          const ids = matches.map(p => p.id);
          return sock.reply(msg.chat, `《✧》 *Lista de usuarios con prefijo +${prefix}* (${ids.length})\n\n${tagList(ids)}`, msg, { mentions: ids });
        }

        const toKick = matches.filter(p => !isAdmin(p) && !protect(p)).map(p => p.id);
        if (!toKick.length) return msg.reply(`《✧》 Hay usuarios con prefijo +${prefix} pero todos son admins o usuarios protegidos.`);

        return execMass({
          msg, sock, jids: toKick, skipped: matches.length - toKick.length, confirmed,
          title: `usuarios con prefijo +${prefix}`, retryCmd: `${cmd} num +${prefix}`,
        });
      }

      // ── Todos ────────────────────────────────────────────────────────────
      if (sub === 'all') {
        const toKick = participants.filter(p => p.id && !isAdmin(p) && !protect(p)).map(p => p.id);
        if (!toKick.length) return msg.reply('《✧》 No hay usuarios para eliminar (todos son admins o cuentan con rangos protegidos).');
        
        return execMass({
          msg, sock, jids: toKick, skipped: participants.length - toKick.length, confirmed,
          title: 'todos los usuarios', retryCmd: `${cmd} all`,
        });
      }

      // ── Inactivos ────────────────────────────────────────────────────────
      if (sub === 'inactive' || sub === 'listinactive') {
        const cutoff = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
        const activeUsersSet = new Set();

        const dbUsers = (typeof db.getChatUser === 'function' ? db.getChatUser(msg.chat) : null) || [];
        for (const u of dbUsers) {
          const key = base(u.user_id);
          if (!key) continue;
          const hasActivity = Object.entries(u.stats || {}).some(
            ([date, d]) => Date.parse(date) >= cutoff && (d?.msgs || 0) > 0
          );
          if (hasActivity) activeUsersSet.add(key);
        }

        const inactive = participants
          .filter(p => {
            if (!p.id || isAdmin(p) || protect(p)) return false;
            const pIds = idsOf(p);
            return !pIds.some(i => activeUsersSet.has(i));
          })
          .map(p => p.id);

        if (!inactive.length) return msg.reply('《✧》 Este grupo es activo, no tiene inactivos expulsables.');

        if (sub === 'listinactive') {
          return sock.reply(msg.chat, `《✧》 *Lista de inactivos* (${inactive.length})\n\n${tagList(inactive)}`, msg, { mentions: inactive });
        }

        return execMass({
          msg, sock, jids: inactive, skipped: participants.length - inactive.length, confirmed,
          title: 'usuarios inactivos', retryCmd: `${cmd} inactive`,
        });
      }

      // ── Baneo individual o por lista ─────────────────────────────────────
      const mentioned = [...new Set(msg.mentionedJid || [])];
      const quotedSender = msg.quoted?.sender;
      const rawTargets = mentioned.length ? mentioned : (quotedSender ? [quotedSender] : []);

      if (!rawTargets.length) {
        return msg.reply(`《✧》 Por favor, Etiqueta o responde al *mensaje* de la *persona* que quieres eliminar.\n\n✎ *Razón opcional:*\n> *${cmd} @usuario @usuario2 <motivo>*\n\n✎ *Opciones especiales:*\n> *${cmd} num +57* - Eliminar todos los usuarios con prefijo +57\n> *${cmd} listnum +56* - Listar usuarios con prefijo +56\n> *${cmd} all* - Eliminar todos los usuarios\n> *${cmd} inactive* - Eliminar usuarios inactivos últimos (${INACTIVE_DAYS} días)\n> *${cmd} listinactive* - Listar usuarios inactivos\n\n> Las acciones masivas piden agregar *confirmar* al final.`);
      }

      // Filtro limpio de razón excluyendo menciones y tokens de comando
      const rawMentionBases = new Set(rawTargets.map(base));
      const reasonArgs = args.filter(a => !rawMentionBases.has(base(a)) && !a.startsWith('@'));
      const reason = reasonArgs.join(' ').trim().slice(0, MAX_REASON) || DEFAULT_REASON;

      const targets = new Map();
      const omitted = [];

      for (const raw of rawTargets) {
        const b = base(raw);
        const p = participants.find(x => idsOf(x).includes(b));
        if (!p) {
          omitted.push({ raw, b, full: `《✧》 *@${b}* ya no está en el grupo.`, short: 'ya no está en el grupo' });
          continue;
        }
        const why = protect(p);
        if (why) {
          omitted.push({ raw, b, full: PROTECTED[why].full, short: PROTECTED[why].short });
          continue;
        }
        targets.set(p.id, p);
      }

      if (!targets.size) {
        if (omitted.length === 1) return sock.reply(msg.chat, omitted[0].full, msg, { mentions: [omitted[0].raw] });
        return sock.reply(
          msg.chat,
          `《✧》 No se pudo banear a nadie:\n\n${omitted.map(o => `⭔ @${o.b} (${o.short})`).join('\n')}`,
          msg, { mentions: omitted.map(o => o.raw) }
        );
      }

      if (omitted.length) {
        await sock.reply(
          msg.chat,
          `《✧》 Se omitieron:\n\n${omitted.map(o => `⭔ @${o.b} (${o.short})`).join('\n')}`,
          msg, { mentions: omitted.map(o => o.raw) }
        );
      }

      const jids = [...targets.keys()];

      // 1) Aviso previo con hidetag
      let noticeError = null;
      try {
        const notice = `《✧》 *${jids.length > 1 ? 'Usuarios baneados' : 'Usuario baneado'}*\n\n${jids.map(j => `@${base(j)}`).join(' ')}\n\n> ✎ Razón: *${reason}*`;
        await sendHidetag(sock, msg.chat, participants, { text: notice });
      } catch (e) {
        noticeError = e.message;
      }

      // 2) Eliminación efectiva
      const { errors } = await removeUsers(sock, msg.chat, jids);

      if (errors.length || noticeError) {
        let res = '';
        if (noticeError) res += `《✧》 No se pudo enviar el aviso de baneo.\n> [Error: *${noticeError}*]`;
        if (errors.length) res += `${res ? '\n\n' : ''}《✧》 No se pudo eliminar a:\n${errors.join('\n')}`;
        return sock.reply(res);
      }
    } catch (e) {
      return msg.reply(`> Ocurrió un error inesperado al ejecutar el comando *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  },
};
