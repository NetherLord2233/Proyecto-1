import db from "#db"

const INVISIBLE_CHAR = 'ㅤ'

const fillEmptyLines = (text) => {
  return text
    .split('\n')
    .map(line => {
      if (line.trim() === '') return INVISIBLE_CHAR
      if (line.trim() === '>') return `> ${INVISIBLE_CHAR}`
      return line
    })
    .join('\n')
}

export default {
  command: ['report', 'reporte', 'sug', 'suggest', 'r'],
  category: 'info',
  run: async ({ msg, sock, args, command, text, usedPrefix: prefix }) => {
    const targets = [
      '573015200599@s.whatsapp.net',
      '593989068253@s.whatsapp.net',
      '5491128178894@s.whatsapp.net',
    ]
    const sender = msg.sender
    const now = Date.now()

    try {
      if (command === 'r') {
        const isOwner = global.owner?.some(num => `${num}@s.whatsapp.net` === sender) || targets.includes(sender)
        if (!isOwner) return msg.reply('《✤》 Este comando es exclusivo para responder sugerencias/reportes.')

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || ''

        if (!quotedText) {
          return msg.reply('《✤》 Debes responder al mensaje del reporte/sugerencia original para que el usuario reciba la respuesta.')
        }

        const matchNum = quotedText.match(/wa\.me\/(\d+)/)
        const matchGroup = quotedText.match(/\*Grupo\*\s*\n>\s*([^\n\r]+)/)
        const matchMsg = quotedText.match(/\*Mensaje\*\s*\n>\s*([\s\S]+)/)

        if (!matchNum || !matchNum[1]) {
          return msg.reply('《✤》 Debes responder a un mensaje de reporte/sugerencia válido.')
        }

        const userNumber = matchNum[1]
        const targetUser = `${userNumber}@s.whatsapp.net`
        const replyText = args.join(' ').trim()

        if (!replyText) {
          return msg.reply('《✤》 Escribe el mensaje de respuesta para el usuario.')
        }

        const originalText = matchMsg ? matchMsg[1].trim() : 'Sin contenido'
        const staffName = msg.pushName || 'Staff'

        const botJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net' || sock.user?.id
        const botData = (await db.getBot?.(botJid)) || (await db.getBotInfo?.(botJid)) || {}
        const subbotName = botData.name || botData.botName || sock.user?.name || global.botname || 'SubBot'

        const responseMsgRaw = 
          `𖹭ׄ  ׅ ⭑ 𝐑𝐄𝐒𝐏𝐔𝐄𝐒𝐓𝐀 𝐃𝐄𝐋 𝐒𝐓𝐀𝐅𝐅  ⭑ ׅ 𖹭\n\n` +
          `❖ Usuario\n` +
          `> @${userNumber}\n\n` +
          `❖ Reporte / Sugerencia` +
          `\n> ${originalText.replace(/\n/g, '\n')}\n\n` +
          `❖ Atendido por\n` +
          `> ${staffName}\n\n` +
          `❖ Respuesta\n` +
          `> ${replyText.replace(/\n/g, '\n> ')}\n\n` +
          `━━━━━━━━━━━━━━━\n\n` +
          `ꕥ Gracias por tomarte el tiempo de ayudarnos a mejorar el bot.\n\n` +
          `> ⌕ ${subbotName} | 𝙻𝚘𝙵𝚒 ☕︎ 𝚃𝙴𝙰𝙼™`

        const responseMsg = fillEmptyLines(responseMsgRaw)
        const destination = matchGroup && matchGroup[1].trim().includes('@g.us') ? matchGroup[1].trim() : targetUser

        await sock.sendMessage(destination, {
          text: responseMsg,
          mentions: [targetUser]
        }, { quoted: msg })

        return msg.reply('《✤》 Respuesta enviada correctamente.')
      }

      const userData = await db.getUser(sender) || {}
      let cooldown = userData.sugCooldown || 0

      if (cooldown > now + 30 * 1000) {
        cooldown = 0
      }

      if (cooldown > now) {
        return msg.reply(`《✤》 Espera *${msToTime(cooldown - now)}* para volver a usar este comando.`)
      }

      const mensajeTexto = args.join(' ').trim()
      if (!mensajeTexto) {
        return msg.reply('《✤》 Debes escribir el reporte o sugerencia.')
      }
      if (mensajeTexto.length < 10) {
        return msg.reply('✿ Tu mensaje es demasiado corto. Mínimo 10 caracteres.')
      }

      const isReport = ['report', 'reporte'].includes(command)
      const tipo = isReport ? '🆁ҽ𝕡σɾƚҽ' : '🆂մց𝕖ລະ𝚗cíᥲ'
      const displayName = msg.pushName || 'Usuario desconocido'
      const numero = sender.split('@')[0]
      const currentChat = msg.chat
      const isGroup = currentChat.endsWith('@g.us')

      let groupInviteLink = 'Privado / No disponible'
      if (isGroup) {
        try {
          const inviteCode = await sock.groupInviteCode(currentChat)
          groupInviteLink = `https://chat.whatsapp.com/${inviteCode}`
        } catch (e) {
          groupInviteLink = 'No disponible (el bot necesita ser admin)'
        }
      }

      const fechaObj = new Date()
      const fechaLocal = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const horaLocal = fechaObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })
      const fechaHoraFormateada = `${fechaLocal} a las ${horaLocal}`

      const reportMsgRaw = 
        `🫗۫᷒ᰰ⃘ׅ᷒  ۟　\`${tipo}\`　ׅ　ᩡ\n\n` +
        `𖹭  ׄ  ְ 🍒 *Nombre*\n> ${displayName}\n\n` +
        `𖹭  ׄ  ְ 🦩 *Número*\n> wa.me/${numero}\n\n` +
        `𖹭  ׄ  ְ 💬 *Grupo*\n> ${currentChat}\n\n` +
        `𖹭  ׄ  ְ 🔗 *Enlace de Invitación*\n> ${groupInviteLink}\n\n` +
        `𖹭  ׄ  ְ 🌱 *Fecha y Hora*\n> ${fechaHoraFormateada}\n\n` +
        `𖹭  ׄ  ְ 🍓 *Mensaje*\n> ${mensajeTexto.replace(/\n/g, '\n> ')}`

      const reportMsg = fillEmptyLines(reportMsgRaw)

      for (const target of targets) {
        try {
          await sock.sendMessage(target, { text: reportMsg }, { quoted: msg })
        } catch (e) {
          console.error(`Error enviando a ${target}:`, e)
        }
      }

      userData.sugCooldown = now + 30 * 1000
      await db.updateUser(sender, 'sugCooldown', userData.sugCooldown)

      return msg.reply(`《✤》 Gracias por tu ${isReport ? 'reporte' : 'sugerencia'}\n\n> Tu mensaje fue enviado correctamente a los moderadores.`)

    } catch (err) {
      console.error(err)
      return msg.reply(typeof msgglobal !== 'undefined' ? msgglobal : '❌ Ocurrió un error inesperado.')
    }
  }
}

const msToTime = (duration) => {
  const seconds = Math.floor((duration / 1000) % 60)
  const minutes = Math.floor((duration / (1000 * 60)) % 60)
  const hours = Math.floor((duration / (1000 * 60 * 60)) % 24)
  const days = Math.floor(duration / (1000 * 60 * 60 * 24))

  const parts = []
  if (days > 0) parts.push(`${days} día${days > 1 ? 's' : ''}`)
  if (hours > 0) parts.push(`${hours} hora${hours > 1 ? 's' : ''}`)
  if (minutes > 0) parts.push(`${minutes} minuto${minutes > 1 ? 's' : ''}`)
  parts.push(`${seconds} segundo${seconds > 1 ? 's' : ''}`)

  return parts.join(', ')
}
