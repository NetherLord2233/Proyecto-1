import db from '#db';

export default {
  command: ['give', 'remove'],
  isStaff: true, 
  description: 'Dar y Quitar Coins/Bank/XP a un usuario.',
  run: async ({ msg, sock, args, command, usedPrefix, isOwner }) => {
    try {
      const type = args[0]?.toLowerCase();
      const valInput = args[1];

      const mentioned = msg.mentionedJid || [];
      const who = mentioned.length > 0 
        ? sock.decodeJid(mentioned[0]) 
        : (msg.quoted ? sock.decodeJid(msg.quoted.sender) : null);

      if (!who) {
        return msg.reply(`❀ Debes mencionar a alguien o responder a un mensaje.\nUso: *${usedPrefix}${command} [coin/bank/xp/all] [cantidad/all] @user*`);
      }

      if (!type || !valInput) {
        return msg.reply(`ꕥ Formato incorrecto.\nEj: \`${usedPrefix}${command} coins 100 @user\` o \`${usedPrefix}${command} all all @user\``);
      }

      const isAllType = type === 'all' || type === 'todo';
      const isAllVal = valInput.toLowerCase() === 'all' || valInput.toLowerCase() === 'todo';
      const isLevel = valInput.toLowerCase().endsWith('l');
      let cantidad = isAllVal ? 0 : parseInt(isLevel ? valInput.replace(/l/gi, '') : valInput);

      if (!isAllVal && isNaN(cantidad)) {
        return msg.reply('ꕥ La cantidad debe ser un número válido, "all" o "todo".');
      }

      if (!isAllVal && command === 'remove') cantidad = -Math.abs(cantidad);

      await msg.react('🕒');

      let mensaje = '';
      const botJid = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : '';
      const settings = db.getSettings(botJid);
      const currency = settings?.botcurrency || settings?.currency || '$';

      const processCoins = () => {
        const chatUser = db.getChatUser(msg.chat, who) || {};
        const currentCoins = chatUser.coins || 0;
        let c = cantidad;
        let newCoins = 0;
        if (isAllVal) {
          newCoins = command === 'give' ? currentCoins : 0;
          c = command === 'give' ? currentCoins : -currentCoins;
        } else {
          newCoins = Math.max(0, currentCoins + c);
        }
        db.updateChatUser(msg.chat, who, 'coins', newCoins);
        return { c, newCoins };
      };

      const processBank = () => {
        const chatUser = db.getChatUser(msg.chat, who) || {};
        const currentBank = chatUser.bank || 0;
        let c = cantidad;
        let newBank = 0;
        if (isAllVal) {
          newBank = command === 'give' ? currentBank : 0;
          c = command === 'give' ? currentBank : -currentBank;
        } else {
          newBank = Math.max(0, currentBank + c);
        }
        db.updateChatUser(msg.chat, who, 'bank', newBank);
        return { c, newBank };
      };

      const processXp = () => {
        const globalUser = db.getUser(who) || {};
        let c = cantidad;
        if (isLevel) {
          const currentLevel = globalUser.level || 0;
          let newLevel = 0;
          if (isAllVal) {
            newLevel = command === 'give' ? currentLevel : 0;
            c = command === 'give' ? currentLevel : -currentLevel;
          } else {
            newLevel = Math.max(0, currentLevel + c);
          }
          db.updateUser(who, 'level', newLevel);
          return { isL: true, c, newVal: newLevel };
        } else {
          const currentExp = globalUser.exp || 0;
          let newExp = 0;
          if (isAllVal) {
            newExp = command === 'give' ? currentExp : 0;
            c = command === 'give' ? currentExp : -currentExp;
          } else {
            newExp = Math.max(0, currentExp + c);
          }
          db.updateUser(who, 'exp', newExp);
          return { isL: false, c, newVal: newExp };
        }
      };

      if (isAllType) {
        const resCoins = processCoins();
        const resBank = processBank();
        const resXp = processXp();

        mensaje = `❀ *${command === 'give' ? 'Añadido' : 'Retirado'} en Todo a @${who.split('@')[0]}:*\n` +
                  `» *Coins:* ${Math.abs(resCoins.c).toLocaleString()} ${currency} (Nuevo saldo: ${resCoins.newCoins.toLocaleString()})\n` +
                  `» *Banco:* ${Math.abs(resBank.c).toLocaleString()} ${currency} (Nuevo saldo: ${resBank.newBank.toLocaleString()})\n` +
                  `» *${resXp.isL ? 'Nivel' : 'XP'}:* ${Math.abs(resXp.c).toLocaleString()} (Nuevo total: ${resXp.newVal.toLocaleString()})`;

      } else if (type === 'coin' || type === 'coins' || type === 'monedas') {
        const { c, newCoins } = processCoins();
        mensaje = `❀ *${c >= 0 ? 'Añadido' : 'Retirado'}:*\n» ${Math.abs(c).toLocaleString()} ${currency}\n@${who.split('@')[0]}, tu nuevo saldo es: ${newCoins.toLocaleString()} ${currency}`;

      } else if (type === 'bank' || type === 'banco') {
        const { c, newBank } = processBank();
        mensaje = `❀ *${c >= 0 ? 'Añadido' : 'Retirado'} del Banco:*\n» ${Math.abs(c).toLocaleString()} ${currency}\n@${who.split('@')[0]}, tu nuevo saldo en el banco es: ${newBank.toLocaleString()} ${currency}`;

      } else if (type === 'xp' || type === 'exp') {
        const { isL, c, newVal } = processXp();
        if (isL) {
          mensaje = `❀ *Nivel ${c >= 0 ? 'Subido' : 'Bajado'}:*\n» ${Math.abs(c)} Niveles\n@${who.split('@')[0]} ahora es Nivel ${newVal}`;
        } else {
          mensaje = `❀ *XP ${c >= 0 ? 'Añadido' : 'Retirado'}:*\n» ${Math.abs(c).toLocaleString()} XP\n@${who.split('@')[0]} recibió ${c} XP`;
        }
      } else {
        await msg.react('✖️');
        return msg.reply('ꕥ Tipo no válido. Usa: *coin*, *bank*, *xp* o *all*.');
      }

      await msg.react('✔️');
      return sock.sendMessage(msg.chat, { text: mensaje, mentions: [who] }, { quoted: msg });

    } catch (error) {
      console.error(error);
      await msg.react('✖️');
      return msg.reply(`⚠︎ Error crítico:\n${error.message}`);
    }
  }
};
