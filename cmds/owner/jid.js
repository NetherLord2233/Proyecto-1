export default {
  command: ['jid'],
  category: 'info',
  description: 'Obtiene el JID de un chat/usuario.',

  run: async ({ sock, msg, args }) => {
    try {
      if (!args[0]) {
        return sock.sendMessage(msg.chat, { text: `《✧》 *JID de este chat:*\n\`\`\`${msg.chat}\`\`\`` }, { quoted: msg })
      }

      const input = args.join(' ')
      const channelMatch = input.match(/(?:whatsapp\.com\/channel\/)([0-9A-Za-z]+)/i)

      if (!channelMatch) {
        const groupMatch = input.match(/chat\.whatsapp\.com\/([0-9A-Za-z]+)/i)
        if (groupMatch) {
          try {
            const info = await sock.groupGetInviteInfo(groupMatch[1])
            return sock.sendMessage(msg.chat, { text: `《✧》 *Grupo:* ${info.subject}\n*JID:*\n\`\`\`${info.id}\`\`\`` }, { quoted: msg })
          } catch {
            return sock.sendMessage(msg.chat, { text: `《✧》 No se pudo obtener el JID de ese grupo.` }, { quoted: msg })
          }
        }
        return sock.sendMessage(msg.chat, { text: `《✧》 Manda un link válido.\nEj:.jid https://whatsapp.com/channel/0029Vaxxxxx` }, { quoted: msg })
      }

      const inviteCode = channelMatch[1]
      await sock.sendMessage(msg.chat, { react: { text: '🔍', key: msg.key } })

      let metadata = null
      try {
        if (sock.newsletterMetadata) {
          metadata = await sock.newsletterMetadata('invite', inviteCode)
        } else if (sock.newsletterFetch) {
          metadata = await sock.newsletterFetch(inviteCode)
        }
      } catch {}

      if (!metadata?.id) {
        return sock.sendMessage(msg.chat, { text: `《✧》 No pude obtener el metadata.\nCódigo: ${inviteCode}` }, { quoted: msg })
      }

      await sock.sendMessage(msg.chat, { react: { text: '✅', key: msg.key } })
      return sock.sendMessage(msg.chat, { text: `《✧》 *Canal:* ${metadata.name || 'Canal'}\n*JID:*\n\`\`\`${metadata.id}\`\`\`` }, { quoted: msg })

    } catch (e) {
      return sock.sendMessage(msg.chat, { text: `《✧》 *Error:*\n\n${e.message}` }, { quoted: msg })
    }
  }
}