import db from '#db';

export default {
  command: ['setpasatiempo', 'sethobby'],
  category: 'profile',
  description: 'Establecer tu pasatiempo.',
  run: async ({ msg, args, usedPrefix }) => {
    const user = db.getUser(msg.sender);
    const input = args.join(' ').trim();    

    const pasatiemposDisponibles = [
      // Hobbies Tradicionales y Deporte
      '📚 Leer', '✍️ Escribir', '🎤 Cantar', '💃 Bailar', '🎮 Jugar videojuegos', 
      '🎨 Dibujar', '🍳 Cocinar', '✈️ Viajar', '🏊 Nadar', '📸 Fotografía',
      '🎧 Escuchar música', '🏀 Deportes', '🎬 Ver películas/series', '🌿 Jardinería',
      '🧵 Manualidades', '🎲 Juegos de mesa', '🏋️‍♂️ Gimnasio', '🚴 Andar en bici',
      '🎯 Tiro con arco', '🧘‍♂️ Meditación', '🛠️ Bricolaje', '🎹 Tocar instrumentos',
      '🐶 Cuidar mascotas', '🐕 Pasear al perro', '💻 Programar / Coder', '🌌 Astronomía',
      '♟️ Ajedrez', '🍷 Catación de vinos', '🛍️️ Compras', '🏕️ Acampar',
      '🎣 Pescar', '📱 Scrollear TikTok/Reels', '🎭 Teatro', '☕ Tomar mate / café',
      '🏺 Coleccionar', '🧁 Repostería', '🚗 Automóviles', '🧩 Rompecabezas',
      '🎳 Bolos', '🏄 Surf', '🎨 Pintura', '📊 Invertir', '💄 Maquillaje', 
      '🛌 Dormir', '🍺 Cervecería', '🪓 Carpintería', '🧪 Experimentos',

      // Absurdos, Memes y Cotidianos
      '🍆 Autoamarme',
      '👀 Procrastinar',
      '💭 Ilusionarme por un futuro con mi crush',
      '🕵️‍♂️ Stalkear a mi ex',
      '🍑 Ver culos',
      '🧠 Tener una crisis existencial a las 3 AM',
      '🛋️ Mirar la pared pensando en la nada',
      '🤡 Arrastrarme por migajas',
      '💸 Gastar plata que no tengo',
      '🍕 Pedir delivery y arrepentirme',
      '💬 Hablar solo por la casa',
      '🛸 Investigar teorías de conspiración',
      '🤖 Pelearme con gente en los comentarios',
      '🚪 Abrir la heladera cada 5 minutos sabiendo que no hay nada',
      '🎭 Hundirme en mi miseria',
      '🍔 Comer',
      '🌿 Fumar mota',
      '💻 Tener una IA de amiga',
      '🤫 Mirar porno',
      '🍿 Maratonear K-Dramas',
      '🗿 Farmear Aura',
      '🐈 Acariciar michis',
      '🦢 Ir al parque',
      '💡 Tener ideas de negocio',
      '🛒 Ir al super',
      '🪞 Mirarme al espejo',
      '🍞 Comprar pan',
      '☎️ Hacer bromas telefónicas',
      '🥈 Ser el segundo en todo',
      '🌐 Hacer Scroll como un zombie',
      '🟡 Papoi',
      '🎭 Hacer cosplay',
      '🌑 Contemplar el abismo',
      '🥴 Hacerme el pendejo',

      'Otro 🌟'
    ];    

    if (!input) {
      let lista = '🎯 *Elige un pasatiempo:*\n\n';
      pasatiemposDisponibles.forEach((pasatiempo, index) => {
        lista += `${index + 1}) ${pasatiempo}\n`;
      });
      lista += `\n*Ejemplos:*\n> ${usedPrefix}setpasatiempo 1\n> ${usedPrefix}setpasatiempo Programar\n> ${usedPrefix}setpasatiempo 25`;
      return msg.reply(lista);
    }    

    let pasatiempoSeleccionado = '';

    if (/^\d+$/.test(input)) {
      const index = parseInt(input) - 1;
      if (index >= 0 && index < pasatiemposDisponibles.length) {
        pasatiempoSeleccionado = pasatiemposDisponibles[index];
      } else {
        return msg.reply(`《✧》 Número inválido. Selecciona un número entre 1 y ${pasatiemposDisponibles.length}`);
      }
    } else {
      const inputLimpio = input.replace(/[^\w\s]/g, '').toLowerCase().trim();
      const encontrado = pasatiemposDisponibles.find(p => 
        p.replace(/[^\w\s]/g, '').toLowerCase().includes(inputLimpio)
      );

      if (encontrado) {
        pasatiempoSeleccionado = encontrado;
      } else {
        return msg.reply('《✧》 Pasatiempo no encontrado. Usa el comando sin argumentos para ver la lista disponible.');
      }
    }    

    if (user.pasatiempo === pasatiempoSeleccionado) {
      return msg.reply(`《✧》 Ya tienes establecido este pasatiempo: *${user.pasatiempo}*`);
    }    

    db.updateUser(msg.sender, 'pasatiempo', pasatiempoSeleccionado);
    return msg.reply(`✐ Se ha establecido tu pasatiempo:\n> *${pasatiempoSeleccionado}* ฅ^•ﻌ•^ฅ`);
  },
};
