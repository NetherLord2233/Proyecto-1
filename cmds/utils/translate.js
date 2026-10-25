import axios from 'axios'

export default {
  command: ['translate', 'trad', 'traducir'],
  category: 'utils',
  description: 'Traduce texto al idioma especificado.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const defaultLang = 'es'
    let lang = defaultLang
    let text = ''

    const quotedText = msg.quoted?.text || msg.quoted?.caption || msg.quoted?.body || ''

    if (quotedText) {
      if (args[0] && args[0].length <= 5) {
        lang = args[0].toLowerCase()
        text = args.slice(1).join(' ') || quotedText
      } else {
        lang = defaultLang
        text = args.join(' ') || quotedText
      }
    } else {
      if (!args.length) {
        return msg.reply(
          `《✧》 *Uso del traductor:*\n` +
          `• *Traducir texto:* \`${usedPrefix + command} <idioma> <texto>\`\n` +
          `• *Traducir citado:* Responde a un mensaje con \`${usedPrefix + command} <idioma>\`\n\n` +
          `🌐 *Idiomas principales:*\n` +
          `• Español - \`es\`\n` +
          `• Inglés - \`en\`\n` +
          `• Portugués - \`pt\`\n` +
          `• Ruso - \`ru\`\n` +
          `• Francés - \`fr\`\n` +
          `• Alemán - \`de\`\n` +
          `• Italiano - \`it\`\n` +
          `• Japonés - \`ja\`\n` +
          `• Chino - \`zh\`\n` +
          `• Coreano - \`ko\``
        )
      }

      if (args[0].length <= 5 && args.length > 1) {
        lang = args[0].toLowerCase()
        text = args.slice(1).join(' ')
      } else {
        lang = defaultLang
        text = args.join(' ')
      }
    }

    if (!text.trim()) {
      return msg.reply('《✧》 No se encontró texto para traducir.')
    }

    try {
      await msg.react('🕒')

      let translatedText = null

      const evogbUrl = global.APIs?.evogb?.url || 'https://api.evogb.org'
      const evogbKey = global.APIs?.evogb?.key

      if (evogbKey) {
        try {
          const { data } = await axios.get(`${evogbUrl.replace(/\/$/, '')}/tools/translate`, {
            params: {
              key: evogbKey,
              text: text,
              to: lang,
              lang: lang
            },
            timeout: 10000
          })
          translatedText = data?.data?.message || data?.data?.translatedText || data?.data?.text || data?.result
        } catch {}
      }

      if (!translatedText) {
        try {
          const { data } = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`, {
            timeout: 10000
          })
          if (Array.isArray(data) && Array.isArray(data[0])) {
            translatedText = data[0].map(item => item[0]).filter(Boolean).join('')
          }
        } catch {}
      }

      if (!translatedText) {
        await msg.react('✖️')
        return msg.reply('《✧》 No se pudo obtener la traducción de ninguna API.')
      }

      await sock.sendMessage(msg.chat, { text: String(translatedText) }, { quoted: msg })
      await msg.react('✔️')

    } catch (e) {
      await msg.react('✖️')
      const errText = e.response?.data?.message || e.message
      await msg.reply(`> Ocurrió un error al ejecutar *${usedPrefix + command}*.\n> [Error: *${errText}*]`)
    }
  }
}
