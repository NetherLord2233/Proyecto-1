import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default {
  command: ['deps', 'dependencies'],
  isInv: true,
  description: 'Ver las dependencias del bot.',
  category: 'owner',
  run: async ({ sock, msg, args }) => {
    const client = sock;
    const m = msg;
    try {
      const chatId = m.chat;
      const sender = m.sender;
      const botJid = client.user.id.split(':')[0] + '@s.whatsapp.net';
      const botId = botJid;
      const settings = global.db?.data?.settings?.[botJid] || {};
      const sandboxMode = settings?.sandboxEnabled || false;
      const senderNumber = m.sender.split('@')[0].replace(/[^0-9]/g, '');
      const ownerList = global.Owners || global.owner || [];
      const isOwner = ownerList.some(user => {
        const ownerNumber = (Array.isArray(user) ? user[0] : user).toString().replace(/[^0-9]/g, '');
        return ownerNumber === senderNumber;
      });

      const rootPath = path.resolve(); 
      const packagePath = path.join(rootPath, 'package.json');

      if (!fs.existsSync(packagePath)) {
        console.log(`RUTA BUSCADA: ${packagePath}`);
        return m.reply(`《✧》 No se encontró el archivo en:\n \`${packagePath}\``);
      }

      const packageContent = fs.readFileSync(packagePath, 'utf-8');

      let packageJson;
      try {
        packageJson = JSON.parse(packageContent);
      } catch (jsonErr) {
        return m.reply('《✧》 El archivo *package.json* tiene un error de sintaxis (comas o comillas mal puestas).');
      }

      const dependencies = packageJson.dependencies || {};
      const totalDeps = Object.keys(dependencies).length;

      let report = `*_DEPENDENCIAS_*\n\n`;
      report += `ꕥ *Total:* ${totalDeps}\n`;
      report += `────────────────\n`;

      for (const [name, version] of Object.entries(dependencies)) {
        let status = '*❌*';
        let installedVersion = '---';

        try {
          const depJsonPath = path.join(rootPath, 'node_modules', name, 'package.json');

          if (fs.existsSync(depJsonPath)) {
            const depContent = JSON.parse(fs.readFileSync(depJsonPath, 'utf-8'));
            installedVersion = depContent.version;
            status = '*Instalada*';
          }
        } catch (e) {
        }

        report += `> ✎ *_${name}_*\n`;
        report += `> ◈ *Requerida:* \`\`\`${version}\`\`\`\n`;
        report += `> ◈ *En Host:* \`\`\`${installedVersion}\`\`\`\n`;
        report += `> ◈ *Estado:* _${status}_\n\n`;
      }

      report += `────────────────`;

      await client.sendMessage(m.chat, { text: report.trim() }, { quoted: m });

    } catch (error) {
      console.error('ERROR EN DEPENDENCES:', error);
      m.reply(`《✧》 Error crítico: ${error.message}`);
    }
  }
};
