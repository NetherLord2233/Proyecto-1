import * as nodeCrypto from "crypto";
import { generateKeyPair } from "libsignal/src/curve.js";
function generateSenderKey() {
  return nodeCrypto.randomBytes(32);
}
function generateSenderKeyId() {
  return nodeCrypto.randomInt(2147483647);
}
function generateSenderSigningKey(key) {
  if (!key) {
    key = generateKeyPair();
  }
  return { public: Buffer.from(key.pubKey), private: Buffer.from(key.privKey) };
}
export {
  generateSenderKey,
  generateSenderKeyId,
  generateSenderSigningKey
};
