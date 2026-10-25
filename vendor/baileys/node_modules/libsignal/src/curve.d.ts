export interface KeyPairType {
  pubKey: Buffer;
  privKey: Buffer;
}

export function generateKeyPair(): KeyPairType;

export function createKeyPair(privateKey: Buffer): KeyPairType;

export function getPublicFromPrivateKey(privateKey: Buffer): Buffer;

export function calculateAgreement(
  publicKey: Uint8Array,
  privateKey: Uint8Array
): Buffer;

export function calculateSignature(
  privateKey: Uint8Array,
  message: Uint8Array
): Buffer;

export function verifySignature(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
  isInit?: boolean
): boolean;
