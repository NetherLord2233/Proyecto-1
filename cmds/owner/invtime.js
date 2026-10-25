import db from '#db'

function formatDuration(ms) {
  if (ms <= 0) return 'Expirado'
  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)

  return parts.join(' ')
}

export default {
  command: ['invtime', 'owntime', 'timeinv', 'timeown'],
  isInv: true,
  description: 'Muestra el tiempo restante del rango invitado propio o de un usuario.',
  run: async ({ msg, args }) => {
    let targetJid = null

    if (msg.quoted?.sender) {
      targetJid = msg.quoted.sender
    } else if (msg.mentionedJid && msg.mentionedJid.length > 0) {
      targetJid = msg.mentionedJid[0]
    } else if (args.length > 0) {
      const cleanArg = args[0].trim()
      if (cleanArg.endsWith('@s.whatsapp.net') || cleanArg.endsWith('@lid')) {
        targetJid = cleanArg
      } else {
        const rawNum = cleanArg.replace(/\D/g, '')
        if (rawNum.length >= 7) {
          targetJid = `${rawNum}@s.whatsapp.net`
        }
      }
    }

    if (!targetJid) {
      targetJid = msg.sender
    }

    const cleanNum = targetJid.split('@')[0].split(':')[0]
    const user2Data = (await db.getUser(targetJid)) || {}

    const cleanNumber = (val) => String(val || '').split('@')[0].split(':')[0].replace(/\D/g, '')

    const ownersList = (global.owner || []).map(cleanNumber)
    const devsList = (global.devs || []).map(cleanNumber)
    const staffList = (global.staff || []).map(cleanNumber)
    const invList = (global.inv || global.invitados || []).map(cleanNumber)

    if (ownersList.includes(cleanNum)) {
      return msg.reply(`☕︎ *Usuario:* @${cleanNum}\n亗 *Rango:* Owner\n☂︎ *Tiempo:* ∞`, { mentions: [targetJid] })
    }
    if (devsList.includes(cleanNum)) {
      return msg.reply(`☕︎ *Usuario:* @${cleanNum}\n☘︎ *Rango:* Dev\n☂︎ *Tiempo:* ∞`, { mentions: [targetJid] })
    }
    if (staffList.includes(cleanNum)) {
      return msg.reply(`☕︎ *Usuario:* @${cleanNum}\n☘︎ *Rango:* Staff\n☂︎ *Tiempo:* ∞`, { mentions: [targetJid] })
    }
    if (invList.includes(cleanNum)) {
      return msg.reply(`☕︎ *Usuario:* @${cleanNum}\n☘︎ *Rango:* Invitado\n☂︎ *Tiempo:* ∞`, { mentions: [targetJid] })
    }

    const invUntil = user2Data.invUntil || (typeof user2Data.isInv === 'number' ? user2Data.isInv : null)
    const isInv = !!user2Data.isInv

    if (!isInv && !invUntil) {
      return msg.reply(`⚠️ El usuario @${cleanNum} no posee un rango activo.`, { mentions: [targetJid] })
    }

    const now = Date.now()

    if (invUntil) {
      if (now >= invUntil) {
        await db.updateUser(targetJid, 'isInv', false)
        await db.updateUser(targetJid, 'invUntil', 0)
        return msg.reply(`⚠️ El rango invitado de @${cleanNum} ha *expirado*.`, { mentions: [targetJid] })
      }

      const remaining = invUntil - now
      const expireDate = new Date(invUntil).toLocaleString('es-CO', { timeZone: 'America/Bogota' })

      return msg.reply(
        `✿⸝꙳.˖ *Estado de Rango Invitado*\n\n` +
        `☕︎ *Usuario:* @${cleanNum}\n` +
        `☘︎ *Rango:* Invitado Temporal\n` +
        `☂︎ *Tiempo Restante:* ${formatDuration(remaining)}\n` +
        `∜ *Expiración:* ${expireDate} (Hora Bogotá)`,
        { mentions: [targetJid] }
      )
    } else {
      return msg.reply(`☕︎ *Usuario:* @${cleanNum}\n☘︎ *Rango:* Invitado\n☂︎ *Tiempo:* ∞`, { mentions: [targetJid] })
    }
  }
}
