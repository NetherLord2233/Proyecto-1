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

function resolveUserPhone(input) {
  if (!input) return null
  const str = String(input).trim()
  const lowerStr = str.toLowerCase()
  const dupes = global.dupe || {}

  if (dupes[lowerStr]) {
    const list = Array.isArray(dupes[lowerStr]) ? dupes[lowerStr] : [dupes[lowerStr]]
    const firstPhone = list.find(item => !String(item).toLowerCase().endsWith('@lid'))
    if (firstPhone) {
      return String(firstPhone).split('@')[0].split(':')[0].replace(/\D/g, '')
    }
    return null
  }

  const digits = str.split('@')[0].split(':')[0].replace(/\D/g, '')
  const isLid = lowerStr.endsWith('@lid')

  for (const [alias, list] of Object.entries(dupes)) {
    const arr = Array.isArray(list) ? list : [list]
    const match = arr.some(item => {
      const itemStr = String(item).trim().toLowerCase()
      const itemDigits = itemStr.split('@')[0].split(':')[0].replace(/\D/g, '')
      if (isLid) {
        return itemStr === lowerStr || (itemStr.endsWith('@lid') && itemDigits === digits)
      } else {
        return itemDigits === digits
      }
    })

    if (match) {
      const firstPhone = arr.find(item => !String(item).toLowerCase().endsWith('@lid'))
      if (firstPhone) {
        return String(firstPhone).split('@')[0].split(':')[0].replace(/\D/g, '')
      }
    }
  }

  if (!isLid && digits.length >= 7 && digits.length <= 15) {
    return digits
  }

  return null
}

export default {
  command: ['owns', 'owners'],
  isInv: true,
  description: 'Lista a todos los usuarios con rango, mostrando jerarquía y tiempo restante.',
  run: async ({ msg }) => {
    const now = Date.now()
    const rankedMap = new Map()

    const processUser = (input, rank, rankOrder, defaultTime = '∞') => {
      const phone = resolveUserPhone(input)
      if (!phone) return

      const existing = rankedMap.get(phone)
      if (!existing || existing.rankOrder > rankOrder) {
        rankedMap.set(phone, {
          num: phone,
          jid: `${phone}@s.whatsapp.net`,
          rank,
          rankOrder,
          timeText: defaultTime
        })
      }
    }

    ;(global.owner || []).forEach(o => processUser(o, 'Owner 亗', 1))
    ;(global.devs || []).forEach(d => processUser(d, 'Dev ☕︎', 2))
    ;(global.staff || []).forEach(s => processUser(s, 'Staff ☕︎', 3))
    ;(global.inv || global.invitados || []).forEach(i => processUser(i, 'Invitado ☂︎', 4))

    try {
      const allUsers = typeof db.getUsers === 'function' ? await db.getUsers() : (db.data?.users || {})
      const entries = Array.isArray(allUsers) ? allUsers : Object.entries(allUsers)

      for (const entry of entries) {
        const rawJid = Array.isArray(allUsers) ? entry.id || entry.jid : entry[0]
        const uData = Array.isArray(allUsers) ? entry : entry[1]

        if (!rawJid) continue

        const invUntil = uData?.invUntil || (typeof uData?.isInv === 'number' ? uData.isInv : null)
        const isInv = !!uData?.isInv

        if (isInv || invUntil) {
          if (invUntil && now >= invUntil) continue

          let timeText = '∞'
          if (invUntil) {
            timeText = formatDuration(invUntil - now)
          }

          processUser(rawJid, 'Invitado ☂︎', 4, timeText)
        }
      }
    } catch (e) {
    }

    if (rankedMap.size === 0) {
      return msg.reply('✿ No hay usuarios registrados con rangos o rango invitado activo.')
    }

    const rawMentions = []
    let text = `✿⸝꙳.˖ *LISTA DE RANGOS* ✿⸝꙳.˖\n\n`
    let count = 1

    for (const user of rankedMap.values()) {
      text += `*${count}.* @${user.num}\n`
      text += `   ├ ☘︎ *Rango:* ${user.rank}\n`
      text += `   └ ☂︎ *Tiempo:* ${user.timeText}\n\n`

      rawMentions.push(user.jid)
      count++
    }

    const uniqueMentions = [...new Set(rawMentions)]

    return msg.reply(text.trim(), { mentions: uniqueMentions })
  }
}
