import db from "#db"
import GraphemeSplitter from 'grapheme-splitter'

const FORBIDDEN_PREFIXES = [
  ' ',      // Espacio común
  'ㅤ',     // Caracter invisible
  '\u200B', // Zero Width Space
  '\u2800', // Braille Pattern Blank
  '\u00A0', // Non-breaking space
  '\t',     // Tabulador
  '\n'      // Salto de línea
]

export default {
  command: ['setbotprefix', 'setprefix'],
  category: 'socket',
  description: 'cambia el prefijo del bot', 
  run: async ({ msg, sock, args, command, text, usedPrefix: prefix }) => {
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net'
    const config = await db.getSettings(idBot)
    const owner = config.owner ? config.owner : '' || ''
    const isOwner2 = [idBot, ...(config.owner ? [config.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')].includes(msg.sender)

    if (!isOwner2) return sock.reply(msg.chat, mess.socket, msg)

    const value = args.join(' ').trim()
    const defaultPrefix = ["#", "/", ".", "!"]

    if (!value) {
      const lista = config.prefijo === null 
        ? '`sin prefijos`' 
        : (Array.isArray(config.prefijo) ? config.prefijo : [config.prefijo || '/']).map(p => `\`${p}\``).join(', ')
      return msg.reply(
        `✿ Por favor, elige cualquiera de los siguientes métodos de prefijos.\n\n` +
        `> *○ Multi-Prefix* :: ${prefix + command} *!/.+-#*\n` +
        `> *○ Reset* :: ${prefix + command} *reset*\n` +
        `> *○ No-Prefix* :: ${prefix + command} *noprefix*\n\n` +
        `✤ Actualmente se está usando: ${lista}`
      )
    }

    if (value.toLowerCase() === 'reset') {
      config.prefijo = defaultPrefix
      await db.updateSettings(idBot, 'prefijo', config.prefijo)
      return sock.reply(msg.chat, `❖ Se han restaurado los prefijos predeterminados: *${defaultPrefix.join(' ')}*`, msg)
    }

    if (value.toLowerCase() === 'noprefix') {
      config.prefijo = 1
      await db.updateSettings(idBot, 'prefijo', config.prefijo)
      return msg.reply(`❖ Se cambió al modo sin prefijos para el Socket correctamente.`)
    }

    const splitter = new GraphemeSplitter()
    const graphemes = splitter.splitGraphemes(value)
    const lista = []

    for (const g of graphemes) {
      // Omite los caracteres que se encuentren en la lista no permitida
      if (FORBIDDEN_PREFIXES.includes(g)) continue
      if (!lista.includes(g)) lista.push(g)
    }

    if (lista.length === 0) {
      return sock.reply(msg.chat, '✿ No se detectaron prefijos válidos o todos los símbolos ingresados están prohibidos.', msg)
    }

    config.prefijo = lista
    await db.updateSettings(idBot, 'prefijo', config.prefijo)
    return sock.reply(msg.chat, `✤ Se cambió el prefijo del Socket a *${lista.join(' ')}* correctamente.`, msg)
  },
}
