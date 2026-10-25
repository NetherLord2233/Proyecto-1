import db from '#db'

function parseDuration(str) {
  if (!str) return null
  const match = str.match(/(\d+)\s*(h|hora|horas|d|dia|dias|día|días|s|semana|semanas|w|week|weeks)/i)
  if (!match) return null

  const amount = parseInt(match[1])
  const unit = match[2].toLowerCase()

  if (['h', 'hora', 'horas'].includes(unit)) return amount * 60 * 60 * 1000
  if (['d', 'dia', 'dias', 'día', 'días'].includes(unit)) return amount * 24 * 60 * 60 * 1000
  if (['s', 'semana', 'semanas', 'w', 'week', 'weeks'].includes(unit)) return amount * 7 * 24 * 60 * 60 * 1000

  return null
}

function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))

  const parts = []
  if (days > 0) parts.push(`${days} día(s)`)
  if (hours > 0) parts.push(`${hours} hora(s)`)
  if (minutes > 0) parts.push(`${minutes} minuto(s)`)
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds} segundo(s)`)

  return parts.join(' ')
}

export default {
  command: ['own', 'addinv'],
  isDev: true,
  description: 'Asigna el rango Invitado temporalmente a un usuario por hora, día o semana.',
  run: async ({ sock, msg, args, usedPrefix, command }) => {
    let targetJid = null
    let durationStr = ''

    if (msg.quoted?.sender) {
      targetJid = msg.quoted.sender
      durationStr = args.join(' ')
    } else if (msg.mentionedJid && msg.mentionedJid.length > 0) {
      targetJid = msg.mentionedJid[0]
      durationStr = args.filter(a => !a.includes('@')).join(' ')
    } else if (args.length > 0) {
      for (const arg of args) {
        const cleanArg = arg.trim()
        if (cleanArg.endsWith('@s.whatsapp.net') || cleanArg.endsWith('@lid')) {
          targetJid = cleanArg
        } else {
          const rawNum = cleanArg.replace(/\D/g, '')
          if (rawNum.length >= 7 && rawNum.length <= 15) {
            targetJid = `${rawNum}@s.whatsapp.net`
          }
        }
      }
      if (targetJid) {
        const rawTargetNum = targetJid.split('@')[0].split(':')[0]
        durationStr = args.filter(a => !a.includes(rawTargetNum)).join(' ')
      }
    }

    if (!targetJid) {
      return msg.reply(
        `✎ *Uso correcto del comando:*\n\n` +
        `• *Respondiendo a un mensaje:* \`${usedPrefix}${command} <tiempo>\`\n` +
        `• *Mencionando:* \`${usedPrefix}${command} <tiempo> @usuario\`\n` +
        `• *Por Número / LID:* \`${usedPrefix}${command} <tiempo> 54911xxxxxx\`\n\n` +
        `*Formatos de tiempo válidos:*\n` +
        `- Horas: \`1h\`, \`12 horas\`\n` +
        `- Días: \`1d\`, \`3 dias\`\n` +
        `- Semanas: \`1s\`, \`2 semanas\``
      )
    }

    const durationMs = parseDuration(durationStr)
    if (!durationMs) {
      return msg.reply(`⚠️ Por favor, especifica un tiempo válido.\nEjemplo: \`${usedPrefix}${command} 1d\` o \`${usedPrefix}${command} 12 horas\``)
    }

    const now = Date.now()
    const invUntil = now + durationMs

    await db.updateUser(targetJid, 'isInv', true)
    await db.updateUser(targetJid, 'invUntil', invUntil)

    const cleanNum = targetJid.split('@')[0].split(':')[0]
    const expireDate = new Date(invUntil).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    const durationFormatted = formatDuration(durationMs)

    return msg.reply(
      `✿⸝꙳.˖ *Rango Invitado Asignado*\n\n` +
      `亗 *Usuario:* @${cleanNum}\n` +
      `☕︎ *Duración:* ${durationFormatted}\n` +
      `☘︎ *Expiración:* ${expireDate} (Hora Bogotá)`,
      { mentions: [targetJid] }
    )
  }
}
