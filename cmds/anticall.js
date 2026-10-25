import db from '#db'
import { getCachedMeta, setCachedMeta } from '#serialize'

const KICK_ALL_ON_AMBIGUOUS = true

const num = (jid = '') => String(jid).split('@')[0].split(':')[0]
const matches = (p, jid) => {
  const n = num(jid)
  return !!n && [p.id, p.lid, p.jid, p.phoneNumber].some(x => x && num(x) === n)
}

const findMember = (meta, ids) => {
  if (!meta?.participants) return null
  for (const id of ids) {
    const found = meta.participants.find(p => matches(p, id))
    if (found) return found
  }
  return null
}

let stubNames = null
async function getStubNames() {
  if (stubNames) return stubNames
  stubNames = {}
  try {
    const { proto } = await import('baileys')
    for (const [name, value] of Object.entries(proto?.WebMessageInfo?.StubType || {})) stubNames[value] = name
  } catch {}
  return stubNames
}

const ORDINARY = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage',
  'documentMessage', 'reactionMessage', 'protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo', 'contactMessage',
  'locationMessage', 'pollCreationMessage', 'pollUpdateMessage', 'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']

const registered = new WeakSet()
const recent = new Map()
const pendingCalls = new Map()
const lastUserActivity = new Map()

/**
 * Filtra los grupos descartando aquellos donde:
 * - El anticall está desactivado en la BD
 * - El bot no es el primaryBot
 * - El bot NO es administrador
 * - El llamador ES administrador (inmune)
 */
async function getPunishableGroups(sock, ids, groups) {
  const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net'
  const botLid = sock.user?.lid
  const validGroups = []

  for (const g of groups) {
    const chat = await db.getChat(g.id)
    if (!chat?.anticall) continue
    if (chat.primaryBot && chat.primaryBot !== botId) continue

    let meta = getCachedMeta(g.id)
    if (!meta) {
      meta = await sock.groupMetadata(g.id).catch(() => null)
      if (meta) setCachedMeta(g.id, meta)
    }
    if (!meta) continue

    const caller = findMember(meta, ids)
    const bot = meta.participants.find(p => matches(p, botId) || matches(p, botLid))

    if (!caller || caller.admin) continue 
    if (!bot?.admin) continue             

    validGroups.push({ group: g, meta, targetId: caller.id })
  }

  return validGroups
}

async function punish(sock, groupJid, callerIds, tipo, metaIn = null) {
  const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net'

  const botSettings = await db.getSettings(botId)
  if (botSettings?.self) return

  const chat = await db.getChat(groupJid)
  if (!chat?.anticall) return
  if (chat.primaryBot && chat.primaryBot !== botId) return

  let meta = metaIn || getCachedMeta(groupJid)
  if (!meta) {
    meta = await sock.groupMetadata(groupJid).catch(() => null)
    if (meta) setCachedMeta(groupJid, meta)
  }
  if (!meta) return

  const caller = findMember(meta, callerIds)
  const bot = meta.participants.find(p => matches(p, botId) || matches(p, sock.user?.lid))
  if (!caller) return
  if (!bot?.admin) return
  if (caller.admin) return

  const target = caller.id

  const k = `${groupJid}:${num(target)}`
  if (recent.has(k)) return
  recent.set(k, true)
  setTimeout(() => recent.delete(k), 30_000)

  try {
    await sock.groupParticipantsUpdate(groupJid, [target], 'remove')
    await sock.sendMessage(groupJid, {
      text: `❖ @${num(target)} fue eliminado por iniciar ${tipo} en el grupo.\n\n> ✐ Las llamadas, videollamadas y chats de voz están *prohibidos* en este grupo.`,
      mentions: [target]
    })
  } catch (err) {}
}

