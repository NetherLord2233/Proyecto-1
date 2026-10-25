import fetch from 'node-fetch'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execPromise = promisify(exec)
const TMP = path.resolve(process.cwd(), '../../tmp')
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })

const regex = /^(?:https:\/\/(?:[^:@\/]+:[^@\/]+@)?|git@)github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/i

export default {
  command: ['gitclone', 'git'],
  category: 'utils',
  description: 'Buscar y descargar un repositorio de GitHub.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    if (!text) {
      return sock.reply(msg.chat, '《✧》 Por favor, proporciona un enlace o nombre del repositorio de GitHub.', msg)
    }
    let cloneDir = null
    let zipOut = null
    try {
      await msg.react('🕒')
      let info = ''
      let image
      let zipBuffer, zipName
      let repos = []
      
      const cleanText = text.trim()
      const match = cleanText.match(regex)
      
      let token = null
      if (cleanText.startsWith('https://') && cleanText.includes('@')) {
        try {
          const urlObj = new URL(cleanText)
          if (urlObj.password) {
            token = urlObj.password
          }
        } catch (err) {}
      }

      const headers = { 'User-Agent': 'Node.js-Bot' }
      if (token) {
        headers['Authorization'] = `token ${token}`
      }

      if (match) {
        const [, user, repo] = match
        const repoRes = await fetch(`https://api.github.com/repos/${user}/${repo}`, { headers })
        const repoData = await repoRes.json()

        if (!repoData || !repoData.owner) {
          return sock.reply(msg.chat, '《✧》 No se encontró el repositorio o la API de GitHub denegó el acceso.', msg)
        }

        cloneDir = path.join(TMP, `git-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        zipOut = `${cloneDir}.zip`

        let cloneUrl = repoData.clone_url
        if (token) {
          try {
            const urlObj = new URL(cleanText)
            const originalUrl = new URL(repoData.clone_url)
            originalUrl.username = urlObj.username
            originalUrl.password = urlObj.password
            cloneUrl = originalUrl.toString()
          } catch (err) {}
        }

        await execPromise(`git clone --depth=1 ${cloneUrl} ${cloneDir}`)
        await execPromise(`zip -r ${zipOut} ${path.basename(cloneDir)}`, { cwd: TMP })

        zipBuffer = fs.readFileSync(zipOut)
        zipName = `${repo}-${user}.zip`
        repos.push(repoData)
        image = 'https://cdn.yuki-wabot.my.id/files/MqnN.jpeg'
      } else {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(cleanText)}`, { headers })
        const json = await res.json()
        if (!json.items || !json.items.length) {
          return sock.reply(msg.chat, '《✧》 No se encontraron resultados.', msg)
        }
        if (json.items.length === 1) {
          const repo = json.items[0]

          cloneDir = path.join(TMP, `git-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          zipOut = `${cloneDir}.zip`

          await execPromise(`git clone --depth=1 ${repo.clone_url} ${cloneDir}`)
          await execPromise(`zip -r ${zipOut} ${path.basename(cloneDir)}`, { cwd: TMP })

          zipBuffer = fs.readFileSync(zipOut)
          zipName = `${repo.name}-${repo.owner.login}.zip`
          repos.push(repo)
          image = Buffer.from(await (await fetch(repo.owner.avatar_url, { headers })).arrayBuffer())
        } else {
          repos = json.items
          image = Buffer.from(await (await fetch(repos[0].owner.avatar_url, { headers })).arrayBuffer())
        }
      }

      info += repos.map((repo, index) => `✩ Resultado: ${index + 1}
✩ Creador: ${repo.owner.login}
✩ Nombre: ${repo.name}
✩ Creado: ${formatDate(repo.created_at)}
✩ Actualizado: ${formatDate(repo.updated_at)}
✩ Visitas: ${repo.watchers}
✩ Bifurcado: ${repo.forks}
✩ Estrellas: ${repo.stargazers_count}
✩ Issues: ${repo.open_issues}
✩ Descripción: ${repo.description ? repo.description : 'Sin Descripción'}
✩ Enlace: ${repo.clone_url}`).join('\n────────────────────\n')

      await sock.sendFile(msg.chat, image, 'github_info.jpg', info.trim(), msg)
      if (zipBuffer && zipName) {
        await sock.sendFile(msg.chat, zipBuffer, zipName, null, msg)
      }
      await msg.react('✔️')
    } catch (e) {
      await msg.react('✖️')
      return sock.reply(msg.chat, `> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`, msg)
    } finally {
      try { if (cloneDir && fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true }) } catch {}
      try { if (zipOut && fs.existsSync(zipOut)) fs.unlinkSync(zipOut) } catch {}
    }
  }
}

function formatDate(n, locale = 'es') {
  const d = new Date(n)
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
}
