export default {
  command: ['del', 'borrar', 'delete', 'eliminar'],
  category: 'group',
  description: 'Elimina un mensaje respondido',
  isGroup: true,
  isAdmin: true,
  isBotAdmin: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const prefix = usedPrefix || global.prefix || '.'
      
      if (!msg.quoted) {
        await sock.sendMessage(msg.chat, { 
          text: `《✧》Responde al mensaje que quieres borrar\n\n> Ejemplo: *${prefix + command}*` 
        }, { quoted: msg })
        await msg.react('❌')
        return
      }

      const key = msg.quoted.key || msg.quoted.fakeObj?.key || {
        id: msg.quoted.id || msg.quoted.stanzaId || msg.message?.extendedTextMessage?.contextInfo?.stanzaId,
        remoteJid: msg.chat,
        fromMe: msg.quoted.fromMe || false,
        participant: msg.quoted.sender || msg.quoted.participant || msg.message?.extendedTextMessage?.contextInfo?.participant
      }

      if (!key?.id) {
        await msg.react('❌')
        return msg.reply('《✧》No pude obtener el mensaje a borrar')
      }

      await sock.sendMessage(msg.chat, { delete: key })
      await msg.react('✅')
      
    } catch (e) {
      await msg.react('❌')
      await msg.reply(`> Error en *${usedPrefix + command}*.\n> [${e.message}]`)
    }
  }
}