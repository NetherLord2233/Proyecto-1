import db from "#db"

export async function before({ msg, sock, groupMetadata, isAdmins, isBotAdmins }) {
  if (!msg.isGroup) return
  if (msg.isBot) return
  if (isAdmins) return
  if (!isBotAdmins) return

  const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net'
  const chat = await db.getChat(msg.chat)
  if (!chat?.antistatus) return

  const primaryBotId = chat?.primaryBot
  if (primaryBotId && primaryBotId !== botId) return

  const botSettings = await db.getSettings(botId)
  if (botSettings?.self) return

  const isEstado = 
    !!msg.message?.groupStatusMentionMessage ||
    !!msg.quoted?.groupStatusMentionMessage ||
    !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.groupStatusMentionMessage

  if (!isEstado) return

  try {
    const participant = msg.key.participantAlt || msg.key.participant || msg.sender
    await sock.sendMessage(msg.chat, {
      delete: {
        remoteJid: msg.chat,
        fromMe: false,
        id: msg.key.id,
        participant
      }
    }).catch(() => {})

    const targetId = msg.sender
    let user = await db.getChatUser(msg.chat, targetId)
    if (!user) user = { warnings: [] }
    let warnings = user.warnings

    if (typeof warnings === 'string') {
      try { warnings = JSON.parse(warnings) } catch { warnings = [] }
    }
    if (!Array.isArray(warnings)) warnings = []

    const timestamp = new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })

    warnings.unshift({
      reason: 'Mencionar grupo en estados (Anti-Status)',
      timestamp,
      by: botId
    })

    await db.updateChatUser(msg.chat, targetId, 'warnings', warnings)

    const total = warnings.length
    const warnLimit = chat.warnLimit || 3
    const expulsar = chat.expulsar === 1

    const warningList = warnings.map((w, i) => {
      return `\`#${total - i}\` » ${w.reason}\n> » Fecha: ${w.timestamp}`
    }).join('\n')

    let message = `✐ Se ha añadido una advertencia automática a @${targetId.split('@')[0]} por *Anti-Status*.\n✿ Advertencias totales \`(${total}/${warnLimit})\`:\n\n${warningList}`

    if (total >= warnLimit) {
      if (expulsar) {
        try {
          await sock.groupParticipantsUpdate(msg.chat, [targetId], 'remove')
          await db.updateChatUser(msg.chat, targetId, 'warnings', [])
          message += `\n\n> ❖ Alcanzó el límite de ${warnLimit} advertencias y fue expulsado.`
        } catch {
          message += `\n\n> ❖ Alcanzó el límite, pero no pude expulsarlo.`
        }
      } else {
        message += `\n\n> ❖ Ha alcanzado el límite de advertencias.`
      }
    }

    await sock.sendMessage(msg.chat, { text: message, mentions: [targetId] }, { quoted: msg })

  } catch (e) {
    console.error('[ANTI-STATUS]', e)
  }
}