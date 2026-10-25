import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tempDir = path.resolve(__dirname, '../../tmp')

const MIB = 1024 * 1024
const MAX_WHATSAPP_SIZE = 99 * MIB

const createZipArchive = (sourcePath, outputPath) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)

    archive.pipe(output)

    const stats = fs.statSync(sourcePath)
    if (stats.isDirectory()) {
      archive.directory(sourcePath, path.basename(sourcePath))
    } else {
      archive.file(sourcePath, { name: path.basename(sourcePath) })
    }

    archive.finalize()
  })
}

export default {
  command: ['zip'],
  category: 'owner',
  isOwner: true,
  description: 'Comprime cualquier archivo o directorio del sistema usando archiver y lo envía al chat.',
  run: async ({ msg, sock, usedPrefix, command, args }) => {
    const reply = (text) => 
      msg.reply ? msg.reply(text) : sock.sendMessage(msg.chat, { text }, { quoted: msg })

    const rawPathInput = args.join(' ').trim()

    if (!rawPathInput) {
      return reply(
        `⚠️ *[SINTAXIS INCORRECTA]*\n\n` +
        `Debes proporcionar la ruta completa o relativa del archivo o carpeta a comprimir.\n\n` +
        `*Ejemplos de uso:*\n` +
        `• \`${usedPrefix + command} /home/container/lib/system\`\n` +
        `• \`${usedPrefix + command} ./package.json\``
      )
    }

    const resolvedPath = path.resolve(rawPathInput)

    if (!fs.existsSync(resolvedPath)) {
      return reply(`❌ La ruta especificada no existe en el sistema:\n\`${resolvedPath}\``)
    }

    // Asegura la existencia del directorio tmp en la raíz
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const tempZipName = `zip_${Date.now()}_${Math.random().toString(36).substring(7)}.zip`
    const outputZipPath = path.join(tempDir, tempZipName)

    try {
      await msg.react?.('🕒')

      const itemStats = fs.statSync(resolvedPath)
      const isDirectory = itemStats.isDirectory()
      const targetName = path.basename(resolvedPath)

      await createZipArchive(resolvedPath, outputZipPath)

      if (!fs.existsSync(outputZipPath)) {
        throw new Error('No se pudo generar el archivo ZIP.')
      }

      const zipStats = fs.statSync(outputZipPath)
      const zipSizeMb = (zipStats.size / MIB).toFixed(2)

      if (zipStats.size > MAX_WHATSAPP_SIZE) {
        fs.unlinkSync(outputZipPath)
        await msg.react?.('❌')
        return reply(
          `⚠️ *[ARCHIVO DEMASIADO GRANDE]*\n\n` +
          `El archivo ZIP generado pesa *${zipSizeMb} MB*, lo cual excede el límite permitido por WhatsApp para el envío de documentos (~100 MB).`
        )
      }

      await sock.sendMessage(
        msg.chat,
        {
          document: { url: outputZipPath },
          mimetype: 'application/zip',
          fileName: `${targetName}.zip`,
          caption: `📦 *[COMPRESIÓN COMPLETADA]*\n\n` +
                   `• *Origen:* \`${targetName}\`\n` +
                   `• *Tipo:* ${isDirectory ? 'Directorio' : 'Archivo'}\n` +
                   `• *Peso:* *${zipSizeMb} MB*`
        },
        { quoted: msg }
      )

      await msg.react?.('✅')

    } catch (error) {
      console.error('[Error compressing system path]:', error)
      await msg.react?.('✖️')
      return reply(`❌ Ocurrió un error al comprimir:\n\`\`\`${error.message || error}\`\`\``)
    } finally {
      if (fs.existsSync(outputZipPath)) {
        try {
          fs.unlinkSync(outputZipPath)
        } catch (cleanupError) {
          console.error('[Error deleting temp zip file]:', cleanupError)
        }
      }
    }
  }
}
