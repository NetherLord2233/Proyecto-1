import db from "#db"
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'

const STAFF_JID = '120363431081392345@g.us'

const TMP_DIRECTORIES = [
  '../lib/system/tmp',
  path.resolve(process.cwd(), '../tmp')
]

const GIB = 1024 * 1024 * 1024
const MIB = 1024 * 1024
const WARNING_THRESHOLD = 2 * GIB
const CLEANUP_THRESHOLD = 3.2 * GIB

let isWarningSent = false

const getMotherConn = () => {
  if (
    global.conn &&
    (global.conn.sessionName === 'Owner' ||
      global.conn.sessionDir?.includes('Owner') ||
      global.conn.sessionPath?.includes('Owner') ||
      !global.conn.isSubbot)
  ) {
    return global.conn
  }

  if (Array.isArray(global.conns)) {
    const mother = global.conns.find(
      (c) =>
        c?.sessionName === 'Owner' ||
        c?.sessionDir?.includes('Owner') ||
        c?.sessionPath?.includes('Owner') ||
        c?.isMother ||
        !c?.isSubbot
    )
    if (mother) return mother
  }

  if (global.sessions) {
    if (global.sessions['Owner']) return global.sessions['Owner']
    if (global.sessions['Sessions/Owner']) return global.sessions['Sessions/Owner']
  }

  return global.conn
}

const notifyStaff = async (message) => {
  try {
    const motherConn = getMotherConn()

    if (motherConn?.sendMessage) {
      await motherConn.sendMessage(STAFF_JID, { text: message })
    } else {
      console.log(chalk.yellow(`[AVISO STAFF]: ${message}`))
    }
  } catch (err) {
    console.log(chalk.red(`Error al enviar mensaje al staff: ${err.message}`))
  }
}

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
    console.log(chalk.red(`Error calculando tamaño en ${dir}: ${err.message}`))
  }

  return total
}

const emptyDirectory = async (dir) => {
  if (!fs.existsSync(dir)) return

  try {
    const files = await fs.promises.readdir(dir)
    for (const file of files) {
      const itemPath = path.join(dir, file)
      try {
        const stats = await fs.promises.stat(itemPath)
        if (stats.isFile()) {
          await fs.promises.unlink(itemPath)
        } else if (stats.isDirectory()) {
          await fs.promises.rm(itemPath, { recursive: true, force: true })
        }
      } catch (err) {
        console.log(chalk.red(`Error eliminando ${itemPath}: ${err.message}`))
      }
    }
  } catch (e) {
    console.log(chalk.red(`Error vaciando ${dir}`))
  }
}

const formatBytes = (bytes) => {
  if (bytes >= GIB) {
    return `${(bytes / GIB).toFixed(2)} GiB`
  }
  return `${(bytes / MIB).toFixed(2)} MiB`
}

const performScheduledCleanup = async () => {
  try {
    let totalSize = 0

    for (const dir of TMP_DIRECTORIES) {
      totalSize += await getDirectorySize(dir)
    }

    const freedSpace = formatBytes(totalSize)

    for (const dir of TMP_DIRECTORIES) {
      await emptyDirectory(dir)
    }

    await notifyStaff(
      `\`[LIMPIEZA PROGRAMADA DE ROUTINE]\`\n\n` +
      `Se ha ejecutado el mantenimiento automático programado (cada 2 horas).\n\n` +
      `• *Espacio liberado:* *${freedSpace}*\n\n` +
      `Ambas carpetas \`tmp\` han sido vaciadas exitosamente.`
    )

    isWarningSent = false
  } catch (e) {
    console.log(chalk.red('Error en la limpieza programada de tmp:', e.message))
  }
}

const monitorAndCleanTmp = async () => {
  try {
    let totalSize = 0

    for (const dir of TMP_DIRECTORIES) {
      totalSize += await getDirectorySize(dir)
    }

    const sizeInGiB = (totalSize / GIB).toFixed(2)

    if (totalSize >= CLEANUP_THRESHOLD) {
      await notifyStaff(
        `\`[ALERTA CRÍTICA DE ALMACENAMIENTO]\`\n\n` +
        `El espacio en \`tmp\` alcanzó *${sizeInGiB}GiB*.\n\n` +
        `*Procediendo con la limpieza automática...*`
      )

      for (const dir of TMP_DIRECTORIES) {
        await emptyDirectory(dir)
      }

      await notifyStaff(`\`[LIMPIEZA COMPLETADA]\`\n\n\`tmp\` ha sido limpiado exitosamente.`)
      isWarningSent = false

    } else if (totalSize >= WARNING_THRESHOLD) {
      if (!isWarningSent) {
        await notifyStaff(
          `\`[ADVERTENCIA DE ALMACENAMIENTO]\`\n\n` +
          `\`tmp\` ha alcanzado *${sizeInGiB}GiB*.\n` +
          `\`\`\`Por favor ejecuta\`\`\` \`#cleartmp\` \`\`\`para limpiar en este momento\`\`\`\n` +
          `> Limpieza automática a los 3.2GiB.`
        )
        isWarningSent = true
      }
    } else {
      isWarningSent = false
    }

  } catch (e) {
    console.log(chalk.red('Error en la vigilancia de tmp:', e.message))
  }
}

setInterval(monitorAndCleanTmp, 300000)
monitorAndCleanTmp() // Vigilancia cada 5min

setInterval(performScheduledCleanup, 7200000) // Limpieza cada 2hs
