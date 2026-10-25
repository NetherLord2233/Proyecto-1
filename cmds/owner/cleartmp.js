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

const emptyDirectory = async (dir) => {
  let deletedCount = 0
  if (!fs.existsSync(dir)) return deletedCount

  try {
    const files = await fs.promises.readdir(dir)
    for (const file of files) {
      const itemPath = path.join(dir, file)
      try {
        const stats = await fs.promises.stat(itemPath)
        if (stats.isFile()) {
          await fs.promises.unlink(itemPath)
          deletedCount++
        } else if (stats.isDirectory()) {
          await fs.promises.rm(itemPath, { recursive: true, force: true })
          deletedCount++
        }
      } catch (err) {
        console.error(`Error deleting ${itemPath}:`, err)
      }
    }
  } catch (err) {
    console.error(`Error emptying ${dir}:`, err)
  }

  return deletedCount
}

export default {
  command: ['cleartmp'],
  category: 'owner',
  description: 'Limpia manualmente el contenido de las carpetas temporales del bot y del host.',
  run: async ({ msg, sock }) => {
    const reply = (text) => 
      msg.reply ? msg.reply(text) : sock.sendMessage(msg.chat, { text }, { quoted: msg })

    try {
      await msg.react?.('🕒')

      let initialTotalSize = 0
      for (const dir of TMP_DIRECTORIES) {
        initialTotalSize += await getDirectorySize(dir)
      }

      let deletedItemsCount = 0
      for (const dir of TMP_DIRECTORIES) {
        deletedItemsCount += await emptyDirectory(dir)
      }

      const freedMb = (initialTotalSize / MIB).toFixed(2)
      const freedGib = (initialTotalSize / GIB).toFixed(2)
      const formattedSize = initialTotalSize >= GIB ? `${freedGib} GiB` : `${freedMb} MiB`

      await msg.react?.('✅')

      return reply(
        `\`[LIMPIEZA COMPLETADA]\`\n\n` +
        `• *Elementos eliminados:* ${deletedItemsCount}\n` +
        `• *Espacio liberado:* ${formattedSize}\n\n`
      )

    } catch (error) {
      console.error('[Error clearing tmp directories]:', error)
      await msg.react?.('✖️')
      return reply('❌ Ocurrió un error al intentar limpiar `tmp`')
    }
  }
}
