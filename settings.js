import fs from 'fs';
import { watchFile, unwatchFile } from 'fs';
import { fileURLToPath } from 'url';

global.owner = [
    '573015200599',
    '104260465336559@lid',
    '593989068253',
    '584148014097',
    '5491157745642',
];

global.devs = [
// '<numero>',
];

global.staff = [
//  '<numero',
];

global.inv = [
//  '<numero>',
];

global.dev = "Created by @mai";
global.links = {
  api: 'https://api.evogb.org',
  channel: "https://whatsapp.com/channel/0029VbCbocKJpe8WhogtnG0w",
  github: "https://github.com/mai1206-art",
  gmail: "reyesmichael706@gmail.com"
};

global.my = {
  ch: "",
  ch2: "",
  ch1: ''
};

global.APIs = { 
  yuki: { url: "https://api.yuki-wabot.my.id", key: null },
  vreden: { url: "https://api.vreden.web.id", key: null },
  ootaizumi: { url: "https://api.ootaizumi.web.id", key: null },
  delirius: { url: "https://api.delirius.online", key: null },
  zenzxz: { url: "https://api.zenzxz.my.id", key: null },
  siputzx: { url: "https://app.siputzx.my.id", key: null },
  evogb: { url: "https://api.evogb.org", key: null }
};

global.msgglobal = '✿⸝꙳.˖ Ocurrió un problema, contacte al creador';

global.mess = {
  socket: '(∩´͈ ᴖ `͈∩ ྀི) Este comando solo puede ser ejecutado por un Socket.',
  owner: '✿⸝꙳.˖ Este comando requiere el rango *Owner*.',
  dev: '✿⸝꙳.˖ Este comando requiere el rango *Dev*.',
  staff: '✿⸝꙳.˖ Este comando requiere el rango *Staff*.',
  inv: '✿⸝꙳.˖ Este comando requiere el rango *Invitado*.',
  admin: '٩ʕ◕౪◕ʔو Este comando solo puede ser ejecutado por los Administradores del Grupo.',
  botAdmin: '(𓂂꜆◕⩊◕꜀𓂂) Este comando solo puede ser ejecutado si el Socket es Administrador del Grupo.',
  nsfw: '(•ૢ⚈͒⌄⚈͒•ૢ) Los comandos de *NSFW* están desactivados en este grupo.',
  comandooff: 'ღゝ◡╹ )ノ Estos comandos están desactivados en este grupo.'
};

let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
  unwatchFile(file);
  import(`${file}?update=${Date.now()}`);
});
