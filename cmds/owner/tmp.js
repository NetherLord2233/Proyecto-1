import fs from 'fs'
import path from 'path'
import os from 'os'

const TMP_DIRECTORIES = [
  '../../lib/system/tmp',
  path.resolve(process.cwd(), '../../tmp'),
  os.tmpdir()
]

const GIB = 1024 * 1024 * 1024
const MIB = 1024 * 1024

const getDirectorySize = async (dir) => {
  let total = 0
  if (!fs.existsSync(dir)) return 0

  try {
    const files = await fs.promises.readdir(dir)
    for (const file of files) {
      const itemPath = path.join(dir, file)
      try {
        const stats = await fs.promises.stat(itemPath)
        if (stats.isFile()) {
          total += stats.size
        } else if (stats.isDirectory()) {
          total += await getDirectorySize(itemPath)
        }
      } catch (err) {
      }
    }
  } catch (err) {
    console.error(`Error calculating size in ${dir}:`, err)
  }

  return total
}

const formatBytes = (bytes) => {
  if (bytes >= GIB) {
    return `${(bytes / GIB).toFixed(2)} GiB`
  }
  return `${(bytes / MIB).toFixed(2)} MiB`
}

export default {
  command: ['tmp'],
  category: 'owner',
  isOwner: true,
  description: 'Muestra el peso actual de cada carpeta temporal por separado (incluyendo el tmp nativo).',
  run: async ({ msg, sock }) => {
    const reply = (text) => 
      msg.reply ? msg.reply(text) : sock.sendMessage(msg.chat, { text }, { quoted: msg })

    try {
      await msg.react?.('🕒')

      const reportLines = []
      let grandTotalSize = 0

      for (const dirPath of TMP_DIRECTORIES) {
        const folderSize = await getDirectorySize(dirPath)
        grandTotalSize += folderSize

        let relativePath = path.relative(process.cwd(), dirPath)
        if (!relativePath || relativePath.startsWith('..')) {
          relativePath = dirPath
        } else {
          relativePath = `./${relativePath}`
        }

        reportLines.push(`• \`${relativePath}\`: *${formatBytes(folderSize)}*`)
      }

      await msg.react?.('📊')

      const formattedTotal = formatBytes(grandTotalSize)

      return reply(
        `\`[ESTADO DE CARPETAS TMP]\`\n\n` +
        `${reportLines.join('\n')}\n\n` +
        `• *Peso total acumulado:* *${formattedTotal}*`
      )

    } catch (error) {
      console.error('[Error checking tmp directory sizes]:', error)
      await msg.react?.('✖️')
      return reply('❌ Ocurrió un error al verificar el tamaño de las carpetas temporales.')
    }
  }
}
