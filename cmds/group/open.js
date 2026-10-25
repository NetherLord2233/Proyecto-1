export default {
  command: ['open', 'abrir'],
  category: 'group',
  description: 'Abrir el grupo para que todos puedan enviar mensajes.',
  isAdmin: true,
  botAdmin: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const timeout = args[0]? msParser(args[0]) : 0;

      if (args[0] && timeout === null) {
        return sock.reply(msg.chat, 'Formato de tiempo inválido. Usa por ejemplo: 10s, 5m, 2h, 1d', msg);
      }

      if (timeout > 0) {
        await sock.reply(msg.chat, `❀ El grupo se abrirá en ${clockString(timeout)}.`, msg);

        setTimeout(async () => {
          try {
            await sock.groupSettingUpdate(msg.chat, 'not_announcement');
            await sock.sendMessage(msg.chat, {
              text: '✿ El tiempo programado ha finalizado. El grupo ha sido abierto correctamente.'
            });
          } catch (err) {
            console.error('Error al abrir el grupo por temporizador:', err);
          }
        }, timeout);

      } else {
        await sock.groupSettingUpdate(msg.chat, 'not_announcement');
        await sock.reply(msg.chat, `✿ El grupo ha sido abierto correctamente.`, msg);
      }
    } catch (e) {
      return msg.reply(`> Ocurrió un error inesperado al ejecutar el comando *${usedPrefix + command}*. Inténtalo de nuevo.\n> [Error: *${e.message}*]`);
    }
  },
};

function msParser(str) {
  const match = str.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function clockString(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;

  let parts = [];
  if (d > 0) parts.push(`${d} ${d === 1? 'día' : 'días'}`);
  if (h > 0) parts.push(`${h} ${h === 1? 'hora' : 'horas'}`);
  if (m > 0) parts.push(`${m} ${m === 1? 'minuto' : 'minutos'}`);
  if (s > 0) parts.push(`${s} ${s === 1? 'segundo' : 'segundos'}`);

  return parts.join(' ');
}