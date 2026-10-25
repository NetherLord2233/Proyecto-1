import db from "#db";

export default {
  command: ['testwelcome', 'testbienvenida', 'testwel', 'testgoodbye', 'testdespedida', 'testbye'],
  category: 'group',
  description: 'Vista previa de bienvenida y despedida real',
  isAdmin: true,
  group: true,
  run: async ({ msg, sock, command }) => {
    const chatId = msg.chat
    const targetJid = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender
    const isBye = ['testgoodbye', 'testdespedida', 'testbye'].includes(command.toLowerCase())

    const chat = await db.getChat(chatId)

    if (!isBye &&!chat.welcome) {
      return msg.reply('La bienvenida está desactivada. Actívala con /welcome on')
    }

    if (isBye &&!chat.goodbye) {
      return msg.reply('La despedida está desactivada. Actívala con /goodbye on')
    }

    await sock.ev.emit('group-participants.update', {
      id: chatId,
      participants: [targetJid],
      action: isBye? 'remove' : 'add',
      author: msg.sender
    })

    await msg.reply(`Se envió señal falsa de ${isBye? 'despedida' : 'bienvenida'} para @${targetJid.split('@')[0]}`, { mentions: [targetJid] })
  }
}