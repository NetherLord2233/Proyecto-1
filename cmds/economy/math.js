import db from '#db';
global.math = global.math || {};


const diffConfig = {
  'f1': { name: 'Fácil 1', level: 'easy', time: 60000, attempts: 3, rewards: [800, 1500] },
  'f2': { name: 'Fácil 2', level: 'easy', time: 60000, attempts: 3, rewards: [1500, 2500] },
  'f3': { name: 'Fácil 3', level: 'easy', time: 60000, attempts: 3, rewards: [2500, 4000] },

  'm1': { name: 'Medio 1', level: 'medium', time: 120000, attempts: 2, rewards: [4000, 6000] },
  'm2': { name: 'Medio 2', level: 'medium', time: 120000, attempts: 2, rewards: [6000, 9000] },
  'm3': { name: 'Medio 3', level: 'medium', time: 120000, attempts: 2, rewards: [9000, 13000] },

  'd1': { name: 'Difícil 1', level: 'hard', time: 180000, attempts: 2, rewards: [13000, 18000] },
  'd2': { name: 'Difícil 2', level: 'hard', time: 180000, attempts: 2, rewards: [18000, 25000] },
  'd3': { name: 'Difícil 3', level: 'hard', time: 180000, attempts: 2, rewards: [25000, 35000] },

  'i1': { name: 'Imposible 1', level: 'impossible', time: 240000, attempts: 2, rewards: [35000, 50000] },
  'i2': { name: 'Imposible 2', type: 'impossible', time: 240000, attempts: 2, rewards: [50000, 70000] },
  'i3': { name: 'Imposible 3', level: 'impossible', time: 240000, attempts: 2, rewards: [70000, 95000] },

  'e1': { name: 'Extremo 1', level: 'extreme', time: 300000, attempts: 2, rewards: [100000, 140000] },
  'e2': { name: 'Extremo 2', level: 'extreme', time: 300000, attempts: 2, rewards: [140000, 200000] },
  'e3': { name: 'Extremo 3', level: 'extreme', time: 300000, attempts: 2, rewards: [200000, 300000] }
};

const aliasMap = {
  'facil': 'f1', 'facil1': 'f1', 'facil2': 'f2', 'facil3': 'f3',
  'medio': 'm1', 'medio1': 'm1', 'medio2': 'm2', 'medio3': 'm3',
  'dificil': 'd1', 'dificil1': 'd1', 'dificil2': 'd2', 'dificil3': 'd3',
  'imposible': 'i1', 'imposible1': 'i1', 'imposible2': 'i2', 'imposible3': 'i3',
  'extremo': 'e1', 'extremo1': 'e1', 'extremo2': 'e2', 'extremo3': 'e3'
};

const getRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomFloat = (min, max, dec = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(dec));

