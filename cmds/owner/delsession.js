import fs from 'fs'
import path from 'path'

export default {
  command: ['delsession'],
  category: 'owner',
  isOwner: true,
  description: 'Elimina el socket del usuario mencionado',

  run: async ({ sock, msg, args }) => {
    const client = sock
    const m = msg
    const numero = (args[0] || '').replace(/\D/g, '')

    if (!numero) {
      return m.reply(
        '✎ Uso correcto:\n\n' +
        '*de 5730XXXXXXXX*'
      )
    }

    const rutas = [
      {
        nombre: 'Subs',
        ruta: path.join(process.cwd(), 'Sessions', 'Subs', numero)
      },
      {
        nombre: 'Prems',
        ruta: path.join(process.cwd(), 'Sessions', 'Prems', numero)
      }
    ]

    for (const carpeta of rutas) {
      if (fs.existsSync(carpeta.ruta)) {
        try {
          fs.rmSync(carpeta.ruta, {
            recursive: true,
            force: true
          })

          return m.reply(
            `✅ Sesión eliminada correctamente.\n\n` +
            `📂 Carpeta: ${carpeta.nombre}\n` +
            `📱 Número: ${numero}`
          )
        } catch (e) {
          return m.reply(
            `❌ Error al eliminar la sesión.\n\n${e.message}`
          )
        }
      }
    }

    return m.reply(
      `❌ No se encontró ninguna sesión con el número:\n${numero}`
    )
  }
}