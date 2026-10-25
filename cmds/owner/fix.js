import { exec } from 'child_process'
import { promisify } from 'util'
import chalk from 'chalk'
import { updateSettings } from '#db'

const execPromise = promisify(exec)

export default {
  command: ['fix', 'update',],
  isOwner: true,
  description: 'Actualiza el bot desde GitHub sin reiniciar.',
  run: async ({ sock, msg }) => {
    const client = sock
    const m = msg

    const permitidos = [
      '573015200599',
      '5491128178894',
      '5491157745642',
      '593989068253',
      '104260465336559@lid',
    ]
    const who = m?.sender || m?.key?.participant || m?.key?.remoteJid
    const normalizar = (jid = '') => jid.replace(/[^0-9]/g, '')
    if (!permitidos.map(normalizar).includes(normalizar(who))) {
      return client.sendMessage(m.chat, { text: '《✧》 No tienes permiso para usar este comando.\n\n> Solo usuarios autorizados pueden usar fix' }, { quoted: m })
    }

    try {
      await client.sendMessage(m.chat, { react: { text: '🕑', key: m.key } })

      await execPromise('git config user.email "bot@host.com"')
      await execPromise('git config user.name "HostBot"')
      await execPromise('git fetch origin')

      const { stdout: branch } = await execPromise('git rev-parse --abbrev-ref HEAD')
      const currentBranch = branch.trim()
      const remoteRef = `origin/${currentBranch}`

      const { stdout: diffStatus } = await execPromise(
        `git diff --name-status --no-renames HEAD..${remoteRef}`,
        { maxBuffer: 1024 * 1024 * 10 }
      ).catch(() => ({ stdout: '' }))

      const { stdout: log } = await execPromise(
        `git log HEAD..${remoteRef} --no-renames --name-only --pretty=format:"@@%an"`,
        { maxBuffer: 1024 * 1024 * 10 }
      ).catch(() => ({ stdout: '' }))

      const lastAuthor = new Map()
      let author = ''
      for (const line of log.split('\n')) {
        const l = line.trim()
        if (!l) continue
        if (l.startsWith('@@')) { author = l.slice(2); continue }
        if (!lastAuthor.has(l)) lastAuthor.set(l, author)
      }

      const { stdout: info } = await execPromise(
        `git log HEAD..${remoteRef} --format="%an" -1`
      ).catch(() => ({ stdout: 'Desconocido' }))

      const lines = diffStatus.trim().split('\n').filter(line => line.trim() !== '')
      const totalFiles = lines.length

      await execPromise(`git reset --hard ${remoteRef}`)

      const botJid = client.user.id.split(':')[0] + '@s.whatsapp.net'
      try {
        updateSettings(botJid, 'updateFor', m.sender)
      } catch (e) {
        console.error('No se pudo guardar quién actualizó:', e)
      }

      const MAX = 30
      const changeList = lines.slice(0, MAX).map(line => {
        const [status, ...fileParts] = line.split('\t')
        const file = fileParts.join('\t')
        const by = lastAuthor.get(file) || 'Desconocido'
        const icon = status === 'A' ? '+' : status === 'D' ? '-' : status === 'M' ? '•' : '?'
        return `${icon} ${file} → ${by}`
      }).join('\n')

      let text = `❀ *Actualización exitosa*\n\n`
      text += `亗 *Editor:* ${info.trim()}\n`
      text += `✎ *Total Cambios:* ${totalFiles}\n\n`

      if (totalFiles > 0) {
        text += `ꕥ *Detalles de archivos:*\n\`\`\`${changeList}${totalFiles > MAX ? `\n... y ${totalFiles - MAX} más` : ''}\`\`\`\n\n`
        text += `> *Los cambios en index/handler requieren reiniciar el bot.*`
      } else {
        text += `> *El bot ya se encuentra en su última versión.*`
      }

      await client.sendMessage(m.chat, { text }, { quoted: m })
      await client.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

      console.log(chalk.greenBright(`✅ Actualizado sin reiniciar.`))

    } catch (error) {
      console.log(chalk.red('[Error al actualizar]:'), error)
      await client.sendMessage(m.chat, { text: `⚠️ *Error al actualizar:* \n${error.message}` }, { quoted: m })
    }
  }
}
