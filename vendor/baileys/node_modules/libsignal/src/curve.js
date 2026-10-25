'use strict';
const curveJs = require('curve25519-js');
const rustCurve = require('@skidy89/libsignal-plugins');
const KEY_BUNDLE_TYPE = Buffer.from([5]);

const prefixKeyInPublicKey = function (pubKey) {
  return Buffer.concat([KEY_BUNDLE_TYPE, pubKey]);
};

function validatePrivKey(privKey) {
    if (privKey === undefined) {
        throw new Error("Undefined private key");
    }
    if (!(privKey instanceof Buffer)) {
        throw new Error(`Invalid private key type: ${privKey.constructor.name}`);
    }
    if (privKey.byteLength != 32) {
        throw new Error(`Incorrect private key length: ${privKey.byteLength}`);
    }
}

function scrubPubKeyFormat(pubKey) {
    if (!(pubKey instanceof Buffer)) {
        throw new Error(`Invalid public key type: ${pubKey.constructor.name}`);
    }
    if (pubKey === undefined || ((pubKey.byteLength != 33 || pubKey[0] != 5) && pubKey.byteLength != 32)) {
        throw new Error("Invalid public key");
    }
    if (pubKey.byteLength == 33) {
        return pubKey.slice(1);
    } else {
        console.error("WARNING: Expected pubkey of length 33, please report the ST and client that generated the pubkey");
        return pubKey;
    }
}

function unclampEd25519PrivateKey(clampedSk) {
    const unclampedSk = new Uint8Array(clampedSk);
    unclampedSk[0] |= 6;
    unclampedSk[31] |= 128;
    unclampedSk[31] &= ~64;
    return unclampedSk;
}

exports.getPublicFromPrivateKey = function(privKey) {
    const unclampedPK = unclampEd25519PrivateKey(privKey);
    const keyPair = curveJs.generateKeyPair(unclampedPK);
    return prefixKeyInPublicKey(Buffer.from(keyPair.public));
};

exports.generateKeyPair = function() {
    return rustCurve.generateKeyPair();
};

exports.createKeyPair = function(privKey) {
    validatePrivKey(privKey);
    return rustCurve.keyPair(privKey);
};

exports.calculateAgreement = function(pubKey, privKey) {
    pubKey = scrubPubKeyFormat(pubKey);
    validatePrivKey(privKey);
    if (!pubKey || pubKey.byteLength != 32) {
        throw new Error("Invalid public key");
    }
    return rustCurve.calculateAgreement(pubKey, privKey);
};

exports.calculateSignature = function(privKey, message) {
    validatePrivKey(privKey);
    if (!message) {
        throw new Error("Invalid message");
    }
    return rustCurve.curve25519Sign(privKey, message);
};

exports.verifySignature = function(pubKey, msg, sig, isInit = false) {
    pubKey = scrubPubKeyFormat(pubKey);
    if (!pubKey || pubKey.byteLength != 32) {
        throw new Error("Invalid public key");
    }
    if (!msg) {
        throw new Error("Invalid message");
    }
    if (!sig || sig.byteLength != 64) {
        throw new Error("Invalid signature");
    }
    return rustCurve.verifySignature(pubKey, msg, sig, isInit);
};