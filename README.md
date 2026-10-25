<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,20,24&height=220&section=header&text=Elaina%20Bot&fontSize=64&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=La%20bruja%20viajera%20de%20WhatsApp&descAlignY=58&descSize=20" alt="Banner" width="100%"/>

<!-- GIF principal de Elaina: guarda tu archivo en assets/elaina-hero.gif -->
<img src="./assets/elaina-hero.gif" alt="Elaina" width="420"/>

### ✦ *"¿Una bruja tan hermosa como yo? Sí, soy yo."* ✦

<p>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A523-8CC84B?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node"/>
  <img src="https://img.shields.io/badge/Baileys-Multi%20Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys"/>
  <img src="https://img.shields.io/badge/ESM-m%C3%B3dulos-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="ESM"/>
  <img src="https://img.shields.io/badge/SQLite-integrado-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite"/>
  <img src="https://img.shields.io/badge/Termux-compatible-000000?style=for-the-badge&logo=android&logoColor=white" alt="Termux"/>
</p>

</div>

---

## 🪄 ¿Qué es esto?

Un bot de **WhatsApp multi-dispositivo** hecho con **Baileys** y JavaScript (ESM), pensado para ser rápido, simple y estable. Incluye sub-bots, economía, gacha, stickers, descargas, herramientas de grupo y mucho más.

<div align="center">
  <!-- Imagen PNG de Elaina: guarda tu archivo en assets/elaina-1.png -->
  <img src="./assets/elaina-1.png" alt="Elaina" width="260"/>
</div>

---

## ✨ Características

| | Módulo | Qué hace |
|---|---|---|
| 🧙‍♀️ | **Sub-bots** | Vincula más bots por código o QR desde el bot principal |
| 👥 | **Grupos** | Bienvenida y despedida, warns, kick, tagall, hidetag, antilink, antistatus, anticall |
| 💰 | **Economía** | Trabajo, minería, pesca, casino, tienda, banco y rankings |
| 🎴 | **Gacha** | Personajes, harem, intercambios, ventas y votos |
| 🖼️ | **Stickers** | Crear, editar metadatos, packs, brat, emojimix y más |
| 📥 | **Descargas** | YouTube, TikTok, Instagram, Facebook, Spotify |
| 👤 | **Perfil** | Nivel, descripción, cumpleaños, matrimonio y ranking |
| 🔧 | **Owner** | Reinicio, limpieza de sesión y base de datos, utilidades de mantenimiento |

<div align="center">
  <!-- GIF secundario: assets/elaina-2.gif -->
  <img src="./assets/elaina-2.gif" alt="Elaina" width="320"/>
</div>

---

## 🧹 Requisitos

- **Node.js** `>= 23`
- **npm** `>= 10.9.4`
- **ffmpeg** (se instala como dependencia, pero en Termux conviene tener el paquete del sistema)
- Una cuenta de WhatsApp para vincular el bot

---

## 🚀 Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/NetherLord2233/ElainaBot-MD.git
cd ElainaBot-MD

# 2. Instalar dependencias
npm install

# 3. Configurar settings.js (owners, links y keys)

# 4. Iniciar el bot
npm start
```

Al primer arranque el bot te pedirá vincular la sesión (código o QR). La base de datos y la carpeta `Sessions/` se crean solas.

### 📱 En Termux

```bash
pkg update && pkg upgrade
pkg install nodejs git ffmpeg
git clone https://github.com/NetherLord2233/ElainaBot-MD.git
cd ElainaBot-MD
npm install
npm start
```

---

## ⚙️ Configuración

Todo se ajusta en `settings.js`:

```js
global.owner = ['5491100000000'];   // números con rango Owner
global.APIs = {
  evogb: { url: 'https://api.evogb.org', key: 'TU_KEY' }
};
```

> [!WARNING]
> **No nos hacemos responsables sobre baneos de cuenta por parte de WhatsApp**

<div align="center">
  <!-- PNG: assets/elaina-2.png -->
  <img src="./assets/elaina-2.png" alt="Elaina" width="240"/>
</div>

---

## 🗂️ Estructura

```
├── cmds/            # Comandos por categoría (group, economy, gacha, stickers...)
├── lib/             # Utilidades, base de datos y cargador de comandos
├── scripts/         # Scripts de instalación
├── handler.js       # Procesa cada mensaje y ejecuta comandos
├── index.js         # Arranque, conexión y sesiones
└── settings.js      # Configuración global
```

---

## 🤝 Contribuir

1. Haz un fork del proyecto
2. Crea una rama: `git checkout -b mi-mejora`
3. Haz commit de tus cambios: `git commit -m "Agrega mi mejora"`
4. Sube la rama: `git push origin mi-mejora`
5. Abre un Pull Request

---

## 💬 Comunidad y soporte

<div align="center">

[![Canal de WhatsApp](https://img.shields.io/badge/Canal-WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://whatsapp.com/channel/0029VbCbocKJpe8WhogtnG0w)
[![GitHub](https://img.shields.io/badge/GitHub-mai1206--art-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/mai1206-art)

<!-- GIF final: assets/elaina-3.gif -->
<img src="./assets/elaina-3.gif" alt="Elaina" width="300"/>

*Hecho con ✦ y un poco de magia*

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,20,24&height=120&section=footer" alt="Footer" width="100%"/>

</div>