// BANCO MASIVO DE MODELOS DE EJERCICIOS
const generators = {
  easy: [
    () => { let a = getRandom(120, 999), b = getRandom(85, 850); return { prob: `${a} +${b}`, res: a + b }; },
    () => { let a = getRandom(300, 1500), b = getRandom(110, 750); return { prob: `${a} -${b}`, res: a - b }; },
    () => { let a = getRandom(14, 98), b = getRandom(12, 88); return { prob: `${a} ×${b}`, res: a * b }; },
    () => { let a = getRandom(15, 60), b = getRandom(4, 15); return { prob: `${a * b} ÷${b}`, res: a }; },
    () => { let a = getRandom(100, 500), b = getRandom(50, 300), c = getRandom(20, 150); return { prob: `${a} + ${b} -${c}`, res: a + b - c }; },
    () => { let a = getRandom(20, 80), b = getRandom(5, 15); return { prob: `Perímetro de un rectángulo de lados ${a} y${b}`, res: 2 * (a + b) }; },
    () => { let a = getRandom(5, 25); return { prob: `Área de un cuadrado de lado ${a}`, res: a * a }; },
    () => { let a = getRandom(12, 45), b = getRandom(8, 25); return { prob: `${a} ×${b} + 120`, res: (a * b) + 120 }; },
    () => { let a = getRandom(200, 800); return { prob: `El ${getRandom(10, 50)}\% de${a}`, res: (a * getRandom(10, 50)) / 100 }; },
    () => { let a = getRandom(15, 75), b = getRandom(10, 40); return { prob: `(${a} +${b}) × 3`, res: (a + b) * 3 }; }
  ],

  medium: [
    () => { let a = getRandom(9, 25), exp = getRandom(3, 4); return { prob: `${a}^${exp}`, res: Math.pow(a, exp) }; },
    () => { let a = getRandom(50, 250), b = getRandom(12, 85), c = getRandom(6, 22); return { prob: `(${a} + ${b}) ×${c}`, res: (a + b) * c }; },
    () => { let a = getRandom(5, 18); return { prob: `${a}³ -${getRandom(50, 300)}`, res: Math.pow(a, 3) - getRandom(50, 300) }; },
    () => { let r = getRandom(4, 20); return { prob: `Área de un círculo con radio r = ${r} (usa π = 3.14)`, res: 3.14 * r * r }; },
    () => { let a = getRandom(10, 40), d = getRandom(3, 12); return { prob: `Término 10 de sucesión aritmética: a1=${a}, d=${d}`, res: a + 9 * d }; },
    () => { let a = getRandom(15, 80), b = getRandom(2, 8); return { prob: `Hipotenusa de un triángulo con catetos ${a} y${b}`, res: Math.hypot(a, b) }; },
    () => { let a = getRandom(12, 35), b = getRandom(15, 40); return { prob: `Media aritmética entre ${a}, ${b} y${getRandom(20, 60)}`, res: (a + b + getRandom(20, 60)) / 3 }; },
    () => { let a = getRandom(100, 900); return { prob: `√${a * a} +${getRandom(10, 50)}²`, res: a + Math.pow(getRandom(10, 50), 2) }; },
    () => { let a = getRandom(15, 60), b = getRandom(3, 9); return { prob: `Promedio ponderado de ${a} (peso 2) y${b*10} (peso 3)`, res: (a * 2 + b * 10 * 3) / 5 }; },
    () => { let a = getRandom(12, 40); return { prob: `Volumen de un cubo de lado ${a}`, res: Math.pow(a, 3) }; }
  ],

  hard: [
    () => { let a = getRandom(7, 29), b = getRandom(180, 980), c = getRandom(1500, 7500); return { prob: `Despeja X: ${a}x + ${b} =${c}`, res: (c - b) / a }; },
    () => { let a = getRandom(8, 32), b = getRandom(120, 850), c = getRandom(4, 18), val = getRandom(2000, 9000); return { prob: `Despeja X: ${a}x -${b} + ${c}x =${val}`, res: (val + b) / (a + c) }; },
    () => { let a = getRandom(3, 12), b = getRandom(15, 80); return { prob: `Despeja X: ${a}(x - ${b}) =${getRandom(500, 3000)}`, res: (getRandom(500, 3000) / a) + b }; },
    () => { let x1 = getRandom(2, 8), y1 = getRandom(3, 12), x2 = getRandom(10, 20), y2 = getRandom(15, 30); return { prob: `Distancia entre puntos (${x1},${y1}) y (${x2},${y2})`, res: Math.hypot(x2 - x1, y2 - y1) }; },
    () => { let a = getRandom(15, 60), b = getRandom(20, 80); return { prob: `Magnitud del vector V = (${a},${b})`, res: Math.hypot(a, b) }; },
    () => { let a = getRandom(2, 9), b = getRandom(3, 8), c = getRandom(4, 12), d = getRandom(5, 15); return { prob: `Determinante de matriz [[${a},${b}], [${c},${d}]]`, res: (a * d) - (b * c) }; },
    () => { let a = getRandom(15, 45), b = getRandom(3, 9); return { prob: `Despeja X: x/${b} + ${a} =${getRandom(100, 400)}`, res: (getRandom(100, 400) - a) * b }; },
    () => { let a = getRandom(10, 30); return { prob: `Desarrollo de (${a} + x)² si x = ${getRandomFloat(1.5, 8.5, 1)}`, res: Math.pow(a + getRandomFloat(1.5, 8.5, 1), 2) }; },
    () => { let a = getRandom(2, 8), r = getRandomFloat(1.2, 2.5, 1); return { prob: `Término 5 de progresión geométrica: a1=${a}, r=${r}`, res: a * Math.pow(r, 4) }; },
    () => { let a = getRandom(12, 40), b = getRandom(15, 50); return { prob: `Área de un triángulo de base ${a} y altura${b}`, res: (a * b) / 2 }; }
  ],

  impossible: [
    () => { let a = getRandom(2, 9), b = getRandom(18, 95), c = getRandom(10, 70); return { prob: `Suma de raíces (x1 + x2) de: ${a}x² - ${b}x +${c} = 0`, res: b / a }; },
    () => { let a = getRandom(2, 9), b = getRandom(18, 95), c = getRandom(10, 70); return { prob: `Producto de raíces (x1 · x2) de: ${a}x² + ${b}x +${c} = 0`, res: c / a }; },
    () => { let a = getRandom(2, 9), b = getRandom(20, 80), c = getRandom(10, 50); return { prob: `Discriminante (Δ = b² - 4ac) de: ${a}x² + ${b}x +${c} = 0`, res: Math.pow(b, 2) - (4 * a * c) }; },
    () => { let a1 = getRandom(3, 12), b1 = getRandom(2, 9), c1 = getRandom(150, 600), a2 = getRandom(2, 10), b2 = getRandom(3, 11), c2 = getRandom(120, 500); return { prob: `En el sistema:\n1) ${a1}x +${b1}y = ${c1}\n2)${a2}x - ${b2}y =${c2}\nCalcula X`, res: (c1 * b2 + c2 * b1) / (a1 * b2 + a2 * b1) }; },
    () => { let a1 = getRandom(3, 12), b1 = getRandom(2, 9), c1 = getRandom(150, 600), a2 = getRandom(2, 10), b2 = getRandom(3, 11), c2 = getRandom(120, 500); return { prob: `En el sistema:\n1) ${a1}x +${b1}y = ${c1}\n2)${a2}x + ${b2}y =${c2}\nCalcula Y`, res: (a1 * c2 - a2 * c1) / (a1 * b2 - a2 * b1) }; },
    () => { let base = getRandom(2, 6), val = getRandom(300, 6000), add = getRandomFloat(15.2, 120.5, 2); return { prob: `log_${base}(${val}) +${add}`, res: (Math.log(val) / Math.log(base)) + add }; },
    () => { let val = getRandom(500, 8000), add = getRandomFloat(10.5, 90.5, 2); return { prob: `ln(${val}) -${add}`, res: Math.log(val) - add }; },
    () => { let a = getRandom(10, 40), b = getRandom(2, 8); return { prob: `Pendiente (m) de la recta ${a}x + ${b}y =${getRandom(100, 500)}`, res: -a / b }; },
    () => { let a = getRandom(3, 12), b = getRandom(4, 15); return { prob: `Límite lim(x->${a}) de (${b}x² - ${a*b}x) / (x -${a})`, res: b * a }; },
    () => { let a = getRandom(15, 60), angle = getRandom(30, 60); return { prob: `Componente X del vector V=(${a}) a ángulo de ${angle}° (cos ${angle}°=${Math.cos(angle * Math.PI / 180).toFixed(2)})`, res: a * Math.cos(angle * Math.PI / 180) }; },
    () => { let a = getRandom(3, 9), b = getRandom(12, 45); return { prob: `Vértice Y (k = c - b²/4a) de f(x) = ${a}x² +${b}x + 10`, res: 10 - (Math.pow(b, 2) / (4 * a)) }; },
    () => { let a = getRandom(5, 20); return { prob: `Ecuación exponencial: 2^(x + ${a}) =${Math.pow(2, a + 4)}`, res: 4 }; }
  ],

  extreme: [
    () => { let a = getRandom(6, 30), n = getRandom(3, 7), valX = getRandomFloat(1.5, 5.5, 1); return { prob: `f'(x) si f(x) = ${a}x^${n}, para x =${valX}`, res: a * n * Math.pow(valX, n - 1) }; },
    () => { let a = getRandom(5, 22), b = getRandom(8, 35), c = getRandom(15, 80), valX = getRandomFloat(2.1, 6.2, 1); return { prob: `f'(x) si f(x) = ${a}x³ -${b}x² + ${c}x, para x =${valX}`, res: (3 * a * Math.pow(valX, 2)) - (2 * b * valX) + c }; },
    () => { let a = getRandom(4, 18), b = getRandom(8, 45), valX = getRandomFloat(2.5, 7.5, 1); return { prob: `Evalúa ∫ (${a}x + ${b}) dx de 0 a${valX}`, res: (a * Math.pow(valX, 2) / 2) + (b * valX) }; },
    () => { let a = getRandom(4, 15), valX = getRandomFloat(2.0, 6.0, 1); return { prob: `Evalúa ∫ (${a}x²) dx de 0 a${valX}`, res: (a * Math.pow(valX, 3) / 3) }; },
    () => { let a = getRandom(3, 12); return { prob: `Evalúa ∫ e^(${a}x) dx de 0 a 1`, res: (Math.exp(a) - 1) / a }; },
    () => { let a = getRandom(5, 20), b = getRandom(2, 8), valX = getRandomFloat(1.2, 4.5, 1); return { prob: `f'(x) si f(x) = (${a}x + ${b})^3, para x =${valX}`, res: 3 * Math.pow(a * valX + b, 2) * a }; },
    () => { let a = getRandom(4, 18), b = getRandom(5, 25), valX = getRandomFloat(1.5, 5.0, 1); return { prob: `f''(x) [Segunda derivada] de f(x) = ${a}x⁴ - ${b}x², para x =${valX}`, res: (12 * a * Math.pow(valX, 2)) - (2 * b) }; },
    () => { let a = getRandom(3, 15), b = getRandom(2, 9), valX = getRandomFloat(1.1, 3.8, 1); return { prob: `f'(x) si f(x) = ln(${a}x² + ${b}), para x =${valX}`, res: (2 * a * valX) / (a * Math.pow(valX, 2) + b) }; },
    () => { let a = getRandom(2, 8), b = getRandom(3, 9), valX = getRandomFloat(1.2, 4.0, 1); return { prob: `f'(x) [Regla del producto] f(x) = (${a}x)(x² + ${b}), para x =${valX}`, res: (a * (Math.pow(valX, 2) + b)) + (a * valX * 2 * valX) }; },
    () => { let a = getRandom(2, 10), valX = getRandomFloat(0.2, 2.5, 1); return { prob: `f'(x) si f(x) = sin(${a}x), para x =${valX}`, res: a * Math.cos(a * valX) }; },
    () => { let a = getRandom(2, 10), valX = getRandomFloat(0.2, 2.5, 1); return { prob: `f'(x) si f(x) = cos(${a}x), para x =${valX}`, res: -a * Math.sin(a * valX) }; },
    () => { let a = getRandom(5, 25), valX = getRandomFloat(1.5, 4.5, 1); return { prob: `Evalúa ∫ (1 / x) dx de 1 a ${valX}`, res: Math.log(valX) }; },
    () => { let a = getRandom(2, 8), b = getRandom(1, 5), valX = getRandomFloat(1.5, 5.0, 1); return { prob: `f'(x) [Regla del cociente] f(x) = (${a}x) / (x + ${b}), para x =${valX}`, res: (a * (valX + b) - (a * valX)) / Math.pow(valX + b, 2) }; },
    () => { let a = getRandom(3, 15), valX = getRandomFloat(2.0, 6.0, 1); return { prob: `Área bajo la curva f(x) = ${a}x de x=0 a x=${valX}`, res: (a * Math.pow(valX, 2)) / 2 }; },
    () => { let a = getRandom(2, 9); return { prob: `Límite lim(x->0) de (e^(${a}x) - 1) / x`, res: a }; }
  ]
};

