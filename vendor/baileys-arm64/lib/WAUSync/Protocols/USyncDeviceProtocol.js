import { assertNodeErrorFree, getBinaryNodeChild } from "../../WABinary/index.js";
class USyncDeviceProtocol {
  constructor() {
    this.name = "devices";
  }
  getQueryElement() {
    return { tag: "devices", attrs: { version: "2" } };
  }
  getUserElement(user) {
    if (user?.devices?.deviceList && user.devices.deviceList.length > 0) {
      return { tag: "devices", attrs: { phash: user.devices.phash || "", ts: user.devices.keyIndex?.timestamp?.toString() || "", expectedTs: user.devices.keyIndex?.expectedTimestamp?.toString() || "" } };
    }
    return null;
  }
  parser(node) {
    const deviceList = [];
    let keyIndex = void 0;
    if (node.tag === "devices") {
      assertNodeErrorFree(node);
      const deviceListNode = getBinaryNodeChild(node, "device-list");
      const keyIndexNode = getBinaryNodeChild(node, "key-index-list");
      if (Array.isArray(deviceListNode?.content)) {
        for (const { tag, attrs } of deviceListNode.content) {
          const id = +attrs.id;
          const keyIndex2 = +attrs["key-index"];
          if (tag === "device") {
            deviceList.push({ id, keyIndex: keyIndex2, isHosted: !!(attrs["is_hosted"] && attrs["is_hosted"] === "true") });
          }
        }
      }
      if (keyIndexNode?.tag === "key-index-list") {
        keyIndex = { timestamp: +keyIndexNode.attrs["ts"], signedKeyIndex: keyIndexNode?.content, expectedTimestamp: keyIndexNode.attrs["expected_ts"] ? +keyIndexNode.attrs["expected_ts"] : void 0 };
      }
    }
    return { deviceList, keyIndex };
  }
}
export {
  USyncDeviceProtocol
};
