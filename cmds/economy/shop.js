import db from '#db';

export default {
  command: ['shop', 'tienda', 'buy', 'comprar', 'inventory', 'inv', 'inventario', 'equip', 'equipar', 'use', 'usar'],
  category: 'economy',
  description: 'Sistema de mercado, inventario RPG, herramientas de sigilo y mercaderes.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chat = db.getChat(msg.chat);
    if (chat.adminonly || !chat.economy) {
      return msg.reply('Los comandos de economía están desactivados en este grupo.');
    }

    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const settings = db.getSettings(botId);
    const currency = settings?.currency || 'coins';

    db.setCreate('chat_users', [msg.chat, msg.sender], 'inventory', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'weapons', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'tools', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'armor', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'relics', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'coins', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'bank', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'health', 100);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'stamina', 100);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'magic', 100);

    let user = db.getChatUser(msg.chat, msg.sender);
    const users = db.getUser(msg.sender);

    if (typeof user.weapons === 'string') { try { user.weapons = JSON.parse(user.weapons); } catch { user.weapons = {}; } }
    if (typeof user.tools === 'string') { try { user.tools = JSON.parse(user.tools); } catch { user.tools = {}; } }
    if (typeof user.armor === 'string') { try { user.armor = JSON.parse(user.armor); } catch { user.armor = {}; } }
    if (typeof user.relics === 'string') { try { user.relics = JSON.parse(user.relics); } catch { user.relics = {}; } }
    if (typeof user.inventory === 'string') { try { user.inventory = JSON.parse(user.inventory); } catch { user.inventory = {}; } }

    const CATALOGO = {
      pico_madera: { id: 'pico_madera', name: 'Pico de Madera', price: 2000, durability: 40, tipo: 'Herramienta', description: 'Básico para minería inicial.' },
      pico_hierro: { id: 'pico_hierro', name: 'Pico de Hierro', price: 6000, durability: 100, tipo: 'Herramienta', description: 'Confiable para minería diaria.' },
      pico_diamante: { id: 'pico_diamante', name: 'Pico de Diamante', price: 17500, durability: 220, tipo: 'Herramienta', description: 'Resistente y eficiente.' },
      pico_legendario: { id: 'pico_legendario', name: 'Pico Estelar', price: 48000, durability: 550, tipo: 'Herramienta', description: 'Forjado en roca anciana.' },

      ganzua: { id: 'ganzua', name: 'Ganzúa de precisión', price: 3500, durability: 15, tipo: 'Herramienta', description: 'Herramienta sigilosa indispensable para robar bolsillos.' },
      kit_hackeo: { id: 'kit_hackeo', name: 'Kit de Hackeo Bancario', price: 12000, durability: 10, tipo: 'Herramienta', description: 'Equipo electrónico avanzado para asaltar cuentas bancarias.' },

      cana_bambu: { id: 'cana_bambu', name: 'Caña de Bambú', price: 1800, durability: 35, tipo: 'Herramienta', description: 'Para pesca ligera en orillas.' },
      cana_reforzada: { id: 'cana_reforzada', name: 'Caña de Carbono', price: 5800, durability: 95, tipo: 'Herramienta', description: 'Soporta peces de mayor tamaño.' },

      hacha_acero: { id: 'hacha_acero', name: 'Hacha de Leñador', price: 5200, durability: 85, tipo: 'Herramienta', description: 'Para tala en expediciones.' },

      espada_cazador: { id: 'espada_cazador', name: 'Cimitara de Hierro', price: 7500, durability: 90, damage: 40, tipo: 'Arma', description: 'Filo ideal para patrullajes.' },
      espada_legendaria: { id: 'espada_legendaria', name: 'Hoja Solar', price: 58000, durability: 500, damage: 135, tipo: 'Arma', description: 'Emite ráfagas térmicas poderosas.' },
      arco_compuesto: { id: 'arco_compuesto', name: 'Arco Táctico', price: 8200, durability: 90, damage: 45, tipo: 'Arma', description: 'Precisión a larga distancia.' },

      armadura_cuero: { id: 'armadura_cuero', name: 'Peto de Cuero', price: 4500, durability: 100, defense: 15, tipo: 'Armadura', description: 'Protección ligera.' },
      armadura_placas: { id: 'armadura_placas', name: 'Coraza de Acero', price: 21000, durability: 280, defense: 45, tipo: 'Armadura', description: 'Soporta embates pesados.' },

      anillo_suerte: { id: 'anillo_suerte', name: 'Anillo de Afortunado', price: 15000, uses: 50, tipo: 'Reliquia', description: 'Aumenta ganancias económicas.' },
      amuleto_fenix: { id: 'amuleto_fenix', name: 'Amuleto del Fénix', price: 30000, uses: 1, tipo: 'Reliquia', description: 'Revive automáticamente si caes.' },

      pocion_vida: { id: 'pocion_vida', name: 'Poción de Salud', price: 1200, uses: 1, restoreHealth: 50, tipo: 'Consumible', description: 'Restaura vitalidad.' },
      pocion_estamina: { id: 'pocion_estamina', name: 'Elixir de Estamina', price: 1500, uses: 1, restoreStamina: 60, tipo: 'Consumible', description: 'Recupera energía para trabajar.' },
      totem_salvacion: { id: 'totem_salvacion', name: 'Tótem Ancestral', price: 14000, uses: 1, tipo: 'Consumible', description: 'Absorbe pérdidas en catástrofes.' }
    };

    function getWorldState() {
      const merchants = [
        { name: 'Gromlok', title: 'Maestro Herrero', perk: 'Descuento en herramientas', discount: 0.85, target: 'Herramienta', special: 'ganzua' },
        { name: 'Kaelen', title: 'Contrabandista', perk: 'Rebajas en armamento', discount: 0.80, target: 'Arma', special: 'kit_hackeo' }
      ];
      const hour = new Date().getHours();
      return merchants[Math.floor(hour / 6) % merchants.length];
    }

    const merchant = getWorldState();
    const cmdType = command.toLowerCase();

    if (['inventory', 'inv', 'inventario'].includes(cmdType)) {
      const name = users?.name || msg.pushName || 'Aventurero';
      let text = `INVENTARIO DE ${name.toUpperCase()}\n\n`;
      text += `Bolsillo: ¥${(user.coins || 0).toLocaleString()} ${currency}\n`;
      text += `Banco: ¥${(user.bank || 0).toLocaleString()} ${currency}\n`;
      text += `Salud: ${user.health || 100}/100 | Estamina: ${user.stamina || 100}/100\n\n`;

      let hasItems = false;
      const sections = [
        { title: 'HERRAMIENTAS Y EQUIPO', data: user.tools },
        { title: 'ARMAS', data: user.weapons },
        { title: 'ARMADURAS', data: user.armor },
        { title: 'RELIQUIAS', data: user.relics }
      ];

      for (const sec of sections) {
        if (sec.data && Object.keys(sec.data).length > 0) {
          hasItems = true;
          text += `${sec.title}:\n`;
          for (const [id, val] of Object.entries(sec.data)) {
            const item = CATALOGO[id];
            if (item) {
              const dur = val.durability !== undefined ? ` [${val.durability}/${val.maxDurability}]` : '';
              const uses = val.uses !== undefined ? ` [${val.uses} usos]` : '';
              text += `- ${item.name}${dur}${uses}\n`;
            }
          }
          text += '\n';
        }
      }

      if (user.inventory && Object.keys(user.inventory).length > 0) {
        let count = 0;
        let invText = 'CONSUMIBLES:\n';
        for (const [id, qty] of Object.entries(user.inventory)) {
          if (qty > 0 && CATALOGO[id]) {
            count++;
            hasItems = true;
            invText += `- ${CATALOGO[id].name} (x${qty})\n`;
          }
        }
        if (count > 0) text += invText + '\n';
      }

      if (!hasItems) {
        text += `Tu inventario está vacío.\nUsa ${usedPrefix}shop para ver la tienda.`;
      }

      return sock.sendMessage(msg.chat, { text: text.trim() }, { quoted: msg });
    }

    if (['shop', 'tienda'].includes(cmdType)) {
      const special = CATALOGO[merchant.special];
      const specialPrice = Math.floor(special.price * merchant.discount);

      let text = `MERCADO CENTRAL\n`;
      text += `Mercader: ${merchant.name} (${merchant.title})\n`;
      text += `Oferta del día: ${special.name} a ¥${specialPrice.toLocaleString()} ${currency}\n\n`;
      text += `ARTÍCULOS DISPONIBLES:\n\n`;

      for (const [key, item] of Object.entries(CATALOGO)) {
        let price = item.price;
        if (key === merchant.special || item.tipo === merchant.target) {
          price = Math.floor(item.price * merchant.discount);
        }
        text += `- ${item.name} [${key}]\n`;
        text += `  Precio: ¥${price.toLocaleString()} ${currency} | Tipo: ${item.tipo}\n`;
        text += `  Detalle: ${item.description}\n\n`;
      }

      text += `Para comprar usa: ${usedPrefix}buy <id>`;
      return sock.sendMessage(msg.chat, { text: text.trim() }, { quoted: msg });
    }

    if (['buy', 'comprar'].includes(cmdType)) {
      const itemKey = (args[0] || '').toLowerCase().trim();
      if (!itemKey) {
        return msg.reply(`Indica el ID del producto que deseas comprar.\nEjemplo: ${usedPrefix}buy ganzua`);
      }

      const item = CATALOGO[itemKey];
      if (!item) {
        return msg.reply(`El producto ${itemKey} no existe en el catálogo.`);
      }

      let price = item.price;
      if (itemKey === merchant.special || item.tipo === merchant.target) {
        price = Math.floor(item.price * merchant.discount);
      }

      const coins = user.coins || 0;
      if (coins < price) {
        return msg.reply(`No tienes suficientes monedas. Necesitas ¥${price.toLocaleString()} ${currency}.`);
      }

      if (item.tipo === 'Herramienta') {
        const prefix = itemKey.split('_')[0];
        if (itemKey !== 'ganzua' && itemKey !== 'kit_hackeo') {
          for (const existingId of Object.keys(user.tools || {})) {
            if (existingId.startsWith(prefix)) {
              return msg.reply(`Ya posees una herramienta de esta categoría activa.`);
            }
          }
        }
        user.tools[itemKey] = { durability: item.durability, maxDurability: item.durability };
        db.updateChatUser(msg.chat, msg.sender, 'tools', user.tools);
      } else if (item.tipo === 'Arma') {
        user.weapons[itemKey] = { durability: item.durability, maxDurability: item.durability };
        db.updateChatUser(msg.chat, msg.sender, 'weapons', user.weapons);
      } else if (item.tipo === 'Armadura') {
        user.armor[itemKey] = { durability: item.durability, maxDurability: item.durability };
        db.updateChatUser(msg.chat, msg.sender, 'armor', user.armor);
      } else if (item.tipo === 'Reliquia') {
        user.relics[itemKey] = { uses: item.uses };
        db.updateChatUser(msg.chat, msg.sender, 'relics', user.relics);
      } else {
        user.inventory[itemKey] = (user.inventory[itemKey] || 0) + 1;
        db.updateChatUser(msg.chat, msg.sender, 'inventory', user.inventory);
      }

      db.updateChatUser(msg.chat, msg.sender, 'coins', coins - price);
      return sock.reply(msg.chat, `Compra exitosa: Has adquirido ${item.name} por ¥${price.toLocaleString()} ${currency}.`, msg);
    }

    if (['use', 'usar'].includes(cmdType)) {
      const itemKey = (args[0] || '').toLowerCase().trim();
      if (!itemKey) {
        return msg.reply(`Indica el consumible a usar. Ejemplo: ${usedPrefix}use pocion_vida`);
      }

      const qty = user.inventory?.[itemKey] || 0;
      if (qty <= 0) {
        return msg.reply(`No tienes ese objeto en tu inventario.`);
      }

      const item = CATALOGO[itemKey];
      if (!item || item.tipo !== 'Consumible') {
        return msg.reply(`Este objeto no es un consumible utilizable.`);
      }

      user.inventory[itemKey] -= 1;
      let msgText = `Has consumido ${item.name}.\n`;

      if (item.restoreHealth) {
        user.health = Math.min(100, (user.health || 0) + item.restoreHealth);
        db.updateChatUser(msg.chat, msg.sender, 'health', user.health);
        msgText += `Salud actual: ${user.health}/100\n`;
      }
      if (item.restoreStamina) {
        user.stamina = Math.min(100, (user.stamina || 0) + item.restoreStamina);
        db.updateChatUser(msg.chat, msg.sender, 'stamina', user.stamina);
        msgText += `Estamina actual: ${user.stamina}/100\n`;
      }

      db.updateChatUser(msg.chat, msg.sender, 'inventory', user.inventory);
      return sock.sendMessage(msg.chat, { text: msgText.trim() }, { quoted: msg });
    }
  }
};
          
