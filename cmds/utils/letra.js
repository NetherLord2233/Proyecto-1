import fetch from 'node-fetch'

export default {
  command: ['lyrics', 'lyric', 'letra'],
  category: 'descargas',
  description: 'Busca y muestra la letra completa de una canción.',
  run: async ({ msg, sock, args, text, usedPrefix, command }) => {
    const query = text || args.join(' ')
    if (!query) return msg.reply(`✿ Debes escribir el nombre de la canción.\n> Ejemplo: *${usedPrefix + command} despacito*`)

    try {
      await sock.sendMessage(msg.chat, { react: { text: '🕑', key: msg.key } })

      const api = global.APIs.evogb
      if (!api?.key) return msg.reply('✿ No hay API Key configurada para EvoGB.')

      const url = `${api.url}/tools/lyrics?key=${api.key}&q=${encodeURIComponent(query)}`
      
      const res = await fetch(url)
      const json = await res.json()

      if (!json.status || !json.data) {
        return msg.reply(`✿ No se encontró la letra para *${query}*`)
      }

      const data = json.data
      const title = data.title || 'Desconocido'
      const artist = data.artist || 'Desconocido'
      const album = data.album || '-'
      const duration = data.timestamp || `${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, '0')}`

      let caption = `《✧》 *${title}*\n`
      caption += `> Artista: ${artist}\n`
      caption += `> Álbum: ${album}\n`
      caption += `> Duración: ${duration}\n\n`
      caption += `${data.plainLyrics || data.lyrics}`

      if (data.thumbnail) {
        await sock.sendMessage(msg.chat, { 
          image: { url: data.thumbnail },
          caption: caption
        }, { quoted: msg })
      } else {
        await sock.sendMessage(msg.chat, { text: caption }, { quoted: msg })
      }

      await sock.sendMessage(msg.chat, { react: { text: '✅', key: msg.key } })

    } catch (e) {
      console.log(e)
      return msg.reply(`⚠️ Error al buscar la letra: ${e.message}`)
    }
  }
}