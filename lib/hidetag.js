const MEDIA_TYPES = ['image', 'video', 'audio', 'sticker', 'document'];

export const getMentions = (participants = []) =>
  participants.map(p => p?.id).filter(Boolean);

export function getMediaType(src) {
  if (!src) return null;
  const mtype = src.mtype || '';
  const msgKeys = Object.keys(src.message || {});
  for (const t of MEDIA_TYPES) {
    const key = `${t}Message`;
    if (mtype === key || msgKeys.includes(key)) return t;
  }
  const hint = String(src.mimetype || src.mediaType || '');
  return MEDIA_TYPES.find(t => hint === t || hint.startsWith(`${t}/`)) || null;
}

export async function sendHidetag(sock, chat, participants, { text = '', src = null, fallbackText = '' } = {}) {
  const mentions = getMentions(participants);
  if (!mentions.length) throw new Error('No se pudo obtener la lista de participantes del grupo');

  const type = getMediaType(src);
  const caption = (text || fallbackText || '').trim();
  const withCaption = caption ? { caption } : {};

  if (!type) {
    if (!caption) return false;
    await sock.sendMessage(chat, { text: caption, mentions });
    return true;
  }

  const media = await src.download();
  const raw = src.message?.[`${type}Message`] || {};
  let content;
  switch (type) {
    case 'image':
      content = { image: media, ...withCaption };
      break;
    case 'video':
      content = { video: media, mimetype: 'video/mp4', gifPlayback: Boolean(raw.gifPlayback), ...withCaption };
      break;
    case 'audio':
      content = { audio: media, mimetype: raw.mimetype || 'audio/mp4', ptt: Boolean(raw.ptt) };
      break;
    case 'sticker':
      content = { sticker: media };
      break;
    case 'document':
      content = {
        document: media,
        mimetype: raw.mimetype || 'application/octet-stream',
        fileName: raw.fileName || 'archivo',
        ...withCaption,
      };
      break;
  }
  await sock.sendMessage(chat, { ...content, mentions });
  return true;
}
