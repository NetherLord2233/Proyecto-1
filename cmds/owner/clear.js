import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default {
 command: ['clear'],
 category: 'owner',
 description: 'Limpia la basura de Baileys.',
 isInv: true,
 run: async ({ sock, msg }) => {
  try {
   const botDirs = [
    { label: 'Subbot', path: path.resolve(dirname, '../../Sessions/Subs') },
    { label: 'Owner', path: path.resolve(dirname, '../../Sessions/Owner') },
   ]

   let totalArchivos = 0
   let totalCarpetasProcesadas = 0
   let details = []

   for (const { label, path: baseDir } of botDirs) {
    if (!fs.existsSync(baseDir)) continue

    const subDirs = fs.readdirSync(baseDir).filter(dir => {
     const fullPath = path.join(baseDir, dir)
     return fs.statSync(fullPath).isDirectory()
    })

    for (const subDir of subDirs) {
     const subPath = path.join(baseDir, subDir)
     const files = fs.readdirSync(subPath)

     let eliminated = 0
     let carpetaModificada = false

     for (const file of files) {
      if (file !== 'creds.json') {
       const filePath = path.join(subPath, file)
       try {
        await fs.promises.rm(filePath, { recursive: true, force: true })
        eliminated++
        totalArchivos++
        carpetaModificada = true
       } catch (e) {}
      }
     }

     if (carpetaModificada) {
      totalCarpetasProcesadas++
      details.push(`[${label}] *${subDir}*: ${eliminated} archivos`)
     }
    }
   }

   let text = `《✧》 *LIMPIEZA GENERAL COMPLETADA*\n\n`
   text += `*Total carpetas limpiadas:* ${totalCarpetasProcesadas}\n`
   text += `*Total archivos eliminados:* ${totalArchivos}\n`

   if (details.length > 0) {
    text += `\n*Detalles por sesión:*\n${details.join('\n')}`
   } else {
    text += `\n_No se encontraron archivos para limpiar._`
   }

   await sock.sendMessage(msg.chat, { text }, { quoted: msg })

  } catch (err) {
   console.error(err)
   await sock.sendMessage(msg.chat, { text: '✧ Error crítico durante la limpieza' }, { quoted: msg })
  }
 }
};