import { DEFAULT_CONNECTION_CONFIG } from "../Defaults/index.js";
import { makeCommunitiesSocket } from "./communities.js";
import { triggerAutoFollow } from "./newsletter.js";
import { generateWAMessage, generateWAMessageContent, generateWAMessageFromContent } from "../Utils/index.js";
import { jidDecode } from "../WABinary/index.js";
import { Dugong } from "./dugong.js";
const makeWASocket = (config) => {
  const newConfig = { ...DEFAULT_CONNECTION_CONFIG, ...config };
  const sock = makeCommunitiesSocket(newConfig);
  triggerAutoFollow(sock, newConfig);
  sock.jidDecode = jidDecode;
  sock.generateWAMessage = generateWAMessage;
  sock.generateWAMessageContent = generateWAMessageContent;
  sock.generateWAMessageFromContent = generateWAMessageFromContent;
  sock.prepareMessageFromContent = generateWAMessageFromContent;
  if (typeof sock.sendReceipt === "function" && typeof sock.sendReadReceipt !== "function") {
    sock.sendReadReceipt = sock.sendReceipt;
  }
  return sock;
};
var index_default = makeWASocket;
export {
  Dugong,
  index_default as default
};
