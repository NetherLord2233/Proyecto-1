import fs from 'fs';
import path from 'path';
import syntaxerror from 'syntax-error';

const TARGET_FOLDERS = ['lib', 'cmds'];

const EXCLUDED_FOLDERS = ['node_modules', 'tmp', 'sessions', '.git'];

export default {
  command: ['error'],
  isDev: true,
  category: 'owner',
  description: 'Escanea lib/ y cmds/ enviando cada error en un mensaje separado.',
  run: async ({ msg, sock }) => {
    const reply = (text) => 
      msg.reply ? msg.reply(text) : sock.sendMessage(msg.chat, { text }, { quoted: msg });

    try {
      await msg.react?.('🕒');

      const rootDir = process.cwd();
      const filesToScan = [];

      const scanDirectory = (dirPath) => {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            if (EXCLUDED_FOLDERS.includes(entry.name.toLowerCase())) continue;
            scanDirectory(fullPath);
          } else if (entry.isFile() && /\.(js|mjs|cjs)$/i.test(entry.name)) {
            filesToScan.push(fullPath);
          }
        }
      };


      for (const folder of TARGET_FOLDERS) {
        const targetPath = path.join(rootDir, folder);
        scanDirectory(targetPath);
      }

      if (filesToScan.length === 0) {
        await msg.react?.('⚠️');
        return reply(`⚠️ No se encontraron archivos JS dentro de \`lib/\` o \`cmds/\`.`);
      }

      const errors = [];

      for (const filePath of filesToScan) {
        const relativePath = path.relative(rootDir, filePath);
        try {
          const code = fs.readFileSync(filePath, 'utf8');
          const err = syntaxerror(code, relativePath, {
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
            sourceType: 'module'
          });

          if (err) {
            errors.push({
              file: relativePath,
              detail: err.toString()
            });
          }
        } catch (readErr) {
          errors.push({
            file: relativePath,
            detail: `Error al leer el archivo: ${readErr.message}`
          });
        }
      }


      if (errors.length === 0) {
        await msg.react?.('✅');
        return reply(
          `\`No se encontraron errores de sintaxis\``
        );
      }

      await msg.react?.('❌');
      await reply(`❌ *Se encontraron ${errors.length} error(es) de sintaxis en${filesToScan.length} archivos.* Enviando cada reporte por separado...`);

      for (let i = 0; i < errors.length; i++) {
        const e = errors[i];
        const errorMsg = 
          `*Error [${i + 1}/${errors.length}]*\n` +
          `*Archivo:* \`${e.file}\`\n\`\`\`\n${e.detail}\n\`\`\``;
        
        await reply(errorMsg);
      }

    } catch (error) {
      console.error('[Error durante el escaneo de lib y cmds]:', error);
      await msg.react?.('✖️');
      return reply(`❌ Ocurrió un fallo general al realizar el escaneo:\n\n\`\`\`${error.message || error}\`\`\``);
    }
  }
};
