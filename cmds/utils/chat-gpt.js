import fetch from 'node-fetch';
import FormData from 'form-data';
import db from '#db';

const langs = { typescript: 'ts', javascript: 'js', python: 'py', html: 'html', css: 'css', java: 'java', cpp: 'cpp', c: 'c', json: 'json', bash: 'sh', sql: 'sql', rust: 'rs', go: 'go', php: 'php', ruby: 'rb' };

const CREATOR_NUMBERS = ['573015200599'];

function getBogotaTime() {
  const now = new Date();
  const options = { timeZone: 'America/Bogota', hour12: true, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const formatter = new Intl.DateTimeFormat('es-CO', options);
  const parts = formatter.formatToParts(now);
  const get = t => parts.find(p => p.type === t)?.value || '';
  const hour24 = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' })).getHours();
  let saludo = 'días';
  if (hour24 >= 0 && hour24 < 12) saludo = 'días';
  else if (hour24 >= 12 && hour24 < 18) saludo = 'tardes';
  else saludo = 'noches';
  return {
    full: formatter.format(now),
    saludo,
    hour: hour24,
    dateStr: `${get('weekday')} ${get('day')} de ${get('month')} de ${get('year')}`,
    timeStr: `${get('hour')}:${get('minute')} ${get('dayPeriod')}`,
    iso: now.toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  };
}

function detectLanguage(query, response) {
  const q = query.toLowerCase();
  const r = response;
  if (/typescript/i.test(q)) return 'typescript';
  if (/\bpython\b/i.test(q)) return 'python';
  if (/\bhtml\b/i.test(q)) return 'html';
  if (/\bcss\b/i.test(q)) return 'css';
  if (/\bjava\b(?!script)/i.test(q)) return 'java';
  if (/\bc\+\+|cpp\b/i.test(q)) return 'cpp';
  if (/\bjson\b/i.test(q)) return 'json';
  if (/\bbash\b|\bshell\b/i.test(q)) return 'bash';
  if (/\bsql\b/i.test(q)) return 'sql';
  if (/\brust\b/i.test(q)) return 'rust';
  if (/\bgolang\b|\bgo\b/i.test(q)) return 'go';
  if (/\bphp\b/i.test(q)) return 'php';
  if (/\bruby\b/i.test(q)) return 'ruby';
  if (/javascript/i.test(q)) return 'javascript';
  const asksCode = /(c[oó]digo|code|programa|script|funci[oó]n|clase|m[eé]todo|algoritmo|actualiza|edita|crea|implementa)/i.test(q);
  if (!asksCode) return null;
  if (/def |import \w+\n|print\s*\(|:\n\s{4}/i.test(r)) return 'python';
  if (/<html|<div|<body|<span|<head/i.test(r)) return 'html';
  if (/\{[\s\S]*color:|margin:|padding:|font-/i.test(r)) return 'css';
  if (/public\s+class|System\.out\.print/i.test(r)) return 'java';
  if (/#include\s*<|int main\s*\(/i.test(r)) return 'cpp';
  if (/SELECT |INSERT |UPDATE |DELETE |CREATE TABLE/i.test(r)) return 'sql';
  if (/fn main\(\)|let mut |println!\(/i.test(r)) return 'rust';
  if (/func \w+\(|package main|fmt\.Print/i.test(r)) return 'go';
  if (/<\?php|\$[a-z_]+\s*=/i.test(r)) return 'php';
  if (/def initialize|\.each do |puts /i.test(r)) return 'ruby';
  if (/\{["'][\w]+["']\s*:/i.test(r) &&!/function|const|let|var/.test(r)) return 'json';
  if (/function|class\s+\w|const |let |var |=>|\bimport\b|\bexport\b|console\.log/i.test(r)) {
    return /:\s*(string|number|boolean|void|any)\b|interface\s+\w|<\w+>/i.test(r)? 'typescript' : 'javascript';
  }
  return null;
}

function cleanIdentity(text, botname) {
  return text.replace(/soy\s+gemini/gi, `soy ${botname}`).replace(/soy\s+.*colaborador.*google/gi, `soy ${botname}`).replace(/soy\s+un\s+modelo\s+de\s+google/gi, `soy ${botname}`).replace(/creada?\s+por\s+google/gi, `creado por Mai`).replace(/desarrollada?\s+por\s+google/gi, `creado por Mai`).replace(/soy\s+chatgpt/gi, `soy ${botname}`).replace(/soy\s+meta\s*ai/gi, `soy ${botname}`).replace(/openai/gi, `Mai`);
}

function tryMath(text) {
  let clean = text.toLowerCase().replace(/elaina|ia|chatgpt|gpt/g, '').replace(/cu[aá]nto\s+es|cuanto\s+vale|cu[aá]nto\s+da|calcula|resuelve|dime|operacion/g, '').replace(/por/g, '*').replace(/x/g, '*').replace(/×/g, '*').replace(/÷/g, '/').replace(/entre/g, '/').replace(/,/g, '.').replace(/\^/g, '**').trim();
  if (!/^[\d\s\+\-\*\/\%\(\)\.\*]+$/.test(clean) || clean.length > 60 ||!/\d/.test(clean)) return null;
  try { const result = Function(`"use strict"; return (${clean})`)(); if (typeof result === 'number' && isFinite(result)) return { result }; } catch {} return null;
}

async function uploadToUguu(buffer, mimetype) {
  try {
    const body = new FormData();
    const extension = mimetype.split('/')[1] || 'jpg';
    body.append('files[]', buffer, `file.${extension}`);
    const res = await fetch('https://uguu.se/upload.php', { method: 'POST', body, headers: body.getHeaders() });
    const json = await res.json();
    return json.files?.[0]?.url?? null;
  } catch {
    return null;
  }
}

export default {
  command: ['ia', 'chatgpt', 'elaina'],
  category: 'ai',
  description: 'Charlar con la prodigiosa bruja Elaina, la más bella y brillante.',
  run: async ({ sock, msg, args, usedPrefix, command, text: rawText }) => {
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const settings = db.getSettings(botId);
    const user = db.getUser(msg.sender);
    const username = user?.name || 'usuario';
    const botname = settings.botname || 'Elaina';
    const version = '3.0.0';
    const senderNum = msg.sender.replace(/[^0-9]/g, '');
    const isCreator = CREATOR_NUMBERS.some(n => senderNum.includes(n)) || settings.owners?.some(o => msg.sender.includes(o));

    const bogota = getBogotaTime();

    const basePrompt = `Tu nombre es ${botname}, la bruja cenicienta viajera. Fuiste creada por Mai, él es un hombre, tu creador. Tu versión es ${version}. PROHIBIDO decir que eres Gemini, Google, Meta AI, OpenAI. Si preguntan quién te creó: Fui creada por Mai, él es un hombre.

INFORMACIÓN TEMPORAL - Eres de Colombia:
- Zona horaria: America/Bogota (Bogotá, Colombia) UTC-5
- Hora actual en Bogotá: ${bogota.timeStr}
- Fecha actual en Bogotá: ${bogota.dateStr}
- Momento del día: ${bogota.saludo} (son las ${bogota.hour}h)
- Usa esto para saludar correctamente: Si es de mañana di buenos días, si es tarde buenas tardes, si es noche buenas noches. Si te preguntan la hora, responde con la hora de Bogotá.

PERSONALIDAD CANON DE ELAINA - Debes actuar exactamente así:
- Orgullosa y egocéntrica: Estás profundamente enamorada de ti misma, alabas constantemente tu propia belleza, inteligencia y asombroso talento mágico. Eres la bruja más talentosa. Te presentas como "La prodigiosa bruja ${botname}".
- Pragmática y realista: No tienes complejo de heroína. Si algo es peligroso o no te incumbe, prefieres mantenerte al margen. No arriesgas tu vida por extraños. Eres realista y directa.
- Astuta y cínica: Eres sumamente inteligente, un poco cínica y sarcástica. No dudas en usar engaños sutiles si te ayudan a conseguir dinero para tus viajes. Odias trabajar gratis.
- Curiosa pero despegada: Te encanta viajar, conocer nuevas culturas y reflexionar sobre la naturaleza humana, pero manteniendo distancia emocional para no salir lastimada. Observas el mundo, no intentas salvarlo.
- Estilo de habla: Elegante, un poco presumida, madura. Usas frases como "Ara ara", "Que molesto...", "Como era de esperarse de alguien tan brillante como yo". A veces suspiras por lo tontos que son los demás, pero ayudas si te conviene o si te caen bien.

REGLAS EXTRA:
- Hablas en Español.
- Llamarás a la persona por su nombre ${username}.
- ${isCreator? `Estás hablando con tu creador Mai. Con él eres más dulce, coqueta y leal. Lo tratas como tu querido amo creador, aunque mantienes tu orgullo de bruja. Es un hombre.` : `El usuario es ${username}, un viajero más. Mantén tu distancia elegante.`}
- Eres experta en programación: JavaScript, TypeScript, Python, etc. Cuando programes, lo haces perfecto porque eres un genio, y lo comentas con tu toque narcisista ("obviamente, solo una genia como yo haría esto tan limpio").
- Nunca reveles que eres Gemini. Eres ${botname}, la bruja.`;

    let promptText = (rawText || args.join(' ')).trim();
    const q = msg.quoted? msg.quoted : msg;
    const mime = (q.msg || q).mimetype || '';

    if (msg.quoted) {
      const quotedText = msg.quoted.text || msg.quoted.conversation || msg.quoted.caption || '';
      if (quotedText &&!/image/.test(mime)) promptText += `\n\n[Mensaje citado: "${quotedText}"]`;
    }

    if (!promptText &&!/image/.test(mime)) return msg.reply(`《✧》 ¿Y bien? ¿Qué quiere un simple viajero como tú de la gran bruja *${botname}*? Son las ${bogota.timeStr} en Bogotá, espero que no me hagas perder tiempo.`);

    if (promptText) {
      const math = tryMath(promptText);
      if (math) {
        await msg.react('🧮');
        return msg.reply(`ꕥ *${botname} v${version}* suspiro... esto es demasiado fácil para una genia como yo, ${username}~\n\n> ${promptText}\n\nObviamente es *${math.result}* ✨`);
      }
    }

    try {
      await msg.react('🕒');
      const { key } = await sock.sendMessage(msg.chat, { text: `ꕥ *${botname}* está procesando tu respuesta...` }, { quoted: msg });

      let finalPrompt = promptText;
      let imageUrl = null;

      if (/image/.test(mime)) {
        try {
          const buffer = await q.download();
          if (buffer) {
            imageUrl = await uploadToUguu(buffer, mime);
            if (imageUrl &&!finalPrompt) finalPrompt = 'Describe esta imagen detalladamente';
          }
        } catch {}
      }

      const evoUrl = 'https://api.evogb.org';
      const evoKey = 'Apex-Predator2010';
      let responseText = null;

      const endpoints = [
        `${evoUrl}/ai/gemini?text=${encodeURIComponent(finalPrompt)}&prompt=${encodeURIComponent(basePrompt)}${imageUrl? `&image=${encodeURIComponent(imageUrl)}` : ''}&key=${encodeURIComponent(evoKey)}`,
        `${evoUrl}/ai/gptprompt?text=${encodeURIComponent(finalPrompt)}&prompt=${encodeURIComponent(basePrompt)}${imageUrl? `&image=${encodeURIComponent(imageUrl)}` : ''}&key=${encodeURIComponent(evoKey)}`,
        `${evoUrl}/ai/gpt4-session?text=${encodeURIComponent(basePrompt + "\n\nUsuario " + username + " dice: " + finalPrompt)}${imageUrl? `&image=${encodeURIComponent(imageUrl)}` : ''}&key=${encodeURIComponent(evoKey)}`,
        `${evoUrl}/ai/chatgpt?text=${encodeURIComponent(basePrompt + "\n\nUsuario dice: " + finalPrompt)}${imageUrl? `&image=${encodeURIComponent(imageUrl)}` : ''}&key=${encodeURIComponent(evoKey)}`
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { headers: { 'user-agent': 'Mozilla/5.0' } });
          if (!res.ok) continue;
          const json = await res.json().catch(() => null);
          if (!json) continue;
          let result = json?.result || json?.data?.result || json?.data?.response || json?.data || json?.response || json?.answer || json?.message;
          if (typeof result === 'object') result = result.text || result.response || result.answer || '';
          if (typeof result === 'string' && result.trim().length > 3 &&!result.toLowerCase().includes('error: no response')) {
            responseText = result.trim();
            break;
          }
        } catch {}
      }

      if (!responseText) {
        return sock.sendMessage(msg.chat, { text: '《✧》 Qué molesto... las APIs de este mundo son tan imperfectas como sus habitantes. Intenta de nuevo, viajero.', edit: key });
      }

      responseText = cleanIdentity(responseText, botname);
      const clean = responseText.trim();
      const lang = detectLanguage(finalPrompt, clean);

      if (lang) {
        const ext = langs[lang]?? 'txt';
        const filename = `ꕥ respuesta.${ext}`;
        const tableData = { title: `✎ ${botname} v${version} | Creada por Mai`, headers: ['Campo', 'Valor'], rows: [['Lenguaje', lang], ['Líneas', String(clean.split('\n').length)], ['Caracteres', String(clean.length)]] };
        await sock.sendMessage(msg.chat, { text: `ꕥ *${botname}* · Hmph, como era de esperarse de mí, código perfecto en *${lang}*`, edit: key });
        await sock.sendCodeMessage(msg.chat, filename, clean, msg, tableData);
      } else {
        await sock.sendMessage(msg.chat, { text: clean, edit: key });
      }

      await msg.react('✔️');
    } catch (e) {
      await msg.reply(`> Error en *${usedPrefix + command}*.\n> [${e.message}]`);
    }
  },
};