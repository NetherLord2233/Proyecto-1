import fs from 'fs'
import path from 'path'

export default {
  command: ['checkdupe', 'checkcmds', 'duplicados'],
  category: 'owner',
  isInv: true,
  description: 'Revisa si un comando está duplicado',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const root = './cmds'
      if (!fs.existsSync(root)) {
        return sock.sendMessage(msg.chat, { text: '✘ No existe la carpeta./cmds' }, { quoted: msg })
      }

      if (!args[0]) {
        return sock.sendMessage(msg.chat, {
          text: `✐ Uso: *${usedPrefix + command} <comando>*\n\nEj: *${usedPrefix + command} help*`
        }, { quoted: msg })
      }

      const target = args[0].toLowerCase().replace(/[^a-z0-9]/g, '')
      const files = getAllFiles(root).filter(f => f.endsWith('.js'))

      let encontrados = []

      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8')
          const regex = /commands?\s*:\s*\[([^\]]+)\]|commands?\s*:\s*['"]([^'"]+)['"]/gi
          let match
          let cmdsInFile = []
          while ((match = regex.exec(content))!== null) {
            if (match[1]) {
              cmdsInFile.push(...match[1].split(',').map(c => c.replace(/['"`\s]/g, '').trim().toLowerCase()).filter(Boolean))
            } else if (match[2]) {
              cmdsInFile.push(match[2].toLowerCase())
            }
          }
          if (cmdsInFile.includes(target)) {
            encontrados.push({
              path: file.replace(/\\/g, '/'),
              cmds: cmdsInFile
            })
          }
        } catch {}
      }

      if (encontrados.length === 0) {
        return sock.sendMessage(msg.chat, {
          text: `✅ *Comando no encontrado*\n\n> El comando \`${target}\` no existe en ningún archivo.\n> Ruta escaneada: ${root}/`
        }, { quoted: msg })
      }

      if (encontrados.length === 1) {
        return sock.sendMessage(msg.chat, {
          text: `✅ *Sin duplicados*\n\n> Comando: \`${target}\`\n> Estado: Solo existe 1 vez\n> Ruta: \`${encontrados[0].path}\`\n> Comandos del archivo: [${encontrados[0].cmds.join(', ')}]`
        }, { quoted: msg })
      }

      let txt = `⚠️ *Duplicado detectado*\n\n> Comando: \`${target}\`\n> Veces encontrado: ${encontrados.length}\n\n`
      for (const f of encontrados) {
        txt += `• \`${f.path}\`\n └ [${f.cmds.join(', ')}]\n`
      }

      await sock.sendMessage(msg.chat, { text: txt }, { quoted: msg })

    } catch (err) {
      console.error(err)
      await msg.reply(msgglobal)
    }
  }
}

function getAllFiles(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const full = path.join(dir, file)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(full))
    } else {
      results.push(full)
    }
  }
  return results
}