export default {
  command: ['lid'],
  isAdmin: true,
  description: 'Obtiene el LID de un usuario',
  run: async ({ sock, msg }) => {
    const client = sock
    const m = msg

    try {
      let target = m.quoted?.sender 
        || (m.mentionedJid && m.mentionedJid[0])
        || m.message?.extendedTextMessage?.contextInfo?.participant 
        || m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        || m.sender

      if (!target) {
        return await client.sendMessage(m.chat, { 
          text: '《✧》 Responde al mensaje de un usuario o etiquétalo para obtener su LID.' 
        }, { quoted: m })
      }

      if (target.endsWith('@lid')) {
        return await client.sendMessage(m.chat, { 
          text: `《✧》 *LID del usuario:*\n\`\`\`${target}\`\`\`` 
        }, { quoted: m })
      }

      let userLid = null

      try {
        const [res] = (await client.onWhatsApp(target)) || []
        if (res?.lid) userLid = res.lid
      } catch {}

      if (!userLid && m.isGroup) {
        const groupMetadata = await client.groupMetadata(m.chat).catch(() => null)
        const participant = groupMetadata?.participants?.find(p => p.id === target || p.jid === target)
        if (participant?.lid) {
          userLid = participant.lid
        }
      }

      if (!userLid) {
        return await client.sendMessage(m.chat, { 
          text: '《✧》 No se pudo obtener el LID del usuario especificado.' 
        }, { quoted: m })
      }

      await client.sendMessage(m.chat, { 
        text: `《✧》 *LID del usuario:*\n\`\`\`${userLid}\`\`\`` 
      }, { quoted: m })

    } catch (error) {
      console.error('Error en comando LID:', error)
      await client.sendMessage(m.chat, { 
        text: `*⚠️ ERROR EN LID:* \n\n${error.message}` 
      }, { quoted: m })
    }
  }
}