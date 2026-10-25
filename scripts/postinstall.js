import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 1. Detectar arquitectura
const arch = os.arch();
const projectRoot = process.cwd();
const nodeModulesDir = path.join(projectRoot, 'node_modules');
const vendorDir = path.join(projectRoot, 'vendor');

console.log(`[Bot] Arquitectura detectada: ${arch}`);

// Verificar que exista la carpeta vendor antes de procesar
if (!fs.existsSync(vendorDir)) {
  console.log('[Bot] Carpeta vendor no encontrada. Saltando reemplazo.');
  process.exit(0);
}

try {
  console.log('[Bot] Procesando copia de módulos desde vendor...');

  // 2. Copiar módulo universal: curve25519-js
  const curveVendor = path.join(vendorDir, 'curve25519-js');
  const curveTarget = path.join(nodeModulesDir, 'curve25519-js');

  if (fs.existsSync(curveVendor)) {
    if (fs.existsSync(curveTarget)) {
      console.log('[Bot] Eliminando node_modules/curve25519-js anterior...');
      fs.rmSync(curveTarget, { recursive: true, force: true });
    }
    console.log('[Bot] Copiando curve25519-js...');
    fs.cpSync(curveVendor, curveTarget, { recursive: true, force: true });
  } else {
    console.warn(`[Bot] No se encontró curve25519-js en ${curveVendor}`);
  }

  // 3. Copiar módulos específicos por arquitectura
  if (arch === 'arm' || arch === 'arm64') {
    // -- baileys --
    const baileysVendor = path.join(vendorDir, `baileys-${arch}`);
    const baileysTarget = path.join(nodeModulesDir, 'baileys');

    if (fs.existsSync(baileysVendor)) {
      if (fs.existsSync(baileysTarget)) {
        console.log('[Bot] Eliminando node_modules/baileys anterior...');
        fs.rmSync(baileysTarget, { recursive: true, force: true });
      }
      console.log(`[Bot] Copiando baileys para ${arch}...`);
      fs.cpSync(baileysVendor, baileysTarget, { recursive: true, force: true });
    } else {
      console.warn(`[Bot] No se encontró baileys en ${baileysVendor}`);
    }

    // -- libsignal --
    const libsignalVendor = path.join(vendorDir, `libsignal-${arch}`);
    const libsignalTarget = path.join(nodeModulesDir, 'libsignal');

    if (fs.existsSync(libsignalVendor)) {
      if (fs.existsSync(libsignalTarget)) {
        console.log('[Bot] Eliminando node_modules/libsignal anterior...');
        fs.rmSync(libsignalTarget, { recursive: true, force: true });
      }
      console.log(`[Bot] Copiando libsignal para ${arch}...`);
      fs.cpSync(libsignalVendor, libsignalTarget, { recursive: true, force: true });
    } else {
      console.warn(`[Bot] No se encontró libsignal en ${libsignalVendor}`);
    }
  } else if (arch === 'x64') {
    // -- baileys estándar --
    const baileysVendor = path.join(vendorDir, 'baileys');
    const baileysTarget = path.join(nodeModulesDir, 'baileys');

    if (fs.existsSync(baileysVendor)) {
      if (fs.existsSync(baileysTarget)) {
        console.log('[Bot] Eliminando node_modules/baileys anterior...');
        fs.rmSync(baileysTarget, { recursive: true, force: true });
      }
      console.log('[Bot] Copiando baileys estándar (x64)...');
      fs.cpSync(baileysVendor, baileysTarget, { recursive: true, force: true });
    } else {
      console.warn(`[Bot] No se encontró baileys estándar en ${baileysVendor}`);
    }
  } else {
    console.log(`[Bot] Entorno ${arch}: Se conservan baileys y libsignal por defecto de npm.`);
  }

  console.log('[Bot] Reemplazo de módulos finalizado correctamente.');
} catch (error) {
  console.error('[Bot] Error durante la copia de módulos:', error.message);
  process.exit(1);
}

