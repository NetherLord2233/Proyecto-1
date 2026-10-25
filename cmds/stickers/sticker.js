import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import exif from '../../lib/exif.js';
import db from '../../lib/system/database.js';

const { writeExif } = exif;
const fetch = globalThis.fetch;
const TMP = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

export default {
  command: ['sticker', 's'],
  category: 'stickers',
  description: 'Convertir una imagen, video o álbum a stickers.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (args[0] === '-list') {
        const helpText = `ꕥ Lista de Formas y Efectos Disponibles para *imagen*:\n\n✦ *Formas:*\n- -c : Crea un sticker circular\n- -t : Crea un sticker triangular\n- -s : Crea un sticker con forma de estrella\n- -r : Crea un sticker con esquinas redondeadas\n- -h : Crea un sticker hexagonal\n- -d : Crea un sticker con forma de diamante\n- -f : Crea un sticker con un marco\n- -b : Crea un sticker con un borde\n- -w : Crea un sticker con forma de onda\n- -m : Crea un sticker espejado\n- -o : Crea un sticker octogonal\n- -y : Crea un sticker pentagonal\n- -e : Crea un sticker elíptico\n- -z : Crea un sticker en forma de cruz\n- -v : Crea un sticker con forma de corazón\n- -x : Crea un sticker expandido (cover)\n- -i : Crea un sticker expandido (contain)\n\n✧ *Efectos:*\n- -blur : Aplica un efecto de desenfoque\n- -sepia : Aplica un efecto sepia\n- -sharpen : Aplica un efecto de nitidez\n- -brighten : Aumenta el brillo\n- -darken : Disminuye el brillo\n- -invert : Invierte los colores\n- -grayscale : Aplica escala de grises\n- -rotate90 : Rota la imagen 90 grados\n- -rotate180 : Rota la imagen 180 grados\n- -flip : Invierte la imagen horizontalmente\n- -flop : Invierte la imagen verticalmente\n- -normalice : Normaliza la imagen\n- -negate : Negatiza la imagen\n- -tint : Aplica un tinte de color a la imagen (rojo por defecto)\n\n> Ejemplo: *${usedPrefix + command} -c -blur Pack | Autor*`;
        return sock.reply(msg.chat, helpText, msg);
      }

      const user = db.getUser(msg.sender);
      const name = user.name || '';
      const meta1 = user.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user.metadatos2 ? String(user.metadatos2).trim() : '';
      const texto1 = meta1 || 'Elaina 💜';
      const texto2 = meta1 ? (meta2 || '') : `@${name}`;
      
      let urlArg = null; 
      const argsWithoutUrl = [];
      for (const arg of args) { 
        if (isUrl(arg)) urlArg = arg; 
        else argsWithoutUrl.push(arg); 
      }
      
      const filteredText = argsWithoutUrl.join(' ').replace(/-\w+/g, '').trim();
      const marca = filteredText.split(/[\u2022|]/).map(x => x.trim());
      const pack = marca[0] || texto1;
      const author = marca.length > 1 ? marca[1] : (filteredText ? (meta1 ? texto2 : '') : texto2);
      
      const shapeArgs = { '-c':'circle','-t':'triangle','-s':'star','-r':'roundrect','-h':'hexagon','-d':'diamond','-f':'frame','-b':'border','-w':'wave','-m':'mirror','-o':'octagon','-y':'pentagon','-e':'ellipse','-z':'cross','-v':'heart','-x':'cover','-i':'contain' };
      const effectArgs = { '-blur':'blur','-sepia':'sepia','-sharpen':'sharpen','-brighten':'brighten','-darken':'darken','-invert':'invert','-grayscale':'grayscale','-rotate90':'rotate90','-rotate180':'rotate180','-flip':'flip','-flop':'flop','-normalice':'normalise','-negate':'negate','-tint':'tint' };
      const effects = [];
      for (const arg of argsWithoutUrl) { 
        if (shapeArgs[arg]) effects.push({ type:'shape', value:shapeArgs[arg]}); 
        if (effectArgs[arg]) effects.push({ type:'effect', value:effectArgs[arg]}); 
      }

      const sendWebpWithExif = async (buffer) => {
        const stickerPath = await writeExif({ mimetype:'webp', data:buffer }, { packname:pack, author:author, categories:[''] });
        try { 
          const b = fs.readFileSync(stickerPath); 
          await sock.sendMessage(msg.chat, { sticker: b }, { quoted: msg }); 
        } finally { 
          removeFile(stickerPath); 
        }
      };

      const runFFmpeg = (args) => new Promise((res, rej) => {
        const p = spawn('ffmpeg', args, { stdio:['ignore','pipe','pipe'] });
        let err=''; 
        p.stderr.on('data', d => err += d.toString()); 
        p.on('close', c => c === 0 ? res() : rej(new Error(err.slice(-800)))); 
        p.on('error', rej);
      });

      const processPhoto = async (input) => {
        const out = tempPath('photo','webp');
        const vf = buildFilters(effects, false);
        await runFFmpeg(['-y','-i',input,'-vf',vf,'-an','-c:v','libwebp','-q:v','80','-preset','picture',out]);
        const buf = fs.readFileSync(out); 
        removeFile(out); 
        await sendWebpWithExif(buf);
      };

      const processVideo = async (input) => {
        const out = tempPath('video','webp');
        const vf = buildFilters(effects, true);
        await runFFmpeg(['-y','-i',input,'-t','15','-vf',vf,'-an','-c:v','libwebp_anim','-preset','picture','-compression_level','6','-q:v','75','-loop','0',out]);
        const buf = fs.readFileSync(out); 
        removeFile(out); 
        await sendWebpWithExif(buf);
      };

      const isAnimatedWebp = (b) => b.includes(Buffer.from('ANIM')) || b.includes(Buffer.from('ANMF'));
      
      const handleWebp = async (buffer) => {
        const animated = isAnimatedWebp(buffer); 
        const inp = tempPath('in','webp'); 
        fs.writeFileSync(inp, buffer);
        try {
          if (animated && effects.length > 0) {
            const gif = tempPath('conv','gif');
            await runFFmpeg(['-y','-i',inp,'-vf','fps=10,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000','-loop','0',gif]);
            await processVideo(gif); 
            removeFile(gif);
          } else if (animated) {
            await sendWebpWithExif(buffer); 
          } else {
            await processPhoto(inp);
          }
        } finally { 
          removeFile(inp); 
        }
      };

      const mediaBuffers = [];

      const downloadTarget = async (target) => {
        if (!target) return null;
        try {
          if (typeof target.download === 'function') {
            const b = await target.download();
            if (b && b.length > 0) return b;
          }
        } catch {}
        try {
          if (target.msg && typeof target.msg.download === 'function') {
            const b = await target.msg.download();
            if (b && b.length > 0) return b;
          }
        } catch {}
        try {
          if (typeof sock.downloadMediaMessage === 'function') {
            const b = await sock.downloadMediaMessage(target);
            if (b && b.length > 0) return b;
          }
        } catch {}
        return null;
      };

      // 1. Verificar si es un mensaje citado de tipo álbum (`albumMessage`) o ráfaga
      const qMsg = msg.quoted?.message || msg.quoted?.msg || msg.quoted;
      const isAlbumQuoted = qMsg?.albumMessage || (msg.quoted && Object.keys(qMsg || {}).includes('albumMessage'));

      // 2. Si se citó un álbum, extraer los últimos elementos multimedia del store del chat
      const st = global.store || sock.store;
      if (isAlbumQuoted && st && st.messages && st.messages[msg.chat]) {
        try {
          const rawMsgs = st.messages[msg.chat]?.array || st.messages[msg.chat];
          const chatMsgs = Array.isArray(rawMsgs) ? rawMsgs : (typeof rawMsgs.values === 'function' ? Array.from(rawMsgs.values()) : Object.values(rawMsgs));
          
          // Tomar los últimos archivos multimedia de la conversación (para cubrir las fotos del álbum)
          const recentMedia = chatMsgs.filter(m => m?.message?.imageMessage || m?.message?.videoMessage).slice(-4);

          for (const item of recentMedia) {
            const buf = await downloadTarget(item);
            if (buf && buf.length > 0) {
              const mime = item.message?.imageMessage?.mimetype || item.message?.videoMessage?.mimetype || 'image/jpeg';
              if (!mediaBuffers.some(b => b.buf.equals(buf))) {
                mediaBuffers.push({ buf, mime });
              }
            }
          }
        } catch {}
      }

      // 3. Si no es álbum o no se encontró en el store, descarga directa normal
      if (mediaBuffers.length === 0) {
        let directBuf = await downloadTarget(msg.quoted || msg);
        if (directBuf && directBuf.length > 0) {
          const mime = (msg.quoted || msg).mimetype || (msg.quoted || msg).msg?.mimetype || msg.mimetype || 'image/jpeg';
          mediaBuffers.push({ buf: directBuf, mime });
        }
      }

      // Procesar todos los buffers recopilados
      if (mediaBuffers.length > 0) {
        await msg.react('🕒');
        if (mediaBuffers.length > 1) {
          await sock.sendMessage(msg.chat, { text: `📸 *[ÁLBUM DETECTADO]*: Procesando *${mediaBuffers.length}* imágenes en cadena...` }, { quoted: msg });
        }

        let done = 0;
        for (let i = 0; i < mediaBuffers.length; i++) {
          const item = mediaBuffers[i];
          try {
            if (/video/.test(item.mime)) {
              const inp = tempPath('video','mp4'); 
              fs.writeFileSync(inp, item.buf);
              try { await processVideo(inp); done++; } finally { removeFile(inp); }
            } else if (/webp/.test(item.mime)) {
              await handleWebp(item.buf);
              done++;
            } else {
              const isGif = /gif/i.test(item.mime) || item.buf.slice(0,6).toString()==='GIF89a' || item.buf.slice(0,6).toString()==='GIF87a';
              const ext = isGif ? 'gif' : /png/i.test(item.mime) ? 'png' : 'jpg';
              const inp = tempPath('in', ext); 
              fs.writeFileSync(inp, item.buf);
              try { 
                if (isGif) await processVideo(inp); 
                else await processPhoto(inp); 
                done++;
              } finally { 
                removeFile(inp); 
              }
            }
          } catch {}
        }

        if (done > 0) {
          await msg.react('✔️');
          return;
        }
      }

      if (urlArg) {
        if (!urlArg.match(/\.(jpe?g|png|gif|webp|mp4|mov|avi|mkv|webm)(\?.*)?$/i)) {
          return sock.reply(msg.chat, '《✧》 La URL debe ser de una imagen o video', msg);
        }
        const r = await fetch(urlArg); 
        if (!r.ok) return sock.reply(msg.chat, '《✧》 No pude descargar ese archivo.', msg);
        const buf = Buffer.from(await r.arrayBuffer()); 
        if (!buf.length) return sock.reply(msg.chat, '《✧》 El archivo está vacío.', msg);
        if (/\.webp/i.test(urlArg)) { await handleWebp(buf); return; }
        const isGifUrl = /\.gif/i.test(urlArg); 
        const ext = isGifUrl ? 'gif' : /\.(mp4|mov|avi|mkv|webm)/i.test(urlArg) ? 'mp4' : 'jpg';
        const inp = tempPath('url', ext); 
        fs.writeFileSync(inp, buf);
        try { 
          if (ext === 'mp4' || isGifUrl) await processVideo(inp); 
          else await processPhoto(inp); 
        } finally { 
          removeFile(inp); 
        } 
        return;
      }

      return sock.reply(msg.chat, `《✧》 Por favor, envía una imagen, video, sticker o URL para hacer un sticker.\n> Usa *${usedPrefix + command} -list* para ver formas y efectos`, msg);
    } catch (e) { 
      return msg.reply(`> Error en *${usedPrefix + command}*: ${e.message}`); 
    }
  }
};

