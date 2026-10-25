import db from "#db"
import fs from 'fs'
import path from 'path'
import { prepareWAMessageMedia } from 'baileys'
import moment from 'moment-timezone'
import os from 'os'

const ALLOWED_CATS = ['owner']

function getFilesRecursively(dir) {
  let results = []
  if (!fs.existsSync(dir)) return results

  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath))
    } else if (item.isFile() && item.name.endsWith('.js')) {
      results.push(fullPath)
    }
  }
  return results
}

function parseCommandFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')

    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')

    const cmdMatch = cleanContent.match(/command:\s*\[([^\]]+)\]/s)
    const descMatch = cleanContent.match(/description:\s*['"`]([^'"`]+)['"`]/)
    const usoMatch = cleanContent.match(/uso:\s*['"`]([^'"`]+)['"`]/)

    if (!cmdMatch) return null

    const alias = cmdMatch[1]
     .split(',')
     .map(a => a.replace(/['"`\s]/g, '').split(/[\/#!+.\-]+/).pop().toLowerCase())
     .filter(Boolean)

    return {
      alias,
      desc: descMatch ? descMatch[1] : 'Sin descripción',
      uso: usoMatch ? usoMatch[1] : ''
    }
  } catch { return null }
}

export default {
  command: ['help2', 'menu2', 'modmenu', 'menuowner'],
  isInv: true,
  category: 'info',
  description: 'Menú owners',
  run: async ({ msg, sock, args, command, usedPrefix: prefix }) => {
    try {
      const botTime = moment().tz('America/Bogota').format('DD MMM YYYY, hh:mm A')

      const botId = sock?.user?.id.split(':')[0] + '@s.whatsapp.net' || ''
      const botSettings = await db.getSettings(botId)
      const { namebot = '', namebot2 = '', banner = '', owner = '' } = botSettings

      const link = 'https://api.evogb.org'
      const isOficialBot = botId === (global?.sock?.user?.id?.split(':')[0] + '@s.whatsapp.net')
      const botType = isOficialBot ? 'Owner' : 'Sub Bot'
      const platform = `${os.type()} ${os.release()} ${os.arch()}`

      const userr = await db.getUser()
      const own = await db.getUser(owner)
      const dev = owner && !isNaN(owner.replace('@s.whatsapp.net', '')) ? own.name : owner || 'Oculto'

      let menu = `> *¡ʜᴏʟᴀ!* ${msg.pushName}, como está tu día?, mucho gusto mi nombre es *${namebot2}* ʚ♡⃛ɞ(ू•ᴗ•ू❁)*\n\n` +
      ` ⌒࣪᷼⏜͡ ۪ ࿚ꨪᰰ࿙ ࣭࣪⢏࣭۟⢢࣭ׄ᎐፝֟᎐࣭ׄ⡔࣭۟⡹࣭ׄ ࿚ꨪᰰ࿙ ۪ ͡⏜ׄ᷼⌒\n\n` +
      `: ̗̀〄 *ᴅᴇᴠᴇʟᴏᴘᴇʀ ::* 𝙻𝚘𝙵𝚒 ☕︎ 𝚃𝙴𝙰𝙼™\n` +
      `: ̗̀☕︎ *ᴏᴡɴᴇʀ ::* ${dev}\n` +
      `: ̗̀ꕥ *ᴛɪᴘᴏ ::* ${botType}\n` +
      `: ̗̀☄︎ *sɪsᴛᴇᴍᴀ/ᴏᴘʀ ::* ${platform}\n\n` +
      `: ̗̀❖ *ᴜsᴇʀs ::* ${(Object.keys(userr).length || 0).toLocaleString()}\n` +
      `: ̗̀❖ *ᴍɪ ᴛɪᴇᴍᴘᴏ ::* ${botTime} (Colombia)\n` +
      `: ̗̀❖ *ᴜʀʟ ::* ${link}\n\n` +
      ` ⌒࣪᷼⏜͡ ۪ ࿚ꨪᰰ࿙ ࣭࣪⢏࣭۟⢢࣭ׄ᎐፝֟᎐࣭ׄ⡔࣭۟⡹࣭ׄ ࿚ꨪᰰ࿙ ۪ ͡⏜ׄ᷼⌒\n\n` +
      `⋆｡ﾟ☁ ｡° *ᴄᴏᴍ꯭ᴀ꯭ɴᴅᴏs* ﾟ｡˚₊ 𓂃\n`

      const basePath = './cmds'
      const cats = {}

      for (const cat of ALLOWED_CATS) {
        const dir = path.join(basePath, cat)
        if (!fs.existsSync(dir)) continue

        const files = getFilesRecursively(dir)
        for (const filePath of files) {
          const parsed = parseCommandFile(filePath)
          if (!parsed) continue
          if (!cats[cat]) cats[cat] = []

          const exists = cats[cat].some(c => c.alias[0] === parsed.alias[0])
          if (!exists) cats[cat].push(parsed)
        }
      }

      const catArg = args[0]?.toLowerCase()
      if (catArg && !cats[catArg]) return msg.reply(`《✤》 La categoría *${catArg}* no fue encontrada.`)

      const dbPathMaintenance = './mantenimiento_categorias.json';
      let dbMant = {};
      if (fs.existsSync(dbPathMaintenance)) {
          dbMant = JSON.parse(fs.readFileSync(dbPathMaintenance, 'utf-8'));
      }

      for (const [cat, cmds] of Object.entries(cats)) {
        if (catArg && cat.toLowerCase() !== catArg) continue
        if (cmds.length === 0) continue

        let displayName = `${cat.charAt(0).toUpperCase() + cat.slice(1)} ☆(ﾉ◕ヮ◕)ﾉ*`;
        if (dbMant[cat.toLowerCase()]) {
            displayName = `${cat.charAt(0).toUpperCase() + cat.slice(1)} 🛑 (Bloqueado: ${dbMant[cat.toLowerCase()]})`;
        }

        menu += `\n╭╼ׅࣶ፝֟╾╌ֵ╾͜─ํ͜┈ְ ࣭࣪⢏࣭ࣧ⢢࣭ׄ᎐፝֟͟͝᎐࣭ׄ⡔࣭ࣧ⡹࣭ׄ࣪ ְ┈ํ͜─͜╼ꨪᰰ╾࣮╌╼ࣶׅ፝֟╾╮\n│❀ *${displayName}*\n├╾ׅ╴ׂ╌╶ׅ╌ׂ─ 〫─ׂ┄ׅ╴ׂ╌ׅ╶╼. ╾ׅ╴ׂ╌╶ׅ╌ׂ\n`
        cmds.forEach(cmd => {
          menu += `│✿ ${cmd.alias.map(a => prefix + a.toLowerCase()).join(' › ')} ${cmd.uso ? `+ ${cmd.uso}` : ''}\n> ✺ ${cmd.desc}\n`
        })
        menu += `╰╼ׅࣶ፝֟╾╌ֵ╾͜─ํ͜┈ְ ࣭࣪⢏࣭ࣧ⢢࣭ׄ᎐፝֟͟͝᎐࣭ׄ⡔࣭ࣧ⡹࣭ׄ ְ┈ํ͜─͜╼ꨪᰰ╾࣮╌╼ࣶׅ፝֟╾╯ \n`
      }

      menu += `\n> *${namebot2} desarrollado por 𝙻𝚘𝙵𝚒 ☕︎ 𝚃𝙴𝙰𝙼™* ૮(˶ᵔᵕᵔ˶)ა`

      const isVideo = /\.(mp4|gif|webm)$/i.test(banner)
      const ctx = { mentionedJid: null, isForwarded: false }

      if (isVideo) {
        await sock.sendMessage(msg.chat, { video: { url: banner }, caption: menu.trim(), contextInfo: ctx }, { quoted: msg })
      } else {
        const preview = link && banner ? await prepareWAMessageMedia({ image: { url: banner } }, { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }).then(m => ({ 'canonical-url': link, 'matched-text': link, title: namebot, description: `${namebot2}, Built With 💜 By 𝙻𝚘𝙵𝚒 ☕︎ 𝚃𝙴𝙰𝙼™ `, jpegThumbnail: m.imageMessage?.jpegThumbnail ? Buffer.from(m.imageMessage.jpegThumbnail) : undefined, highQualityThumbnail: m.imageMessage || undefined })) : undefined
        await sock.sendMessage(msg.chat, { text: menu.trim(), linkPreview: preview, contextInfo: ctx }, { quoted: msg })
      }
    } catch (e) {
      console.log(e)
      await msg.reply(typeof msgglobal !== 'undefined' ? msgglobal : '❌ Ocurrió un error al generar el menú.')
    }
  }
}
