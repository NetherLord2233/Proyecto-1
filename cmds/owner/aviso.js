export default {
  command: ['aviso'],
  isStaff: true,
  category: 'owner',
  description: 'Envía un aviso (imagen, video o texto) con hidetag a grupos y canal oficial',

  run: async ({ sock, msg, args }) => {
    const gruposAviso = [
      '120363429827635405@g.us', // grupo avisos
    //  '120363423572821566@g.us', // Grupo principal elaina bot
      '120363429709106577@g.us', // Grupo de lofi bots
    ]

    const canales = [
      '120363426046552630@newsletter' // canal
    ]

    const canalLink = 'https://whatsapp.com/channel/0029VbCbocKJpe8WhogtnG0w'
    const newsletterJid = '120363426046552630@newsletter'
    const newsletterName = 'ᗩᗴTᕼᗴR ≜ ᒪᗩᗷՏ™'

    const extractText = (m) => {
      if (!m) return ''
      return (
        m.text ||
        m.caption ||
        m.body ||
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        m.message?.videoMessage?.caption ||
        ''
      )
    }

    const resultadoCanales = []
    const resultadoGrupos = []

    try {
      const textoArgs = args.join(' ').trim()
      const source = msg.quoted || msg
      const textQuoted = extractText(msg.quoted)
      const textArgs = textoArgs
      const textMsg = extractText(msg)

      const mime = source.mime || source.mimetype || source.mediaType || source.message?.imageMessage?.mimetype || source.message?.videoMessage?.mimetype || ''
      const isImage = /image/.test(mime) || !!source.message?.imageMessage || source.mtype === 'imageMessage'
      const isVideo = /video/.test(mime) || !!source.message?.videoMessage || source.mtype === 'videoMessage'
      const isGif = source.message?.videoMessage?.gifPlayback || false

      let buffer = null
      if (isImage || isVideo) {
        try { buffer = await source.download() } catch {}
      }

      const isOnlyCommand = !textoArgs && !textQuoted && !buffer
      const isCommandText = textMsg && (textMsg.trim().toLowerCase() === '.aviso' || textMsg.trim().toLowerCase() === 'aviso')
      
      if (isOnlyCommand || (isCommandText && !textoArgs && !textQuoted && !buffer)) {
        return sock.sendMessage(msg.chat, { 
          text: `《✧》 *Comando Aviso*\n\n*Uso:*\n-.aviso <texto>\n-.aviso + imagen/video/gif\n- Responde a un mensaje de texto, imagen o video con .aviso` 
        }, { quoted: msg })
      }

      const text = textoArgs || textQuoted || (isCommandText ? '' : textMsg)

      if (!text && !buffer) {
        return sock.sendMessage(msg.chat, { 
          text: `《✧》 *Comando Aviso*\n\n*Uso:*\n-.aviso <texto>\n-.aviso + imagen/video/gif\n- Responde a un mensaje de texto, imagen o video con .aviso` 
        }, { quoted: msg })
      }

      await sock.sendMessage(msg.chat, { react: { text: '📢', key: msg.key } })

      const sendGrupoCompleto = async (target) => {
        let mentions = []
        let sinHidetag = false
        try {
          const groupMeta = await sock.groupMetadata(target)
          mentions = groupMeta.participants ? groupMeta.participants.map(p => p.id) : []
        } catch (err) {
          sinHidetag = true 
          console.error(`[Aviso] Error obteniendo participantes en ${target}:`, err)
        }

        const contextInfo = {
          isForwarded: true,
          forwardingScore: 999,
          mentionedJid: mentions,
          forwardedNewsletterMessageInfo: {
            newsletterJid: newsletterJid,
            newsletterName: newsletterName,
            serverMessageId: 1
          }
        }

        const buttonParams = JSON.stringify({
          display_text: 'ver canal',
          url: canalLink,
          merchant_url: canalLink
        })

        const interactiveButtons = [
          {
            name: 'cta_url',
            buttonParamsJson: buttonParams
          }
        ]

        const baseOptions = {
          footer: 'ᗩᗴTᕼᗴR ≜ ᒪᗩᗷՏ™',
          contextInfo: contextInfo,
          mentions: mentions,
          interactiveButtons: interactiveButtons,
          nativeFlowMessage: {
            buttons: interactiveButtons
          }
        }

        if (buffer && isImage) {
          await sock.sendMessage(target, {
            image: buffer,
            caption: text,
            ...baseOptions
          })
        } else if (buffer && isVideo) {
          await sock.sendMessage(target, {
            video: buffer,
            caption: text,
            gifPlayback: isGif,
            mimetype: 'video/mp4',
            ...baseOptions
          })
        } else if (text) {
          await sock.sendMessage(target, {
            text: text,
            ...baseOptions
          })
        }

        return sinHidetag
      }

      const payloadCanal = buffer && isImage 
        ? { image: buffer, caption: text }
        : buffer && isVideo 
        ? { video: buffer, caption: text, gifPlayback: isGif }
        : { text: text }

      for (const target of canales) {
        try {
          await sock.sendMessage(target, payloadCanal)
          resultadoCanales.push({ target, ok: true }) 
          await new Promise(r => setTimeout(r, 400))
        } catch (err) {
          console.error(`[Aviso] Error canal ${target}:`, err)
          resultadoCanales.push({ target, ok: false, error: err?.message || String(err) }) 
        }
      }

      for (const target of gruposAviso) {
        try {
          const sinHidetag = await sendGrupoCompleto(target)
          resultadoGrupos.push({ target, ok: true, sinHidetag })
          await new Promise(r => setTimeout(r, 700))
        } catch (err) {
          console.error(`[Aviso] Error grupo ${target}:`, err)
          resultadoGrupos.push({ target, ok: false, error: err?.message || String(err) })
        }
      }

      let tipoEnviado = 'texto'
      if (buffer && isImage) tipoEnviado = 'imagen'
      else if (buffer && isVideo) tipoEnviado = isGif ? 'gif' : 'video'

      const gruposOk = resultadoGrupos.filter(r => r.ok).length
      const canalesOk = resultadoCanales.filter(r => r.ok).length
      const fallos = [...resultadoCanales, ...resultadoGrupos].filter(r => !r.ok)
      const sinHidetagList = resultadoGrupos.filter(r => r.ok && r.sinHidetag)

      if (fallos.length === 0 && sinHidetagList.length === 0) {
        return sock.sendMessage(msg.chat, { text: `《✧》 *Aviso (${tipoEnviado}) enviado correctamente a los grupos (con hidetag) y canal.*` }, { quoted: msg })
      }

      let resumen = `《✧》 *Aviso (${tipoEnviado}) enviado con problemas*\n\n`
      resumen += `• Grupos: ${gruposOk}/${gruposAviso.length}\n`
      resumen += `• Canal: ${canalesOk}/${canales.length}\n`
      if (fallos.length) {
        resumen += `\n*No se pudo enviar a:*\n` + fallos.map(f => `- ${f.target}\n  ${f.error}`).join('\n') + '\n'
      }
      if (sinHidetagList.length) {
        resumen += `\n*Enviado sin hidetag (no se pudo leer los participantes):*\n` + sinHidetagList.map(f => `- ${f.target}`).join('\n') + '\n'
      }
      return sock.sendMessage(msg.chat, { text: resumen.trim() }, { quoted: msg })

    } catch (e) {
      console.error(e)
      return sock.sendMessage(msg.chat, { text: `《✧》 *Error:*\n\n${e.message}` }, { quoted: msg })
    }
  }
        }
