import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DIRECTORIES = {
  tmp1: path.resolve(process.cwd(), '../../tmp'),
  tmp2: path.resolve(process.cwd(), '../../lib/system/tmp')
}

const MIB = 1024 * 1024
const GIB = 1024 * 1024 * 1024

const parseSizeBytes = (input) => {
  if (!input) return null
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*([gmGM])$/i)
  if (!match) return null

  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()

  if (isNaN(value) || value <= 0) return null

  if (unit === 'G') {
    return Math.round(value * GIB)
  } else if (unit === 'M') {
    return Math.round(value * MIB)
  }

  return null
}

const generateDummyFile = (filePath, targetSizeBytes) => {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const writeStream = fs.createWriteStream(filePath)
    const chunkSize = 1 * MIB
    const randomChunk = crypto.randomBytes(chunkSize)

    let bytesWritten = 0

    const writeNextChunk = () => {
      let canContinue = true

      while (bytesWritten < targetSizeBytes && canContinue) {
        const remainingBytes = targetSizeBytes - bytesWritten
        const currentChunkSize = Math.min(chunkSize, remainingBytes)

        const chunkToWrite = currentChunkSize === chunkSize 
          ? randomChunk 
          : randomChunk.subarray(0, currentChunkSize)

        bytesWritten += currentChunkSize
        canContinue = writeStream.write(chunkToWrite)
      }

      if (bytesWritten < targetSizeBytes) {
        writeStream.once('drain', writeNextChunk)
      } else {
        writeStream.end()
      }
    }

    writeStream.on('finish', resolve)
    writeStream.on('error', reject)

    writeNextChunk()
  })
}

export default {
  command: ['tmp1', 'tmp2'],
  category: 'system',
  isOwner: true,
  description: 'Genera un archivo con peso personalizado para pruebas en las carpetas tmp.',
  run: async ({ msg, sock, usedPrefix, command, args }) => {
    const reply = (text) => 
      msg.reply ? msg.reply(text) : sock.sendMessage(msg.chat, { text }, { quoted: msg })

    const rawSizeInput = args[0]
    const targetSizeBytes = parseSizeBytes(rawSizeInput)

    if (!targetSizeBytes) {
      return reply(
        `⚠️ *[SINTAXIS INCORRECTA]*\n\n` +
        `Debes especificar el tamaño deseado usando *M* (MiB) o *G* (GiB).\n\n` +
        `*Ejemplos de uso:*\n` +
        `• \`${usedPrefix + command} 700M\`\n` +
        `• \`${usedPrefix + command} 2G\``
      )
    }

    const targetDirectory = DIRECTORIES[command]
    if (!targetDirectory) {
      return reply('❌ Directorio no configurado para este comando.')
    }

    const fileName = `dummy_test_${Date.now()}.tmp`
    const filePath = path.join(targetDirectory, fileName)

    try {
      await msg.react?.('🕒')

      await generateDummyFile(filePath, targetSizeBytes)

      let relativePath = path.relative(process.cwd(), targetDirectory)
      if (!relativePath || relativePath.startsWith('..')) {
        relativePath = targetDirectory
      } else {
        relativePath = `./${relativePath}`
      }

      const formattedRequestedSize = rawSizeInput.toUpperCase()

      await msg.react?.('✅')

      return reply(
        `📦 *[ARCHIVO DE PRUEBA GENERADO]*\n\n` +
        `• *Ubicación:* \`${relativePath}\`\n` +
        `• *Archivo:* \`${fileName}\`\n` +
        `• *Peso añadido:* *${formattedRequestedSize}*\n\n` +
        `El espacio en la carpeta se ha incrementado exitosamente.`
      )

    } catch (error) {
      console.error('[Error generating dummy tmp file]:', error)
      await msg.react?.('✖️')
      return reply('❌ Ocurrió un error al intentar generar el archivo de prueba.')
    }
  }
}
