import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import * as curve from "libsignal/src/curve.js";
import { KEY_BUNDLE_TYPE } from "../Defaults/index.js";
let md5, hkdf;
try {
  const rustBridge = await import("whatsapp-rust-bridge");
  md5 = rustBridge.md5;
  hkdf = rustBridge.hkdf;
} catch {
  md5 = (buf) => createHash("md5").update(buf).digest();
  hkdf = (key, length, { salt, info } = {}) => {
    const hashLen = 32;
    const prk = salt ? createHmac("sha256", salt).update(key).digest() : createHmac("sha256", Buffer.alloc(hashLen)).update(key).digest();
    const infoBuffer = info ? typeof info === "string" ? Buffer.from(info) : Buffer.from(info) : Buffer.alloc(0);
    const blocks = Math.ceil(length / hashLen);
    let prev = Buffer.alloc(0);
    const output = [];
    for (let i = 1; i <= blocks; i++) {
      prev = createHmac("sha256", prk).update(Buffer.concat([prev, infoBuffer, Buffer.from([i])])).digest();
      output.push(prev);
    }
    return Buffer.concat(output).subarray(0, length);
  };
}
const { subtle } = globalThis.crypto;
const generateSignalPubKey = (pubKey) => pubKey.length === 33 ? pubKey : Buffer.concat([KEY_BUNDLE_TYPE, pubKey]);
const Curve = { generateKeyPair: () => {
  const { pubKey, privKey } = curve.generateKeyPair();
  return { private: Buffer.from(privKey), public: Buffer.from(pubKey.slice(1)) };
}, sharedKey: (privateKey, publicKey) => {
  const shared = curve.calculateAgreement(generateSignalPubKey(publicKey), privateKey);
  return Buffer.from(shared);
}, sign: (privateKey, buf) => curve.calculateSignature(privateKey, buf), verify: (pubKey, message, signature) => {
  try {
    return curve.verifySignature(generateSignalPubKey(pubKey), message, signature);
  } catch (error) {
    return false;
  }
} };
const signedKeyPair = (identityKeyPair, keyId) => {
  const preKey = Curve.generateKeyPair();
  const pubKey = generateSignalPubKey(preKey.public);
  const signature = Curve.sign(identityKeyPair.private, pubKey);
  return { keyPair: preKey, signature, keyId };
};
const GCM_TAG_LENGTH = 128 >> 3;
function aesEncryptGCM(plaintext, key, iv, additionalData) {
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(additionalData);
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}
function aesDecryptGCM(ciphertext, key, iv, additionalData) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  const enc = ciphertext.slice(0, ciphertext.length - GCM_TAG_LENGTH);
  const tag = ciphertext.slice(ciphertext.length - GCM_TAG_LENGTH);
  decipher.setAAD(additionalData);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}
function aesEncryptCTR(plaintext, key, iv) {
  const cipher = createCipheriv("aes-256-ctr", key, iv);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
function aesDecryptCTR(ciphertext, key, iv) {
  const decipher = createDecipheriv("aes-256-ctr", key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function aesDecrypt(buffer, key) {
  return aesDecryptWithIV(buffer.subarray(16), key, buffer.subarray(0, 16));
}
function aesDecryptWithIV(buffer, key, IV) {
  const aes = createDecipheriv("aes-256-cbc", key, IV);
  return Buffer.concat([aes.update(buffer), aes.final()]);
}
function aesEncrypt(buffer, key) {
  const IV = randomBytes(16);
  const aes = createCipheriv("aes-256-cbc", key, IV);
  return Buffer.concat([IV, aes.update(buffer), aes.final()]);
}
function aesEncrypWithIV(buffer, key, IV) {
  const aes = createCipheriv("aes-256-cbc", key, IV);
  return Buffer.concat([aes.update(buffer), aes.final()]);
}
function hmacSign(buffer, key, variant = "sha256") {
  return createHmac(variant, key).update(buffer).digest();
}
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest();
}
async function derivePairingCodeKey(pairingCode, salt) {
  const encoder = new TextEncoder();
  const pairingCodeBuffer = encoder.encode(pairingCode);
  const saltBuffer = new Uint8Array(salt instanceof Uint8Array ? salt : new Uint8Array(salt));
  const keyMaterial = await subtle.importKey("raw", pairingCodeBuffer, { name: "PBKDF2" }, false, ["deriveBits"]);
  const derivedBits = await subtle.deriveBits({ name: "PBKDF2", salt: saltBuffer, iterations: 2 << 16, hash: "SHA-256" }, keyMaterial, 32 * 8);
  return Buffer.from(derivedBits);
}
export {
  Curve,
  aesDecrypt,
  aesDecryptCTR,
  aesDecryptGCM,
  aesDecryptWithIV,
  aesEncrypWithIV,
  aesEncrypt,
  aesEncryptCTR,
  aesEncryptGCM,
  derivePairingCodeKey,
  generateSignalPubKey,
  hkdf,
  hmacSign,
  md5,
  sha256,
  signedKeyPair
};