function tempPath(p, e) { return path.join(TMP, `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}.${e}`); }
function removeFile(f) { try { if(f && fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
function isUrl(t) { return t.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi); }

function buildFilters(effects, isVideo) {
  const W=512, H=512, filters=[]; 
  const shape = effects.find(e => e.type === 'shape')?.value; 
  const effs = effects.filter(e => e.type === 'effect').map(e => e.value);
  
  if (shape === 'cover' || shape === 'x') {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`);
  } else {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`);
  }
  
  for (const ef of effs) {
    switch(ef) {
      case 'blur': filters.push('gblur=sigma=5'); break;
      case 'sepia': filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'); break;
      case 'sharpen': filters.push('unsharp=5:5:1.0:5:5:0.0'); break;
      case 'brighten': filters.push('eq=brightness=0.05'); break;
      case 'darken': filters.push('eq=brightness=-0.05'); break;
      case 'invert': case 'negate': filters.push('negate'); break;
      case 'grayscale': filters.push('hue=s=0'); break;
      case 'rotate90': filters.push('transpose=1'); break;
      case 'rotate180': filters.push('rotate=PI'); break;
      case 'flip': filters.push('hflip'); break;
      case 'flop': filters.push('vflip'); break;
      case 'normalice': filters.push('normalize'); break;
      case 'tint': filters.push('colorchannelmixer=1:0:0:0:0:0.5:0:0:0:0:0.5'); break;
    }
  }
  
  if (shape === 'mirror') filters.push('hflip');
  if (shape && !['cover','contain','mirror','border','frame','i','x'].includes(shape)) {
    const cx=W/2, cy=H/2, r=Math.min(W,H)/2; 
    let a='';
    switch(shape) {
      case 'circle': a=`if(lte((X-${cx})*(X-${cx})+(Y-${cy})*(Y-${cy}),${r*r}),255,0)`; break;
      case 'triangle': a=`if(gte(Y,${H*0.1})*lte(Y,${H*0.9})*lte(abs(X-${cx}),((${H*0.9}-Y)*0.6)),255,0)`; break;
      case 'star': a=`if(lte(hypot(X-${cx},Y-${cy}),${W*0.25}+${W*0.1}*cos(5*atan2(Y-${cy},X-${cx}))),255,0)`; break;
      case 'roundrect': a=`if(lte(pow(max(25-X,0,X-${W-25},25-Y,0,Y-${H-25}),2)+pow(max(50-hypot(X-25,Y-25),50-hypot(X-${W-25},Y-25),50-hypot(X-25,Y-${H-25}),50-hypot(X-${W-25},Y-${H-25})),2),0),255,0)`; break;
      case 'hexagon': a=`if(lte(hypot(X-${cx},Y-${cy}),${W*0.4}*cos(PI/6)/cos(mod(atan2(Y-${cy},X-${cx}),PI/3)-PI/6)),255,0)`; break;
      case 'diamond': a=`if(lte(abs(X-${cx})+abs(Y-${cy}),${r}),255,0)`; break;
      case 'wave': a=`if(lte(abs(Y-(${cy}+${H*0.05}*sin(X*0.05))),${H*0.4}),255,0)`; break;
      case 'octagon': a=`if(lte(hypot(X-${cx},Y-${cy}),${W*0.4}*cos(PI/8)/cos(mod(atan2(Y-${cy},X-${cx}),PI/4)-PI/8)),255,0)`; break;
      case 'pentagon': a=`if(lte(hypot(X-${cx},Y-${cy}),${W*0.4}*cos(PI/5)/cos(mod(atan2(Y-${cy},X-${cx}),2*PI/5)-PI/5)),255,0)`; break;
      case 'ellipse': a=`if(lte(((X-${cx})*(X-${cx}))/(${(W*0.45)*(W*0.45)})+((Y-${cy})*(Y-${cy}))/(${(H*0.4)*(H*0.4)}),1),255,0)`; break;
      case 'cross': a=`if(gt((abs(X-${cx})<=${W*0.15})*(abs(Y-${cy})<=${H*0.45})+(abs(Y-${cy})<=${H*0.15})*(abs(X-${cx})<=${W*0.45}),0),255,0)`; break;
      case 'heart': a=`if(lte(pow((X-${cx})/(${W*0.3})*(X-${cx})/(${W*0.3})+(Y-${cy})/(${H*0.3})*(Y-${cy})/(${H*0.3})-1,3)-((X-${cx})/(${W*0.3})*(X-${cx})/(${W*0.3}))*pow((Y-${cy})/(${H*0.3}),3),0),255,0)`; break;
    }
    if (a) filters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${a}'`);
  }
  
  if (shape === 'border') filters.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=white@0.9:t=10`);
  if (shape === 'frame') filters.push(`drawbox=x=15:y=15:w=${W-30}:h=${H-30}:color=white@0.7:t=8`);
  if (isVideo) filters.unshift('fps=15');
  filters.push('format=yuva420p');
  return filters.join(',');
    }
        
