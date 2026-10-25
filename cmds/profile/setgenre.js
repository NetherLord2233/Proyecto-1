import db from '#db';

export default {
  command: ['setgenre'],
  category: 'profile',
  description: 'Establecer tu género.',
  run: async ({ msg, args, usedPrefix, command }) => {
    const user = db.getUser(msg.sender);
    const input = args.join(' ').toLowerCase().trim();

    const genresList = [
      'Hombre', 'Mujer', 'No Binario', 'Género Fluido', 'Agénero', 'Bigénero', 'Pangénero', 'Demiboy', 'Demigirl', 'Transgénero', 'Cisgénero', 'Intersex', 'Femboy', 'Tomboy',

      // Orientaciones sexuales
      'Gay', 'Lesbiana', 'Bisexual', 'Pansexual', 'Asexual', 

      // Subculturas / Comunidades
      'Therian', 'Otherkin', 'Furry', 'VTuber',

      // Memes Clásicos del Internet
      'Helicóptero de Ataque', 'Tanque Sherman M4', 'Refrigerador LG Smart', 
      'Tostadora', 'Cono de Tránsito', 'Archivo PDF', 'Glitch en la Realidad',
      'Planta de Interior', 'WiFi de 5GHz', 'NPC de Relleno', 'F-14 Tomcat', 'M1A1 Abrams', 

      // Ficción / Sci-Fi / Fantasía
      'Alien', 'Cyborg', 'Androide', 'IA Autoconsciente', 'Super Saiyajin', 
      'Vampiro', 'Hombre Lobo', 'Elfo', 'Orco', 'Enano', 
      'Ghoul', 'Stand User', 'Jedi', 'Sith', 'Autobot', 
      'Decepticon', 'Ente Cósmico', 'Ángel', 'Demonio',

      // Animales
      'Capibara', 'Shrek', 'Waluigi', 'Wario', 'Gato', 'Perro', 

      // Random
      'Empanada de Jamón y Queso', 'Sombra Mística', 'Piedra Filosófica', 'GTA I', 'GTA II', 'GTA III', 'GTA SA', 'GTA IV', 'GTA V', 'GTA Chinatown', 'GTA Vice City', 'GTA VI', 'Biología desde el Cerro',

      // Streamers
      'Germán Garmendia', 'Bobicraft', 'Bananero', 'DaniRep | +6 Videos Diarios De GTA 5 Online!', 'Vegetta777', 'RubiusOMG', 'Biología desde Cero', 'Armapedia',

      //otros
      'Terreneitor',
    ];

    const opciones = genresList.map((g, i) => `*${i + 1}.* ${g}`).join('\n');

    if (!input) {
      return msg.reply(
        `《✧》 Debes ingresar un género o número válido.\n` +
        `> Ejemplo de uso: *${usedPrefix + command} 1* o *${usedPrefix + command} Helicóptero de Ataque*\n\n` +
        `*Lista de opciones disponibles:*\n${opciones}`
      );
    }

    let genre = null;

    if (!isNaN(input)) {
      const index = parseInt(input) - 1;
      if (index >= 0 && index < genresList.length) {
        genre = genresList[index];
      }
    } else {
      const found = genresList.find(g => g.toLowerCase() === input);
      if (found) {
        genre = found;
      }
    }

    if (!genre) {
      return msg.reply(`《✧》 Género no encontrado. Elige una opción o número de la lista:\n\n${opciones}`);
    }

    db.updateUser(msg.sender, 'genre', genre);
    return msg.reply(`✎ Se ha establecido tu género como: *${genre}* ฅ^•ﻌ•^ฅ`);
  },
};
