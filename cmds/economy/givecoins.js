import db from '#db';

export default {
  command: ['givecoins', 'pay', 'coinsgive'],
  category: 'economy',
  description: 'Dar coins a un usuario.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const botId = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : '';
    const botSettings = await db.getSettings(botId);
    const monedas = botSettings?.currency || botSettings?.botcurrency || 'coins';
    const chatData = await db.getChat(chatId);

    if (chatData?.adminonly || !chatData?.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }

    const who = msg.quoted?.sender || msg.mentionedJid?.[0] || (args[1] ? (args[1].replace(/[@ .+-]/g, '') + '@s.whatsapp.net') : null);
    if (!who) {
      return msg.reply(`❀ Debes mencionar a quien quieras transferir *${monedas}*.\n> Ejemplo » *${usedPrefix + command} 25000 @mencion*`);
    }

    if (who === msg.sender) {
      return msg.reply('ꕥ No puedes transferirte *' + monedas + '* a ti mismo.');
    }

    const senderData = await db.getChatUser(chatId, msg.sender) || {};
    const targetData = await db.getChatUser(chatId, who);

    if (!targetData) {
      return msg.reply(`ꕥ El usuario mencionado no está registrado en el bot.`);
    }

    const userWallet = senderData.coins || 0;
    const cantidadInput = args[0]?.toLowerCase();

    let cantidad = (cantidadInput === 'all' || cantidadInput === 'todo') ? userWallet : parseInt(cantidadInput);

    if (!cantidadInput || isNaN(cantidad) || cantidad <= 0) {
      return msg.reply(`ꕥ Ingresa una cantidad válida de *${monedas}* para transferir.`);
    }

    if (userWallet < cantidad) {
      return msg.reply(`ꕥ No tienes suficientes *${monedas}* en la billetera para transferir.\n> Tu saldo actual: *${userWallet.toLocaleString()} ${monedas}*`);
    }

    const newSenderWallet = userWallet - cantidad;
    const newTargetWallet = (targetData.coins || 0) + cantidad;

    await db.updateChatUser(chatId, msg.sender, 'coins', newSenderWallet);
    await db.updateChatUser(chatId, who, 'coins', newTargetWallet);

    const userData = await db.getUser(who);
    let name = userData?.name || who.split('@')[0];

    await sock.sendMessage(
      chatId, 
      { 
        text: `❀ Transferiste *${cantidad.toLocaleString()} ${monedas}* a *${name}*\n> Saldo restante en billetera: *${newSenderWallet.toLocaleString()} ${monedas}*`, 
        mentions: [who] 
      }, 
      { quoted: msg }
    );
  }
};
