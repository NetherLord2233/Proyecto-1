import db from '#db'

export default {
  command: ['delinv', 'delown', 'uninv', 'revoke'],
  isDev: true,
  description: 'Revoca el rango Invitado a un usuario.',
  run: async ({ sock, msg, args, usedPrefix, command }) => {
    let targetJid = null

    if (msg.quoted?.sender) {
      targetJid = msg.quoted.sender
    } else if (msg.mentionedJid && msg.mentionedJid.length > 0) {
      targetJid = msg.mentionedJid[0]
    } else if (args.length > 0) {
      for (const arg of args) {
        const cleanArg = arg.trim()
        if (cleanArg.endsWith('@s.whatsapp.net') || cleanArg.endsWith('@lid')) {
          targetJid = cleanArg
          break
        } else {
          const rawNum = cleanArg.replace(/\D/g, '')
          if (rawNum.length >= 7 && rawNum.length <= 15) {
            targetJid = `${rawNum}@s.whatsapp.net`
            break
          }
        }
      }
    }

    if (!targetJid) {
      return msg.reply(
        `✎ *Uso correcto del comando:*\n\n` +
        `• *Respondiendo a un mensaje:* \`${usedPrefix}${command}\`\n` +
        `• *Mencionando:* \`${usedPrefix}${command} @usuario\`\n` +
        `• *Por Número / LID:* \`${usedPrefix}${command} 54911xxxxxx\``
      )
    }

    const user2Data = (await db.getUser(targetJid)) || {}
    const isInv = !!user2Data.isInv || !!user2Data.invUntil

    const cleanNum = targetJid.split('@')[0].split(':')[0]

    if (!isInv) {
      return msg.reply(`⚠️ El usuario @${cleanNum} no tiene un rango Invitado activo.`, { mentions: [targetJid] })
    }

    await db.updateUser(targetJid, 'isInv', false)
    await db.updateUser(targetJid, 'invUntil', 0)

    return msg.reply(
      `✿⸝꙳.˖ *Rango Invitado Revocado*\n\n` +
      `亗 *Usuario:* @${cleanNum}\n` +
      `☘︎ *Estado:* El rango de invitado ha sido desactivado exitosamente.`,
      { mentions: [targetJid] }
    )
  }
}
