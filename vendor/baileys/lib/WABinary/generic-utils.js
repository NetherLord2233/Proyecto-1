import { Boom } from "@hapi/boom";
import { randomBytes } from "crypto";
import { proto } from "../../WAProto/index.js";
const indexCache = new WeakMap();
const getBinaryNodeChildren = (node, childTag) => {
  if (!node || !Array.isArray(node.content)) return [];
  let index = indexCache.get(node);
  if (!index) {
    index = new Map();
    for (const child of node.content) {
      let arr = index.get(child.tag);
      if (!arr) index.set(child.tag, arr = []);
      arr.push(child);
    }
    indexCache.set(node, index);
  }
  return index.get(childTag) || [];
};
const getBinaryNodeChild = (node, childTag) => {
  return getBinaryNodeChildren(node, childTag)[0];
};
const getAllBinaryNodeChildren = ({ content }) => {
  if (Array.isArray(content)) {
    return content;
  }
  return [];
};
const getBinaryNodeChildBuffer = (node, childTag) => {
  const child = getBinaryNodeChild(node, childTag)?.content;
  if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
    return child;
  }
};
const getBinaryNodeChildString = (node, childTag) => {
  const child = getBinaryNodeChild(node, childTag)?.content;
  if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
    return Buffer.from(child).toString("utf-8");
  } else if (typeof child === "string") {
    return child;
  }
};
const getBinaryNodeChildUInt = (node, childTag, length) => {
  const buff = getBinaryNodeChildBuffer(node, childTag);
  if (buff) {
    return bufferToUInt(buff, length);
  }
};
const assertNodeErrorFree = (node) => {
  const errNode = getBinaryNodeChild(node, "error");
  if (errNode) {
    throw new Boom(errNode.attrs.text || "Unknown error", { data: +errNode.attrs.code });
  }
};
const reduceBinaryNodeToDictionary = (node, tag) => {
  const nodes = getBinaryNodeChildren(node, tag);
  const dict = nodes.reduce((dict2, { attrs }) => {
    if (typeof attrs.name === "string") {
      dict2[attrs.name] = attrs.value || attrs.config_value;
    } else {
      dict2[attrs.config_code] = attrs.value || attrs.config_value;
    }
    return dict2;
  }, {});
  return dict;
};
const getBinaryNodeMessages = ({ content }) => {
  const msgs = [];
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.tag === "message") {
        msgs.push(proto.WebMessageInfo.decode(item.content).toJSON());
      }
    }
  }
  return msgs;
};
function bufferToUInt(e, t) {
  let a = 0;
  for (let i = 0; i < t; i++) {
    a = 256 * a + e[i];
  }
  return a;
}
const tabs = (n) => "	".repeat(n);
function binaryNodeToString(node, i = 0) {
  if (!node) {
    return node;
  }
  if (typeof node === "string") {
    return tabs(i) + node;
  }
  if (node instanceof Uint8Array) {
    return tabs(i) + Buffer.from(node).toString("hex");
  }
  if (Array.isArray(node)) {
    return node.map((x) => tabs(i + 1) + binaryNodeToString(x, i + 1)).join("\n");
  }
  const children = binaryNodeToString(node.content, i + 1);
  const tag = `<${node.tag} ${Object.entries(node.attrs || {}).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}='${v}'`).join(" ")}`;
  const content = children ? `>
${children}
${tabs(i)}</${node.tag}>` : "/>";
  return tag + content;
}
const FLOWS_MAP = { mpm: true, catalog_message: true, send_location: true, call_permission_request: true, wa_payment_transaction_details: true, automated_greeting_message_view_catalog: true, card_message: true, order_status: true, track_order: true, reorder: true, cancel_order: true, clear_chat: true, navigateToScreen: true, payment_status: true, payment_method: true, flow_action: true, voice_call: true, video_call_button: true, otp_button: true, authentication_button: true, cta_reminder: true, cta_cancel_reminder: true };
const DECISION_SOURCE_CONTENT = [{ tag: "decision_source", attrs: { value: "df" } }];
const LIST_TYPE_CONTENT = { tag: "list", attrs: { v: "2", type: "product_list" } };
const NATIVE_FLOW_ATTRIBUTE = { type: "native_flow", v: "1" };
const MIXED_NATIVE_FLOW = { tag: "interactive", attrs: NATIVE_FLOW_ATTRIBUTE, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] };
const getBizBinaryNode = (message) => {
  const flowMsg = message.interactiveMessage?.nativeFlowMessage;
  const firstButtonName = flowMsg?.buttons?.[0]?.name;
  const qualityContent = { tag: "quality_control", attrs: { decision_id: randomBytes(20).toString("hex"), source_type: "third_party" }, content: DECISION_SOURCE_CONTENT };
  const bizAttributes = { actual_actors: "2", host_storage: "2", privacy_mode_ts: `${Date.now() / 1e3 | 0}` };
  const ORDER_RESPONSE_ALIAS = { review_and_pay: "order_details", review_order: "order_status", payment_info: "payment_info", payment_status: "payment_status", payment_method: "payment_method", order_details: "order_details", order_status: "order_status", track_order: "track_order", reorder: "reorder", cancel_order: "cancel_order" };
  if (firstButtonName && ORDER_RESPONSE_ALIAS[firstButtonName]) {
    bizAttributes.native_flow_name = ORDER_RESPONSE_ALIAS[firstButtonName];
    return { tag: "biz", attrs: bizAttributes, content: [qualityContent] };
  }
  if (firstButtonName && FLOWS_MAP[firstButtonName]) {
    return { tag: "biz", attrs: bizAttributes, content: [{ tag: "interactive", attrs: NATIVE_FLOW_ATTRIBUTE, content: [{ tag: "native_flow", attrs: { v: "2", name: firstButtonName } }] }, qualityContent] };
  }
  if (flowMsg || message.buttonsMessage || message.templateMessage) {
    return { tag: "biz", attrs: bizAttributes, content: [MIXED_NATIVE_FLOW, qualityContent] };
  }
  if (message.listMessage) {
    return { tag: "biz", attrs: bizAttributes, content: [LIST_TYPE_CONTENT, qualityContent] };
  }
  return { tag: "biz", attrs: bizAttributes, content: [qualityContent] };
};
export {
  assertNodeErrorFree,
  binaryNodeToString,
  getAllBinaryNodeChildren,
  getBinaryNodeChild,
  getBinaryNodeChildBuffer,
  getBinaryNodeChildString,
  getBinaryNodeChildUInt,
  getBinaryNodeChildren,
  getBinaryNodeMessages,
  getBizBinaryNode,
  reduceBinaryNodeToDictionary
};