const generarProblema = (level) => {
  const categoryGenerators = generators[level] || generators['easy'];
  const fn = categoryGenerators[Math.floor(Math.random() * categoryGenerators.length)];
  const { prob, res } = fn();
  return { problema: prob, resultado: Math.round(res * 100) / 100 };
};

const formatTiempo = (ms) => {
  const min = Math.floor(ms / 60000);
  const seg = Math.floor((ms % 60000) / 1000);
  if (min > 0) {
    return `${min} minuto${min > 1 ? 's' : ''}${seg > 0 ? ` con ${seg}s` : ''}`;
  }
  return `${seg} segundos`;
};

export default {
  command: ['math', 'mates'],
  category: 'economy',
  description: 'Iniciar un reto matemático con variaciones masivas de ejercicios.',

  before: async ({ msg, sock }) => {
    const chatId = msg.chat;
    const juego = global.math[chatId];
    if (!juego?.juegoActivo) return;

    const textoUsuario = msg.text?.trim();
    if (!textoUsuario) return;

    const respuestaUsuario = parseFloat(textoUsuario.replace(',', '.'));
    if (isNaN(respuestaUsuario)) return;

    const botId = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : '';
    const chat = db.getChat(chatId);
    if (chat?.primaryBot && chat.primaryBot !== botId) return;

    const respuestaCorrecta = juego.respuesta;
    const keyDiff = juego.keyDiff;

    let esValida = Math.abs(respuestaUsuario - respuestaCorrecta) <= 0.2;

    if (!esValida && (keyDiff.startsWith('d') || keyDiff.startsWith('i') || keyDiff.startsWith('e'))) {
      if (Math.floor(respuestaCorrecta) === Math.floor(respuestaUsuario) || Math.round(respuestaCorrecta) === Math.round(respuestaUsuario)) {
        esValida = true;
      }
    }

    if (esValida) {
      clearTimeout(juego.tiempoLimite);
      delete global.math[chatId];

      const user = db.getChatUser(chatId, msg.sender) || {};
      const [min, max] = juego.cfg.rewards;
      const premio = Math.floor(Math.random() * (max - min + 1)) + min;
      const nuevoSaldo = (user.coins || 0) + premio;

      db.updateChatUser(chatId, msg.sender, 'coins', nuevoSaldo);

      await sock.reply(chatId, `*¡RESPUESTA CORRECTA!*\n\n> \`Respuesta exacta:\` *${respuestaCorrecta}*\n> \`Premio:\` *+¥${premio.toLocaleString()}*\n> \`Saldo actual:\` *¥${nuevoSaldo.toLocaleString()}*`, msg);
      return true;
    } else {
      juego.intentos += 1;
      const restantes = juego.cfg.attempts - juego.intentos;

      if (restantes <= 0) {
        clearTimeout(juego.tiempoLimite);
        delete global.math[chatId];
        await sock.reply(chatId, `*¡TE QUEDASTE SIN INTENTOS!*\n\n> \`Respuesta correcta:\` *${respuestaCorrecta}*`, msg);
      } else {
        await sock.reply(chatId, `*¡RESPUESTA INCORRECTA!*\n\n> \`Te quedan:\` *${restantes} intento${restantes > 1 ? 's' : ''}*`, msg);
      }
      return true;
    }
  },

  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const chat = db.getChat(chatId);

    if (chat?.adminonly || !chat?.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }

    if (global.math[chatId]?.juegoActivo) {
      return sock.reply(chatId, 'ꕥ Ya hay un juego activo en este chat. Espera a que termine.', msg);
    }

    let input = args[0]?.toLowerCase();
    if (aliasMap[input]) input = aliasMap[input];

    if (!input || !diffConfig[input]) {
      const menuText = `─── ❖ *DESAFÍO MATEMÁTICO* ❖ ───

> \`f1:\` *Fácil 1* • ¥800 - ¥1,500 (1 min | 3 int)
> \`f2:\` *Fácil 2* • ¥1,500 - ¥2,500 (1 min | 3 int)
> \`f3:\` *Fácil 3* • ¥2,500 - ¥4,000 (1 min | 3 int)

> \`m1:\` *Medio 1* • ¥4,000 - ¥6,000 (2 min | 2 int)
> \`m2:\` *Medio 2* • ¥6,000 - ¥9,000 (2 min | 2 int)
> \`m3:\` *Medio 3* • ¥9,000 - ¥13,000 (2 min | 2 int)

> \`d1:\` *Difícil 1* • ¥13,000 - ¥18,000 (3 min | 2 int)
> \`d2:\` *Difícil 2* • ¥18,000 - ¥25,000 (3 min | 2 int)
> \`d3:\` *Difícil 3* • ¥25,000 - ¥35,000 (3 min | 2 int)

> \`i1:\` *Imposible 1* • ¥35,000 - ¥50,000 (4 min | 2 int)
> \`i2:\` *Imposible 2* • ¥50,000 - ¥70,000 (4 min | 2 int)
> \`i3:\` *Imposible 3* • ¥70,000 - ¥95,000 (4 min | 2 int)

> \`e1:\` *Extremo 1* • ¥100,000 - ¥140,000 (5 min | 2 int)
> \`e2:\` *Extremo 2* • ¥140,000 - ¥200,000 (5 min | 2 int)
> \`e3:\` *Extremo 3* • ¥200,000 - ¥300,000 (5 min | 2 int)

───────────────
*Uso:* \`${usedPrefix + command} <modo>\`
*Ejemplo:* \`${usedPrefix + command} e3\``;

      return sock.reply(chatId, menuText, msg);
    }

    const cfg = diffConfig[input];
    const { problema, resultado } = generarProblema(cfg.level);

    const problemMsg = `─── ❖ *RETO: ${cfg.name.toUpperCase()}* ❖ ───

> \`Ejercicio:\` *${problema}*
> \`Tiempo límite:\` *${formatTiempo(cfg.time)}*
> \`Intentos:\` *${cfg.attempts}*

───────────────
✐ *¡Escribe tu respuesta directamente en el chat!*
> Puedes usar decimales o redondear al entero más cercano`;

    await sock.reply(chatId, problemMsg, msg);

    global.math[chatId] = {
      juegoActivo: true,
      respuesta: resultado,
      intentos: 0,
      cfg,
      keyDiff: input,
      tiempoLimite: setTimeout(() => {
        if (global.math[chatId]?.juegoActivo) {
          delete global.math[chatId];
          sock.reply(chatId, `*¡TIEMPO AGOTADO!*\n\n> \`La respuesta era:\` *${resultado}*`, msg);
        }
      }, cfg.time)
    };
  }
};