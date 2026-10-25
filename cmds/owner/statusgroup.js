export default {
  command: ['swgc', 'statusgrup'],
  category: 'grupos',
  description: 'Envía un mensaje como estado del grupo (borde lila y colores aleatorios).',

  run: async ({ msg, sock }) => {

    // Extracción limpia del texto ingresado después del comando
    const textInput = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const commandRegex = /^[.€\/!#]\w+\s*/; 
    const input = textInput.replace(commandRegex, '').trim();

    const chatId = msg.key.remoteJid;
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMsg) {
      return await sock.sendMessage(chatId, {
        text: '⚠️ ¡Debes responder a la imagen, video o texto que quieres poner como estado!\n\n💡 *Ejemplo:* `.swgc Apoya el proyecto | 🔥`'
      }, { quoted: msg });
    }

    let msgType = Object.keys(quotedMsg).find(k => k.endsWith('Message') && k !== 'messageContextInfo');
    let raw;

    if (!msgType) {
      if (quotedMsg.conversation) {
        msgType = 'extendedTextMessage';
        raw = { text: quotedMsg.conversation };
      } else {
        return await sock.sendMessage(chatId, { text: '❌ ¡Tipo de mensaje no reconocido!' }, { quoted: msg });
      }
    } else {
      raw = { ...quotedMsg[msgType] };
    }

    // 🎨 MAGIA DE COLORES Y FUENTES ALEATORIAS
    if (msgType === 'extendedTextMessage') {
      // Colección de paletas compatibles con ARGB de WhatsApp (Alpha, Red, Green, Blue)
      const paletas = [
        { bg: 'FF9C27B0', txt: 'FFFFFFFF' }, // Lila clásico / Texto Blanco
        { bg: 'FF2196F3', txt: 'FFFFFFFF' }, // Azul / Texto Blanco
        { bg: 'FFF44336', txt: 'FFFFFFFF' }, // Rojo / Texto Blanco
        { bg: 'FF000000', txt: 'FF00FFFF' }, // Negro oscuro / Texto Cyan brillante
        { bg: 'FF4CAF50', txt: 'FFFFFFFF' }, // Verde / Texto Blanco
        { bg: 'FFFF9800', txt: 'FFFFFFFF' }, // Naranja / Texto Blanco
        { bg: 'FFE91E63', txt: 'FFFFFFFF' }, // Rosa / Texto Blanco
        { bg: 'FF006064', txt: 'FFFFFF00' }, // Teal oscuro / Texto Amarillo
        { bg: 'FF303F9F', txt: 'FFFF80AB' }, // Indigo oscuro / Texto Rosa pastel
        { bg: 'FF212121', txt: 'FF00FF00' }  // Gris oscuro / Texto Verde Neón
      ];

      // Elegimos una combinación al azar
      const paletaRandom = paletas[Math.floor(Math.random() * paletas.length)];

      // Convertimos el Hexadecimal directamente a los enteros de 32 bits que pide Baileys
      raw.textArgb = parseInt(paletaRandom.txt, 16);
      raw.backgroundArgb = parseInt(paletaRandom.bg, 16);

      // Elegimos una fuente de WhatsApp al azar (del 1 al 8)
      raw.font = Math.floor(Math.random() * 8) + 1;
    }

    // Configuración del Nombre y Emoji para el estado superior
    if (input) {
      const [listName = '', listEmoji = ''] = input.split('|').map(s => s.trim());
      raw.contextInfo = {
        ...(raw.contextInfo || {}),
        statusAudienceMetadata: {
          audienceType: 2, 
          ...(listName ? { listName } : {}),
          ...(listEmoji ? { listEmoji } : {})
        }
      };
    }

    try {
      // Envío forzado para mantener el formato V2
      await sock.relayMessage(chatId, {
        groupStatusMessageV2: { message: { [msgType]: raw } }
      }, {
        customNodes: [{ tag: 'meta', attrs: { is_group_status: 'true' } }],
        additionalAttributes: { type: 'text' }
      });

      // Confirmación
      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (error) {
      console.error('[SWGC ERROR]', error);
      await sock.sendMessage(chatId, { 
        text: `❌ Ocurrió un error al enviar el estado.\nDetalle: ${error.message}` 
      }, { quoted: msg });
    }
  }
};