async function handleGrouplessCall(sock, c, callKey) {
  const ids = [c.callerPn, c.from, c.chatId].filter(Boolean)
  const tipo = c.isVideo ? 'una videollamada' : 'una llamada'

  const all = await sock.groupFetchAllParticipating().catch(() => null)
  if (!all) return

  const uniqueGroups = Object.values(all).filter((g, idx, self) => 
    self.findIndex(t => t.id === g.id) === idx && findMember(g, ids)
  )

  const validCandidates = await getPunishableGroups(sock, ids, uniqueGroups)

  if (validCandidates.length === 0) return

  if (validCandidates.length === 1) {
    pendingCalls.delete(callKey)
    return punish(sock, validCandidates[0].group.id, ids, tipo, validCandidates[0].meta)
  }

  const callerNum = num(validCandidates[0].targetId)
  const now = Date.now()
  const THREE_MINUTES = 3 * 60 * 1000

  const activeCandidates = validCandidates.filter(v => {
    const lastActive = lastUserActivity.get(`${v.group.id}:${callerNum}`) || 0
    return (now - lastActive) < THREE_MINUTES
  })

  if (activeCandidates.length === 1) {
    pendingCalls.delete(callKey)
    return punish(sock, activeCandidates[0].group.id, ids, tipo, activeCandidates[0].meta)
  }

  await new Promise(resolve => setTimeout(resolve, 3000))

  const alreadyPunished = validCandidates.some(v => recent.has(`${v.group.id}:${callerNum}`))
  if (alreadyPunished) {
    pendingCalls.delete(callKey)
    return
  }

  if (!KICK_ALL_ON_AMBIGUOUS) {
    return
  }

  pendingCalls.delete(callKey)
  for (const v of validCandidates) {
    await punish(sock, v.group.id, ids, tipo, v.meta)
  }
}

export async function registerAnticall(sock) {
  if (registered.has(sock)) return
  registered.add(sock)

  const names = await getStubNames()

  sock.ev.on('call', async calls => {
    for (const c of calls) {
      try {
        if (c.status !== 'offer') continue

        const ids = [c.callerPn, c.from, c.chatId].filter(Boolean)
        const callKey = ids.join('_')

        pendingCalls.set(callKey, { ids, isVideo: c.isVideo, ts: Date.now() })
        setTimeout(() => pendingCalls.delete(callKey), 10_000)

        const groupJid = c.groupJid || (c.chatId?.endsWith('@g.us') ? c.chatId : null)
        if (groupJid) {
          pendingCalls.delete(callKey)
          await punish(sock, groupJid, ids, c.isVideo ? 'una videollamada' : 'una llamada')
        } else if (c.isGroup) {
          await handleGrouplessCall(sock, c, callKey)
        }
      } catch (e) {}
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid
        if (!jid?.endsWith('@g.us')) continue

        const sender = m.key.participant || m.key.participantAlt
        if (sender && !m.key.fromMe) {
          const senderNum = num(sender)
          if (senderNum) {
            lastUserActivity.set(`${jid}:${senderNum}`, Date.now())
          }
        }

        const callLog = m.message?.callLogMesssage ?? m.message?.callLogMessage
        const stubName = m.messageStubType != null ? (stubNames[m.messageStubType] || String(m.messageStubType)) : ''

        const isCallNotice = !!callLog || /^CALL_/.test(stubName)

        if (!isCallNotice) continue

        const ts = Number(m.messageTimestamp?.toNumber?.() ?? m.messageTimestamp)
        if (ts && Date.now() / 1000 - ts > 60) continue

        const callerIds = [
          m.key.participantAlt,
          m.key.participant,
          ...(Array.isArray(m.messageStubParameters) ? m.messageStubParameters.filter(p => /@/.test(p)) : [])
        ].filter(Boolean)

        if (!callerIds.length) continue

        const isVoiceChat = callLog?.callType === 2 || callLog?.callType === 'VOICE_CHAT' || /VOICE_CHAT/.test(stubName)
        const isVideo = callLog?.isVideo || /VIDEO/.test(stubName)
        const tipo = isVoiceChat ? 'un chat de voz' : isVideo ? 'una videollamada' : 'una llamada'

        await punish(sock, jid, callerIds, tipo)
      } catch (e) {}
    }
  })
}
