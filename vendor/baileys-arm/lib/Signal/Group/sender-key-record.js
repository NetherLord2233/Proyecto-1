import { BufferJSON } from "../../Utils/generics.js";
import { SenderKeyState } from "./sender-key-state.js";
class SenderKeyRecord {
  constructor(serialized) {
    this.MAX_STATES = 5;
    this.senderKeyStates = [];
    if (serialized) {
      for (const structure of serialized) {
        this.senderKeyStates.push(new SenderKeyState(null, null, null, null, null, null, structure));
      }
    }
  }
  isEmpty() {
    return this.senderKeyStates.length === 0;
  }
  getSenderKeyState(keyId) {
    if (keyId === void 0 && this.senderKeyStates.length) {
      return this.senderKeyStates[this.senderKeyStates.length - 1];
    }
    return this.senderKeyStates.find((state) => state.getKeyId() === keyId);
  }
  addSenderKeyState(id, iteration, chainKey, signatureKey) {
    this.senderKeyStates.push(new SenderKeyState(id, iteration, chainKey, null, signatureKey));
    if (this.senderKeyStates.length > this.MAX_STATES) {
      this.senderKeyStates.shift();
    }
  }
  setSenderKeyState(id, iteration, chainKey, keyPair) {
    this.senderKeyStates.length = 0;
    this.senderKeyStates.push(new SenderKeyState(id, iteration, chainKey, keyPair));
  }
  serialize() {
    return this.senderKeyStates.map((state) => state.getStructure());
  }
  static deserialize(data) {
    const str = Buffer.from(data).toString("utf-8");
    const parsed = JSON.parse(str, BufferJSON.reviver);
    return new SenderKeyRecord(parsed);
  }
}
export {
  SenderKeyRecord
};
