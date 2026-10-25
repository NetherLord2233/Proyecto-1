import fs from "fs";
import path from "path";

const BLOQUEADAS = [".", "./", "/", "..", "../", "../../"];

export default {
  command: ["j"],
  isDev: true,
  description: 'Descargar en.txt cualquier archivo existente en el bot.',
  run: async ({ sock, msg, args, prefix }) => {
    const client = sock;
    const m = msg;
    const usedPrefix = prefix || ".";
    const chatId = m.chat;

    if (!args[0]) {
      return await client.sendMessage(chatId, {
        text: `《✧》 Uso: tienes que especificar la ruta\n\n*Ejemplos:*\n${usedPrefix}j./cmd/owner/j.js\n${usedPrefix}j./cmds`
      }, { quoted: m });
    }

    const ruta = args.join(" ").trim();
    if (BLOQUEADAS.includes(ruta)) {
      return await client.sendMessage(chatId, { text: `❌ Esa ruta está protegida.\n\nRuta:\n${ruta}` }, { quoted: m });
    }

    const absoluta = path.resolve(ruta);
    if (!fs.existsSync(absoluta)) {
      return await client.sendMessage(chatId, { text: `❌ La ruta no existe.\n\nRuta:\n${ruta}` }, { quoted: m });
    }

    const stat = fs.statSync(absoluta);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(absoluta);
      return await client.sendMessage(chatId, { text: `《✧》 Directorio: ${ruta}\nTotal: ${files.length}\n\n${files.map(f=>`• ${f}`).join("\n")}` }, { quoted: m });
    }

    const sent = await client.sendMessage(chatId, {
      text: `⚠️ CONFIRMACIÓN\n\nSe requiere confirmación del archivo\n\nRuta:\n${ruta}\n\nResponde a este mensaje con:\n\nconfi\n\nTienes 30 segundos.`
    }, { quoted: m });

    const sentId = sent.key.id;
    let confirmed = false;

    const collector = async (upsert) => {
      try {
        const msgUp = upsert.messages?.[0];
        if (!msgUp || msgUp.key.remoteJid!== chatId) return;
        const ctx = msgUp.message?.extendedTextMessage?.contextInfo;
        if (!ctx || ctx.stanzaId!== sentId) return;
        const raw = (msgUp.message?.conversation || msgUp.message?.extendedTextMessage?.text || "").toLowerCase().trim();
        if (raw!== "confi") return;

        if (confirmed) return;
        confirmed = true;

        try { client.ev.off('messages.upsert', collector) } catch {}
        clearTimeout(timer);

        await client.sendMessage(chatId, { text: `Procesando petición......` }, { quoted: msgUp });
        const contenido = fs.readFileSync(absoluta, "utf-8");
        await client.sendMessage(chatId, {
          document: Buffer.from(contenido, "utf-8"),
          mimetype: "text/plain",
          fileName: path.basename(absoluta) + ".txt",
          caption: `《✧》 Ruta: ${ruta}`
        }, { quoted: msgUp });

      } catch {}
    };

    client.ev.on('messages.upsert', collector);

    const timer = setTimeout(async () => {
      try { client.ev.off('messages.upsert', collector) } catch {}
      if (!confirmed) {
        await client.sendMessage(chatId, { text: `❌ Tiempo agotado. Vuelve a usar ${usedPrefix}j ${ruta}` }, { quoted: m });
      }
    }, 30000);
  }
};