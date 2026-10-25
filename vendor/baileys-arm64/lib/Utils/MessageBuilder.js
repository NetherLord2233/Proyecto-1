const MESSAGE_BUILDER_VERSION = "4.9.1";
import { generateWAMessageFromContent, prepareWAMessageMedia } from "./messages.js";
import { generateMessageIDV2 } from "./generics.js";
import { botMetadataSignature, botMetadataCertificate } from "./rich-message-utils.js";
import crypto from "crypto";
import { PassThrough, Readable } from "stream";
let _sharp;
const getSharp = async () => {
  if (_sharp === void 0) {
    _sharp = await import("sharp").then((m) => m.default ?? m).catch(() => null);
  }
  if (!_sharp) throw new Error("sharp is required for this operation. Install it with: npm i sharp");
  return _sharp;
};
let _ffmpeg;
const getFfmpeg = async () => {
  if (_ffmpeg === void 0) {
    _ffmpeg = await import("fluent-ffmpeg").then((m) => m.default ?? m).catch(() => null);
  }
  if (!_ffmpeg) throw new Error("fluent-ffmpeg is required for this operation. Install it with: npm i fluent-ffmpeg");
  return _ffmpeg;
};
function extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
  if (!extract) {
    return { text, ie: [], inline_entities: [] };
  }
  const createIE = (type, ie2) => {
    if (type == "hyperlink") {
      return { key: ie2.key, metadata: { display_name: ie2.text, is_trusted: ie2.is_trusted, url: ie2.url, __typename: "GenAIInlineLinkItem" } };
    }
    if (type == "citation") {
      return { key: ie2.key, metadata: { reference_id: ie2.reference_id, reference_url: ie2.url, reference_title: ie2.url, reference_display_name: ie2.url, sources: [], __typename: "GenAISearchCitationItem" } };
    }
    if (type == "latex") {
      return { key: ie2.key, metadata: { latex_expression: ie2.text, latex_image: { url: ie2.url, width: Number(ie2.width) || 100, height: Number(ie2.height) || 100 }, font_height: Number(ie2.font_height) || 83.333333333333, padding: Number(ie2.padding) || 15, __typename: "GenAILatexItem" } };
    }
  };
  let ie = [];
  let inline_entities = [];
  let result = "";
  let last = 0;
  let citation_index = 1;
  let hyperlink_index = 0;
  let latex_index = 0;
  let stack = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] == "[" && text[i - 1] != "\\") {
      stack.push(i);
    } else if (text[i] == "]" && (text[i + 1] == "(" || text[i + 1] == "<")) {
      let start = stack.pop();
      if (start == null) continue;
      let open = text[i + 1];
      let close = open == "(" ? ")" : ">";
      let type = open == "(" ? "link" : "latex";
      let end = i + 2;
      let depth = 1;
      while (end < text.length && depth) {
        if (text[end] == open && text[end - 1] != "\\") depth++;
        else if (text[end] == close && text[end - 1] != "\\") depth--;
        end++;
      }
      if (depth) continue;
      let raw = text.slice(start + 1, i).trim();
      let url = text.slice(i + 2, end - 1).trim();
      let key;
      let tag;
      let data;
      if (type == "latex") {
        if (!latex) continue;
        let [txt = "", width = null, height = null, font_height = null, padding = null] = raw.split("|");
        key = `NIXEL_LATEX_${latex_index++}`;
        tag = `{{${key}}}${txt || "image"}{{/${key}}}`;
        data = { type: "latex", ie: { key, text: txt, url, width, height, font_height, padding } };
      } else if (raw) {
        if (!hyperlink) continue;
        const trusted = !url.startsWith("!");
        if (!trusted) {
          url = url.slice(1);
        }
        key = `NIXEL_HYPERLINK_${hyperlink_index++}`;
        tag = `{{${key}}}${url}{{/${key}}}`;
        data = { type: "hyperlink", ie: { key, text: raw, url, is_trusted: trusted } };
      } else {
        if (!citation) continue;
        key = `NIXEL_CITATION_${citation_index - 1}`;
        tag = `{{${key}}}${url}{{/${key}}}`;
        data = { type: "citation", ie: { reference_id: citation_index++, key, text: "", url } };
      }
      result += text.slice(last, start) + tag;
      last = end;
      ie.push(data);
      const entity = createIE(data.type, data.ie);
      if (entity) {
        inline_entities.push(entity);
      }
      i = end - 1;
    }
  }
  result += text.slice(last);
  return { text: result, ie, inline_entities };
}
async function waitAllPromises(input) {
  const isPromise = (v) => v && typeof v.then === "function";
  const isObject = (v) => v && typeof v === "object";
  const deep = async (v) => {
    if (isPromise(v)) return deep(await v);
    if (Array.isArray(v)) return Promise.all(v.map(deep));
    if (isObject(v)) {
      const entries = await Promise.all(Object.entries(v).map(async ([k, val]) => [k, await deep(val)]));
      return Object.fromEntries(entries);
    }
    return v;
  };
  return deep(await input);
}
class Toolkit {
  constructor() {
  }
  static extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
    return extractIE(text, { extract, hyperlink, citation, latex });
  }
  static async resize(buffer, x, y, fit = "cover") {
    const sharp = await getSharp();
    return await sharp(buffer).resize(x, y, { fit, position: "center", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  static async waitAllPromises(input) {
    return await waitAllPromises(input);
  }
  static async fetchBuffer(url, options = {}, { silent = true, timeout = 15e3 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let response = await fetch(url, { ...options, signal: options.signal ?? controller.signal });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (silent) return Buffer.alloc(0);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  static async toUrl(_client, path, mediaType = "document") {
    if (!path) throw new Error("Url or buffer needed");
    const media = await prepareWAMessageMedia({ [mediaType]: Buffer.isBuffer(path) ? path : { url: path } }, { upload: _client.waUploadToServer, jid: "@newsletter" });
    return Object.values(media)[0]?.url;
  }
  static async resolveMedia(_client, media, mediaType = "image", { resolveUrl = false, resolveWAUrl = false, result = "url", resize = false, width = 300, height = 300 } = {}) {
    const isUrl = (str) => /^https?:\/\/.+/i.test(str);
    const isWAUrl = (str) => /^https?:\/\/[^/]*\.whatsapp\.net\//i.test(str);
    if (Array.isArray(media)) {
      return Promise.all(media.map((item) => Toolkit.resolveMedia(_client, item, mediaType, { resolveUrl, resolveWAUrl, result, resize, width, height })));
    }
    const rawUrlFallback = typeof media === "string" && isUrl(media) ? media : void 0;
    if (typeof media === "string" && isUrl(media)) {
      if (isWAUrl(media)) {
        if (resolveWAUrl) {
          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        } else if (!resolveUrl) {
          if (result === "url") return media;
          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        }
      } else {
        if (!resolveUrl) {
          if (result === "url") return media;
          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        } else {
          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        }
      }
    }
    if (typeof media === "string" && !isUrl(media)) {
      media = Buffer.from(media, "base64");
    }
    if (!Buffer.isBuffer(media) || !media.length) {
      return;
    }
    if (resize && Buffer.isBuffer(media)) {
      media = await Toolkit.resize(media, width, height);
    }
    if (result === "buffer") {
      return media;
    }
    if (result === "base64") {
      return media.toString("base64");
    }
    try {
      return await Toolkit.toUrl(_client, media, mediaType);
    } catch (err) {
      if (rawUrlFallback) return rawUrlFallback;
      throw err;
    }
  }
  static getMp4Duration(buffer, { silent = true } = {}) {
    try {
      if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
        if (silent) return 0;
        throw new Error("Invalid buffer");
      }
      let offset = 0;
      while (offset < buffer.length - 8) {
        const size = buffer.readUInt32BE(offset);
        if (size < 8 || offset + size > buffer.length) {
          if (silent) return 0;
          throw new Error("Invalid atom size");
        }
        const type = buffer.toString("ascii", offset + 4, offset + 8);
        if (type === "moov") {
          let moovOffset = offset + 8;
          const moovEnd = offset + size;
          while (moovOffset < moovEnd - 8) {
            const childSize = buffer.readUInt32BE(moovOffset);
            if (childSize < 8 || moovOffset + childSize > moovEnd) {
              if (silent) return 0;
              throw new Error("Invalid child atom size");
            }
            const childType = buffer.toString("ascii", moovOffset + 4, moovOffset + 8);
            if (childType === "mvhd") {
              const version = buffer.readUInt8(moovOffset + 8);
              if (version === 0) {
                const timescale = buffer.readUInt32BE(moovOffset + 20);
                const duration = buffer.readUInt32BE(moovOffset + 24);
                if (!timescale) {
                  if (silent) return 0;
                  throw new Error("Invalid timescale");
                }
                return duration / timescale;
              }
              if (version === 1) {
                const timescale = buffer.readUInt32BE(moovOffset + 32);
                const duration = Number(buffer.readBigUInt64BE(moovOffset + 36));
                if (!timescale) {
                  if (silent) return 0;
                  throw new Error("Invalid timescale");
                }
                return duration / timescale;
              }
            }
            moovOffset += childSize;
          }
        }
        offset += size;
      }
      if (silent) return 0;
      throw new Error("No mvhd found!");
    } catch (err) {
      if (silent) return 0;
      throw err;
    }
  }
  static getMp4Preview(videoBuffer, { time, result = "buffer", resize = true, width = 300, height = 300, silent = true } = {}) {
    return new Promise((resolve, reject) => {
      const fail = (err) => {
        if (silent) {
          return resolve(result === "base64" ? "" : Buffer.alloc(0));
        }
        return reject(err);
      };
      try {
        if (!Buffer.isBuffer(videoBuffer) || !videoBuffer.length) {
          return fail(new Error("videoBuffer tidak valid atau kosong"));
        }
        const inputStream = new Readable({ read() {
        } });
        inputStream.push(videoBuffer);
        inputStream.push(null);
        const outputStream = new PassThrough();
        const chunks = [];
        outputStream.on("data", (chunk) => chunks.push(chunk));
        outputStream.on("end", async () => {
          try {
            let output = Buffer.concat(chunks);
            if (!output.length) {
              return fail(new Error("Output kosong — cek format atau timestamp video"));
            }
            if (resize) {
              output = await Toolkit.resize(output, width, height);
            }
            return resolve(result === "base64" ? output.toString("base64") : output);
          } catch (err) {
            return fail(err);
          }
        });
        outputStream.on("error", fail);
        time ??= Math.min(Toolkit.getMp4Duration(videoBuffer) * 0.2, 10);
        getFfmpeg().then((ffmpeg) => {
          ffmpeg(inputStream).outputOptions([`-ss ${time}`, "-vframes 1", "-vcodec png", "-f image2pipe"]).on("error", (err) => fail(new Error(`ffmpeg error: ${err.message}`))).pipe(outputStream, { end: true });
        }).catch(fail);
      } catch (err) {
        return fail(err);
      }
    });
  }
}
class BaseBuilder {
  constructor() {
    this._title = "";
    this._subtitle = "";
    this._body = "";
    this._footer = "";
    this._contextInfo = {};
    this._extraPayload = {};
  }
  setTitle(title) {
    if (typeof title !== "string") {
      throw new TypeError("Title must be a string");
    }
    this._title = title;
    return this;
  }
  setSubtitle(subtitle) {
    if (typeof subtitle !== "string") {
      throw new TypeError("Subtitle must be a string");
    }
    this._subtitle = subtitle;
    return this;
  }
  setBody(body) {
    if (typeof body !== "string") {
      throw new TypeError("Body must be a string");
    }
    this._body = body;
    return this;
  }
  setFooter(footer) {
    if (typeof footer !== "string") {
      throw new TypeError("Footer must be a string");
    }
    this._footer = footer;
    return this;
  }
  setContextInfo(obj) {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new TypeError("ContextInfo must be a plain object");
    }
    this._contextInfo = obj;
    return this;
  }
  addPayload(obj) {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new TypeError("Payload must be a plain object");
    }
    Object.assign(this._extraPayload, obj);
    return this;
  }
}
class Button extends BaseBuilder {
  #client;
  constructor(client) {
    super();
    if (!client) {
      throw new Error("Socket is required");
    }
    this.#client = client;
    this._buttons = [];
    this._data;
    this._currentSelectionIndex = -1;
    this._currentSectionIndex = -1;
    this._params = {};
    this._bloksWidget = null;
  }
  setVideo(path, options = {}) {
    if (!path) throw new Error("Url or buffer needed");
    Buffer.isBuffer(path) ? this._data = { video: path, ...options } : this._data = { video: { url: path }, ...options };
    return this;
  }
  setImage(path, options = {}) {
    if (!path) throw new Error("Url or buffer needed");
    Buffer.isBuffer(path) ? this._data = { image: path, ...options } : this._data = { image: { url: path }, ...options };
    return this;
  }
  setDocument(path, options = {}) {
    if (!path) throw new Error("Url or buffer needed");
    Buffer.isBuffer(path) ? this._data = { document: path, ...options } : this._data = { document: { url: path }, ...options };
    return this;
  }
  setMedia(obj) {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new TypeError("Media must be a plain object");
    }
    this._data = obj;
    return this;
  }
  clearButtons() {
    this._buttons = [];
    return this;
  }
  setParams(obj) {
    this._params = obj;
    return this;
  }
  addButton(name, params) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("addButton(name, params) requires a non-empty string name");
    }
    this._buttons.push({ name, buttonParamsJson: typeof params === "string" ? params : JSON.stringify(params) });
    return this;
  }
  makeRow(header = "", title = "", description = "", id = "") {
    if (this._currentSelectionIndex === -1 || this._currentSectionIndex === -1) {
      throw new Error("You need to create a selection and a section first");
    }
    if (!title || !id) {
      throw new TypeError("makeRow() requires both a title and an id");
    }
    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
    buttonParams.sections[this._currentSectionIndex].rows.push({ header, title, description, id });
    this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
    return this;
  }
  makeSection(title = "", highlight_label = "") {
    if (this._currentSelectionIndex === -1) {
      throw new Error("You need to create a selection first");
    }
    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
    buttonParams.sections.push({ title, highlight_label, rows: [] });
    this._currentSectionIndex = buttonParams.sections.length - 1;
    this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
    return this;
  }
  addSelection(title, options = {}) {
    if (!title) throw new TypeError("addSelection(title) requires a non-empty title");
    this._buttons.push({ ...options, name: "single_select", buttonParamsJson: JSON.stringify({ title, sections: [] }) });
    this._currentSelectionIndex = this._buttons.length - 1;
    this._currentSectionIndex = -1;
    return this;
  }
  addReply(display_text = "", id = "", options = {}) {
    if (!display_text || !id) {
      throw new TypeError("addReply(display_text, id) requires both a label and a unique id");
    }
    this._buttons.push({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text, id, ...options }) });
    return this;
  }
  addCall(display_text = "", phone_number = "", options = {}) {
    if (!display_text || !phone_number) {
      throw new TypeError("addCall(display_text, phone_number) requires both a label and a phone number");
    }
    this._buttons.push({ name: "cta_call", buttonParamsJson: JSON.stringify({ display_text, phone_number, ...options }) });
    return this;
  }
  addReminder(display_text = "", id = "", options = {}) {
    if (!display_text || !id) {
      throw new TypeError("addReminder(display_text, id) requires both a label and a unique id");
    }
    this._buttons.push({ name: "cta_reminder", buttonParamsJson: JSON.stringify({ display_text, id, ...options }) });
    return this;
  }
  addCancelReminder(display_text = "", id = "", options = {}) {
    if (!display_text || !id) {
      throw new TypeError("addCancelReminder(display_text, id) requires both a label and a unique id");
    }
    this._buttons.push({ name: "cta_cancel_reminder", buttonParamsJson: JSON.stringify({ display_text, id, ...options }) });
    return this;
  }
  addAddress(display_text = "", id = "", options = {}) {
    if (!display_text || !id) {
      throw new TypeError("addAddress(display_text, id) requires both a label and a unique id");
    }
    this._buttons.push({ name: "address_message", buttonParamsJson: JSON.stringify({ display_text, id, ...options }) });
    return this;
  }
  addLocation(options = {}) {
    this._buttons.push({ name: "send_location", buttonParamsJson: JSON.stringify(options) });
    return this;
  }
  addUrl(display_text = "", url = "", webview_interaction = false, options = {}) {
    if (!display_text || !url) {
      throw new TypeError("addUrl(display_text, url) requires both a label and a url");
    }
    this._buttons.push({ ...options, name: "cta_url", buttonParamsJson: JSON.stringify({ display_text, url, merchant_url: url, webview_interaction, ...options }) });
    return this;
  }
  addCopy(display_text = "", copy_code = "", options = {}) {
    if (!display_text || !copy_code) {
      throw new TypeError("addCopy(display_text, copy_code) requires both a label and the text to copy");
    }
    this._buttons.push({ name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text, copy_code, ...options }) });
    return this;
  }
  addOpenWebview(title = "", url = "", options = {}) {
    if (!title || !url) {
      throw new TypeError("addOpenWebview(title, url) requires both a title and a url");
    }
    this._buttons.push({ name: "open_webview", buttonParamsJson: JSON.stringify({ title, link: { url }, ...options }) });
    return this;
  }
  addCatalog(display_text = "", options = {}) {
    this._buttons.push({ name: "cta_catalog", buttonParamsJson: JSON.stringify({ ...display_text ? { display_text } : {}, ...options }) });
    return this;
  }
  addViewCatalog(options = {}) {
    this._buttons.push({ name: "automated_greeting_message_view_catalog", buttonParamsJson: JSON.stringify(options) });
    return this;
  }
  addCallPermission(display_text = "", options = {}) {
    this._buttons.push({ name: "call_permission_request", buttonParamsJson: JSON.stringify({ ...display_text ? { display_text } : {}, ...options }) });
    return this;
  }
  addPaymentInfo(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new TypeError("addPaymentInfo(payload) requires a plain object");
    }
    this._buttons.push({ name: "payment_info", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addReviewAndPay(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new TypeError("addReviewAndPay(payload) requires a plain object");
    }
    this._buttons.push({ name: "review_and_pay", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addTransactionDetails(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new TypeError("addTransactionDetails(payload) requires a plain object");
    }
    this._buttons.push({ name: "wa_payment_transaction_details", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addMultiProduct(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new TypeError("addMultiProduct(payload) requires a plain object");
    }
    this._buttons.push({ name: "mpm", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addPaymentKeyInfo(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("addPaymentKeyInfo(payload) requires a plain object");
    this._buttons.push({ name: "payment_key_info", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addBookingConfirmation(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("addBookingConfirmation(payload) requires a plain object");
    this._buttons.push({ name: "booking_confirmation", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addCardMessage(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("addCardMessage(payload) requires a plain object");
    this._buttons.push({ name: "card_message", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addOrderDetails(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("addOrderDetails(payload) requires a plain object");
    this._buttons.push({ name: "order_details", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addOrderStatus(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("addOrderStatus(payload) requires a plain object");
    this._buttons.push({ name: "order_status", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addPaymentStatus(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("addPaymentStatus(payload) requires a plain object");
    this._buttons.push({ name: "payment_status", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addPaymentMethod(payload = {}) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("addPaymentMethod(payload) requires a plain object");
    this._buttons.push({ name: "payment_method", buttonParamsJson: JSON.stringify(payload) });
    return this;
  }
  addTrackOrder(id, display_text = "\u{1F69A} Track order") {
    if (!id) throw new TypeError("addTrackOrder(id) requires a non-empty id");
    this._buttons.push({ name: "track_order", buttonParamsJson: JSON.stringify({ id, display_text }) });
    return this;
  }
  addReorder(id, display_text = "\u{1F501} Reorder") {
    if (!id) throw new TypeError("addReorder(id) requires a non-empty id");
    this._buttons.push({ name: "reorder", buttonParamsJson: JSON.stringify({ id, display_text }) });
    return this;
  }
  addCancelOrder(id, display_text = "\u274C Cancel order") {
    if (!id) throw new TypeError("addCancelOrder(id) requires a non-empty id");
    this._buttons.push({ name: "cancel_order", buttonParamsJson: JSON.stringify({ id, display_text }) });
    return this;
  }
  addClearChat() {
    this._buttons.push({ name: "clear_chat", buttonParamsJson: "{}" });
    return this;
  }
  addNavigateToScreen(screen, data = {}) {
    if (!screen) throw new TypeError("addNavigateToScreen(screen) requires a non-empty screen");
    this._buttons.push({ name: "navigateToScreen", buttonParamsJson: JSON.stringify({ screen_name: screen, data }) });
    return this;
  }
  addFlow(flow = {}, display_text = "") {
    if (typeof flow !== "object" || flow === null || Array.isArray(flow) || !flow.id) throw new TypeError("addFlow(flow) requires a plain object with flow.id");
    this._buttons.push({ name: "flow_action", buttonParamsJson: JSON.stringify({ flow_message_version: flow.version || "3", flow_id: flow.id, flow_cta: display_text || flow.cta || "Continue", flow_action: flow.action || "navigate", flow_action_payload: flow.actionPayload || { screen: flow.screen || "WELCOME", data: flow.data || {} } }) });
    return this;
  }
  addVoiceCall(id, display_text = "\u{1F4DE} Voice call") {
    if (!id) throw new TypeError("addVoiceCall(id) requires a non-empty id");
    this._buttons.push({ name: "voice_call", buttonParamsJson: JSON.stringify({ display_text, id }) });
    return this;
  }
  addVideoCall(id, display_text = "\u{1F3A5} Video call") {
    if (!id) throw new TypeError("addVideoCall(id) requires a non-empty id");
    this._buttons.push({ name: "video_call_button", buttonParamsJson: JSON.stringify({ display_text, id }) });
    return this;
  }
  #flattenBloks(tree, out, ctx = { n: 0, refs: /* @__PURE__ */ new Map(), pending: [] }, id = "root") {
    if (!tree || typeof tree !== "object") throw new TypeError('setBloksWidget: every node needs a "component" type');
    const { component, children, child, ref, ...rest } = tree;
    if (typeof component !== "string" || !component) throw new TypeError('setBloksWidget: every node needs a "component" type');
    const isTreeNode = (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.component === "string";
    const isRefMarker = (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.$ref === "string" && Object.keys(v).length === 1;
    const node = { id, component };
    for (const [k, v] of Object.entries(rest)) {
      if (isRefMarker(v)) {
        node[k] = null;
        ctx.pending.push({ node, key: k, refName: v.$ref });
      } else if (isTreeNode(v)) {
        node[k] = this.#flattenBloks(v, out, ctx, `n${ctx.n++}`);
      } else {
        node[k] = v;
      }
    }
    if (Array.isArray(children)) {
      node.children = children.map((c) => this.#flattenBloks(c, out, ctx, `n${ctx.n++}`));
    } else if (child) {
      node.child = this.#flattenBloks(child, out, ctx, `n${ctx.n++}`);
    }
    if (ref) ctx.refs.set(ref, id);
    out.push(node);
    return id;
  }
  setBloksWidget(tree, { uuid = crypto.randomUUID(), catalogId = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json", surfaceId, version = "v0.9" } = {}) {
    const components = [];
    const ctx = { n: 0, refs: /* @__PURE__ */ new Map(), pending: [] };
    this.#flattenBloks(tree, components, ctx);
    for (const { node, key, refName } of ctx.pending) {
      const resolved = ctx.refs.get(refName);
      if (!resolved) throw new Error(`setBloksWidget: ref "${refName}" (used on "${key}") was never declared with ref: "${refName}" on any node`);
      node[key] = resolved;
    }
    this._bloksWidget = { uuid, data: JSON.stringify({ version, createSurface: { surfaceId: surfaceId ?? `starcore-widget=${uuid}`, catalogId, components } }), type: "im_a2ui" };
    return this;
  }
  static #validateAgainstSchema(schema, data, label) {
    for (const [key, type] of Object.entries(schema)) {
      if (data[key] === void 0) continue;
      const expectsArray = Array.isArray(type);
      if (expectsArray) {
        if (!Array.isArray(data[key]) || !data[key].every((v) => typeof v === type[0])) {
          throw new TypeError(`${label}.${key} must be an array of ${type[0]}`);
        }
      } else if (typeof data[key] !== type) {
        throw new TypeError(`${label}.${key} must be a ${type}`);
      }
    }
  }
  setLimitedTimeOffer({ text = "", url = "", copy_code = "", expiration_time } = {}) {
    const data = { text, url, copy_code, expiration_time };
    Button.#validateAgainstSchema(Button.paramsList.limited_time_offer, data, "limited_time_offer");
    this._params = { ...this._params, limited_time_offer: data };
    return this;
  }
  setBottomSheet({ in_thread_buttons_limit, divider_indices = [], list_title = "", button_title = "" } = {}) {
    const data = { in_thread_buttons_limit, divider_indices, list_title, button_title };
    Button.#validateAgainstSchema(Button.paramsList.bottom_sheet, data, "bottom_sheet");
    this._params = { ...this._params, bottom_sheet: data };
    return this;
  }
  setTapTargetConfiguration({ title = "", description = "", canonical_url = "", domain = "", buttonIndex = 0 } = {}) {
    const data = { title, description, canonical_url, domain, buttonIndex };
    Button.#validateAgainstSchema(Button.paramsList.tap_target_configuration, data, "tap_target_configuration");
    this._params = { ...this._params, tap_target_configuration: data };
    return this;
  }
  static paramsList = { limited_time_offer: { text: "string", url: "string", copy_code: "string", expiration_time: "number" }, bottom_sheet: { in_thread_buttons_limit: "number", divider_indices: ["number"], list_title: "string", button_title: "string" }, tap_target_configuration: { title: "string", description: "string", canonical_url: "string", domain: "string", buttonIndex: "number" } };
  static #SPECIAL_FLOW = { review_and_pay: { v: "1", name: "order_details" }, payment_info: { v: "1", name: "payment_info" }, mpm: { v: "2", name: "mpm" }, cta_catalog: { v: "2", name: "cta_catalog" }, send_location: { v: "2", name: "send_location" }, call_permission_request: { v: "2", name: "call_permission_request" }, wa_payment_transaction_details: { v: "2", name: "wa_payment_transaction_details" }, automated_greeting_message_view_catalog: { v: "2", name: "automated_greeting_message_view_catalog" }, payment_key_info: { v: "1", name: "payment_key_info" }, booking_confirmation: { v: "1", name: "booking_confirmation" } };
  async toCard() {
    return { body: { text: this._body }, footer: { text: this._footer }, header: { title: this._title, subtitle: this._subtitle, hasMediaAttachment: !!this._data, ...this._data ? await prepareWAMessageMedia(this._data, { upload: this.#client.waUploadToServer }).catch((e) => {
      if (String(e).includes("Invalid media type")) return this._data;
      throw e;
    }) : {} }, nativeFlowMessage: { messageParamsJson: JSON.stringify(this._params), buttons: this._buttons } };
  }
  #isLoneSingleSelect() {
    return this._buttons.length === 1 && this._buttons[0].name === "single_select";
  }
  #toListMessage() {
    const { title: buttonText, sections } = JSON.parse(this._buttons[0].buttonParamsJson);
    return { listMessage: { title: this._title || void 0, description: this._body || void 0, footerText: this._footer || void 0, buttonText: buttonText || void 0, listType: 1, sections: (sections || []).map((s) => ({ title: s.title, rows: (s.rows || []).map((r) => ({ title: r.title || r.header || "", description: r.description || "", rowId: r.id || "" })) })), contextInfo: this._contextInfo } };
  }
  async build(jid, { ...options } = {}) {
    if (this._buttons.length === 0 && !this._bloksWidget) {
      throw new Error("Button requires at least one button (use addReply/addUrl/addCall/addSelection/addButton/...) or a Bloks widget (setBloksWidget())");
    }
    if (this._buttons.length > 0 && this.#isLoneSingleSelect()) {
      return generateWAMessageFromContent(jid, { ...this._extraPayload, ...this.#toListMessage() }, { ...options });
    }
    const message = this._buttons.length > 0 ? await this.toCard() : {};
    return generateWAMessageFromContent(jid, { ...this._extraPayload, ...this._bloksWidget && { messageContextInfo: { messageSecret: crypto.randomBytes(32) } }, interactiveMessage: { ...message, ...this._bloksWidget && { bloksWidget: this._bloksWidget }, contextInfo: this._contextInfo } }, { ...options });
  }
  #buildNativeFlowNode() {
    const special = Button.#SPECIAL_FLOW[this._buttons[0]?.name];
    return special ? { tag: "native_flow", attrs: special } : { tag: "native_flow", attrs: { v: "9", name: "mixed" } };
  }
  async sendEdit(jid, messageId, { ...options } = {}) {
    if (!messageId) throw new Error("messageId is required");
    const msg = await this.build(jid, options);
    msg.key = { ...msg.key || {}, remoteJid: jid, id: messageId, fromMe: true };
    await this.#client.relayMessage(jid, msg.message, { messageId, ...options });
    return msg;
  }
  async send(jid, { ...options } = {}) {
    const msg = await this.build(jid, options);
    const bizContent = this.#isLoneSingleSelect() ? [{ tag: "list", attrs: { v: "2", type: "product_list" } }] : [
      ...this._buttons.length > 0 ? [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [this.#buildNativeFlowNode()] }] : [],
      ...this._bloksWidget ? [{ tag: "quality_control", attrs: { decision_id: crypto.randomUUID().replace(/-/g, ""), source_type: "third_party" }, content: [{ tag: "decision_source", attrs: { value: "df" } }] }] : []
    ];
    await this.#client.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id, additionalNodes: [{ tag: "biz", attrs: {}, content: bizContent }], ...options });
    return msg;
  }
}
class ButtonV2 extends BaseBuilder {
  #client;
  constructor(client) {
    super();
    if (!client) {
      throw new Error("Socket is required");
    }
    this.#client = client;
    this._image;
    this._data;
    this._buttons = [];
  }
  addButton(displayText = "", buttonId = crypto.randomUUID()) {
    if (!displayText) throw new TypeError("addButton(displayText) requires a non-empty label");
    this._buttons.push({ buttonId, buttonText: { displayText }, type: 1 });
    return this;
  }
  addRawButton(obj) {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new TypeError("Buttons must be a plain object");
    }
    this._buttons.push(obj);
    return this;
  }
  setThumbnail(path) {
    if (!path) throw new Error("Url or buffer needed");
    this._image = path;
    return this;
  }
  setMedia(obj) {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new TypeError("Media must be a plain object");
    }
    this._data = obj;
    return this;
  }
  async build(jid, { viewOnce = true, ...options } = {}) {
    const _thumbnail = !this._data && this._image ? await Toolkit.resize(Buffer.isBuffer(this._image) ? this._image : await Toolkit.fetchBuffer(this._image, {}, { silent: true }), 300, 300) : null;
    const msg = generateWAMessageFromContent(jid, { ...this._extraPayload, buttonsMessage: { contentText: this._body, footerText: this._footer, ...this._data ? this._data : { headerType: 6, locationMessage: { degreesLatitude: 0, degreesLongitude: 0, name: this._title, address: this._subtitle, jpegThumbnail: _thumbnail } }, viewOnce, contextInfo: this._contextInfo, buttons: [...this._buttons] } }, { ...options });
    return msg;
  }
  async send(jid, { ...options } = {}) {
    if (this._buttons.length < 1) throw new Error("ButtonV2 requires at least one button");
    const msg = await this.build(jid, options);
    await this.#client.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id, additionalNodes: [{ tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] }], ...options });
    return msg;
  }
}
class Carousel extends BaseBuilder {
  #client;
  static MAX_CARDS = 10;
  constructor(client) {
    super();
    if (!client) {
      throw new Error("Socket is required");
    }
    this.#client = client;
    this._cards = [];
  }
  addCard(card) {
    const cards = Array.isArray(card) ? card : [card];
    const baseIndex = this._cards.length;
    for (const [index, c] of cards.entries()) {
      if (!c?.header?.hasMediaAttachment) {
        throw new Error(`Card [${baseIndex + index}] must include an image or video in header`);
      }
    }
    if (this._cards.length + cards.length > Carousel.MAX_CARDS) {
      throw new Error(`Carousel supports at most ${Carousel.MAX_CARDS} cards (got ${this._cards.length + cards.length})`);
    }
    this._cards.push(...cards);
    return this;
  }
  build(jid, { ...options } = {}) {
    return generateWAMessageFromContent(jid, { ...this._extraPayload, interactiveMessage: { header: { hasMediaAttachment: false }, body: { text: this._body }, footer: { text: this._footer }, contextInfo: this._contextInfo, carouselMessage: { cards: this._cards } } }, { ...options });
  }
  async send(jid, { ...options } = {}) {
    if (this._cards.length === 0) throw new Error("Carousel requires at least one card (use addCard())");
    const msg = this.build(jid, options);
    await this.#client.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id, additionalNodes: [{ tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] }], ...options });
    return msg;
  }
}
class Poll extends BaseBuilder {
  #client;
  constructor(client) {
    super();
    if (!client) throw new Error("Socket is required");
    this.#client = client;
    this._name = "";
    this._values = [];
    this._selectableCount = 1;
    this._hideVoter = false;
    this._canAddOption = false;
    this._toAnnouncementGroup = false;
    this._correctAnswer;
    this._endDate;
  }
  setName(name) {
    if (typeof name !== "string" || !name) throw new TypeError("setName(name) requires a non-empty string");
    this._name = name;
    return this;
  }
  addOption(name) {
    if (typeof name !== "string" || !name) throw new TypeError("addOption(name) requires a non-empty string");
    this._values.push(name);
    return this;
  }
  addOptions(names) {
    if (!Array.isArray(names) || !names.length) throw new TypeError("addOptions(names) requires a non-empty array of strings");
    names.forEach((name) => this.addOption(name));
    return this;
  }
  setSelectable(count) {
    if (typeof count !== "number" || count < 0) throw new TypeError("setSelectable(count) requires a non-negative number");
    this._selectableCount = count;
    return this;
  }
  setMultiSelect(canSelectMultiple = true) {
    this._selectableCount = canSelectMultiple ? 0 : 1;
    return this;
  }
  setHideVoter(hide = true) {
    this._hideVoter = hide;
    return this;
  }
  setCanAddOption(allow = true) {
    this._canAddOption = allow;
    return this;
  }
  setAnnouncementGroup(isAnnouncement = true) {
    this._toAnnouncementGroup = isAnnouncement;
    return this;
  }
  setEndDate(date) {
    this._endDate = date instanceof Date ? date : new Date(date);
    return this;
  }
  setQuiz(correctOptionName) {
    if (typeof correctOptionName !== "string" || !correctOptionName) {
      throw new TypeError("setQuiz(correctOptionName) requires a non-empty string");
    }
    this._correctAnswer = correctOptionName;
    return this;
  }
  build() {
    if (!this._name) throw new Error("Poll requires a name (use setName())");
    if (this._values.length < 2) throw new Error("Poll requires at least 2 options (use addOption()/addOptions())");
    if (this._correctAnswer && !this._values.includes(this._correctAnswer)) {
      throw new Error("setQuiz(correctOptionName) must match one of the added options exactly");
    }
    return { poll: { name: this._name, values: this._values, selectableCount: this._selectableCount, toAnnouncementGroup: this._toAnnouncementGroup, hideVoter: this._hideVoter, canAddOption: this._canAddOption, ...this._endDate && { endDate: this._endDate }, ...this._correctAnswer && { pollType: 1, correctAnswer: this._correctAnswer } } };
  }
  async send(jid, options = {}) {
    return this.#client.sendMessage(jid, this.build(), options);
  }
}
class AIRich extends BaseBuilder {
  #client;
  constructor(client) {
    if (!client) {
      throw new Error("Socket is required");
    }
    super();
    this.#client = client;
    this._contextInfo = {};
    this._submessages = [];
    this._sections = [];
    this._richResponseSources = [];
    this._inlineImages = [];
    this._mediaFallbacks = [];
    this._blocks = new Map();
    this._responseId = null;
    this._botResponseId = null;
    this._lastMessageKey = null;
    return new Proxy(this, { get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== "function") return orig;
      if (!/^(add|set)/.test(String(prop))) {
        return (...args) => {
          const result = orig.apply(target, args);
          return result === target ? receiver : result;
        };
      }
      return (...args) => {
        const opts = args.find((a) => a && typeof a === "object" && !Array.isArray(a) && !Buffer.isBuffer(a) && ("id" in a || "insertAt" in a || "replace" in a));
        const id = opts?.id;
        const insertAt = opts?.insertAt;
        const replace = opts?.replace;
        const subBefore = target._submessages.length;
        const secBefore = target._sections.length;
        const result = orig.apply(target, args);
        const subItems = target._submessages.splice(subBefore);
        const secItems = target._sections.splice(secBefore);
        if (insertAt) {
          const anchor = target._blocks.get(insertAt);
          if (!anchor) throw new Error(`insertAt: no block registered with id "${insertAt}" (register it by passing { id: "${insertAt}" } on an earlier add*() call)`);
          const lastSub = anchor.subItems[anchor.subItems.length - 1];
          const subIdx = lastSub ? target._submessages.indexOf(lastSub) + 1 : target._submessages.length;
          target._submessages.splice(subIdx, 0, ...subItems);
          const lastSec = anchor.secItems[anchor.secItems.length - 1];
          const secIdx = lastSec ? target._sections.indexOf(lastSec) + 1 : target._sections.length;
          target._sections.splice(secIdx, 0, ...secItems);
        } else if (replace) {
          const old = target._blocks.get(replace);
          if (!old) throw new Error(`replace: no block registered with id "${replace}" (register it first with { id: "${replace}" })`);
          let subIdx = old.subItems.length > 0 ? target._submessages.indexOf(old.subItems[0]) : target._submessages.length;
          if (subIdx === -1) subIdx = target._submessages.length;
          for (const item of old.subItems) {
            const i = target._submessages.indexOf(item);
            if (i !== -1) target._submessages.splice(i, 1);
          }
          target._submessages.splice(subIdx, 0, ...subItems);
          let secIdx = old.secItems.length > 0 ? target._sections.indexOf(old.secItems[0]) : target._sections.length;
          if (secIdx === -1) secIdx = target._sections.length;
          for (const item of old.secItems) {
            const i = target._sections.indexOf(item);
            if (i !== -1) target._sections.splice(i, 1);
          }
          target._sections.splice(secIdx, 0, ...secItems);
          target._blocks.delete(replace);
          if (id) target._blocks.set(id, { subItems, secItems });
          else target._blocks.set(replace, { subItems, secItems });
        } else {
          target._submessages.push(...subItems);
          target._sections.push(...secItems);
        }
        if (id && !replace) target._blocks.set(id, { subItems, secItems });
        return result === target ? receiver : result;
      };
    } });
  }
  get items() {
    return this._sections.flatMap((s) => {
      const vm = s?.view_model;
      if (!vm) return [];
      return vm.primitives ?? (vm.primitive !== void 0 ? [vm.primitive] : []);
    });
  }
  addSubmessage(submessage) {
    const items = Array.isArray(submessage) ? submessage : [submessage];
    for (const item of items) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new TypeError("Submessage must be a plain object or array of plain objects");
      }
      this._submessages.push(item);
    }
    return this;
  }
  addSection(section) {
    const items = Array.isArray(section) ? section : [section];
    for (const item of items) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new TypeError("Section must be a plain object or array of plain objects");
      }
      this._sections.push(item);
    }
    return this;
  }
  addText(text, { hyperlink = true, citation = true, latex = true } = {}) {
    if (typeof text != "string") {
      throw new TypeError("Text must be a string");
    }
    const { text: extractedText, inline_entities } = extractIE(text, { hyperlink, citation, latex });
    this._submessages.push({ messageType: 2, messageText: extractedText });
    this._sections.push(AIRich.newLayout("Single", { text: extractedText, ...inline_entities.length && { inline_entities }, __typename: "GenAIMarkdownTextUXPrimitive" }));
    return this;
  }
  addCode(language, code) {
    if (typeof language !== "string" || typeof code !== "string") {
      throw new TypeError("Language and code must be a string");
    }
    const meta = AIRich.tokenizer(code, language);
    this._submessages.push({ messageType: 5, codeMetadata: { codeLanguage: language, codeBlocks: meta.codeBlock } });
    this._sections.push(AIRich.newLayout("Single", { language, code_blocks: meta.unified_codeBlock, __typename: "GenAICodeUXPrimitive" }));
    return this;
  }
  addTable(table, { hyperlink = true, citation = true, latex = true } = {}) {
    if (!Array.isArray(table)) {
      throw new TypeError("Table must be an array");
    }
    const meta = AIRich.toTableMetadata(table, { hyperlink, citation, latex });
    this._submessages.push({ messageType: 4, tableMetadata: { title: meta.title, rows: meta.rows } });
    this._sections.push(AIRich.newLayout("Single", { rows: meta.unified_rows, __typename: "GenATableUXPrimitive" }));
    return this;
  }
  addLinks(links = []) {
    if (!Array.isArray(links)) throw new TypeError("links must be an array");
    links.forEach((linkField, index) => {
      if (!linkField || typeof linkField !== "object") throw new TypeError("Each link must be an object");
      const prefix = "SS_" + index;
      const url = linkField.url || "";
      const text = String(linkField.text ?? "");
      const sources = Array.isArray(linkField.sources) ? linkField.sources.map((sourceField) => ({ source_type: "THIRD_PARTY", source_display_name: sourceField?.displayName || sourceField?.title || "Source", source_subtitle: sourceField?.subtitle || "", source_url: sourceField?.url || url })) : [];
      const entity = { key: prefix, metadata: { reference_id: index + 1, reference_url: url, reference_title: linkField.title || "Source", reference_display_name: linkField.displayName || linkField.title || "Source", sources, __typename: "GenAISearchCitationItem" } };
      const section = AIRich.newLayout("Single", { text: `${text} {{${prefix}}}${url}{{/${prefix}}}`, inline_entities: [entity], __typename: "GenAIMarkdownTextUXPrimitive" });
      this._sections.push(section);
      this._submessages.push({ messageType: 2, messageText: `${text} {{${prefix}}}\xB9{{/${prefix}}} `, inlineEntities: [entity] });
    });
    return this;
  }
  addContentItems(items = []) {
    if (!Array.isArray(items)) throw new TypeError("items must be an array");
    this._submessages.push({ messageType: 9, contentItemsMetadata: { itemsMetadata: items, contentType: 1 } });
    this._sections.push(AIRich.newLayout("Single", { items, content_type: 1, __typename: "GenAIContentItemsUXPrimitive" }));
    return this;
  }
  addInlineVideo() {
    this._submessages.push({ messageType: 2, messageText: "INLINE_VIDEO" });
    this._sections.push(AIRich.newLayout("Single", { text: "INLINE_VIDEO", __typename: "GenAIMarkdownTextUXPrimitive" }));
    return this;
  }
  addSource(sources = [], { resolveUrl = false } = {}) {
    const isObjArray = Array.isArray(sources) && sources.every((item) => item && typeof item === "object" && !Array.isArray(item));
    const isStrArrayArray = Array.isArray(sources) && sources.every((item) => Array.isArray(item) && item.every((v) => typeof v === "string"));
    const isFlatStrArray = Array.isArray(sources) && sources.every((item) => typeof item === "string");
    if (!isObjArray && !isStrArrayArray && !isFlatStrArray) {
      throw new TypeError("addSource(): pass an array of objects { icon, url, title, subtitle } or string arrays [iconUrl, url, text]");
    }
    let normalized;
    if (isObjArray) {
      normalized = sources.map((item) => ({ icon: item.icon ?? item.iconUrl ?? item.favicon ?? "", url: item.url ?? "", text: item.title ?? item.displayName ?? item.text ?? "", subtitle: item.subtitle ?? "AI" }));
    } else {
      const arr = isFlatStrArray ? [sources] : sources;
      normalized = arr.map(([icon = "", url = "", text = ""]) => ({ icon, url, text, subtitle: "AI" }));
    }
    const source = normalized.map(({ icon, url, text, subtitle }) => ({ source_type: "THIRD_PARTY", source_display_name: text, source_subtitle: subtitle, source_url: url, favicon: { url: Toolkit.resolveMedia(this.#client, icon, "image", { resolveUrl }), mime_type: "image/jpeg", width: 16, height: 16 } }));
    this._sections.push(AIRich.newLayout("Single", { sources: source, __typename: "GenAISearchResultPrimitive" }));
    return this;
  }
  addReels(reelsItems = [], { resolveUrl = false } = {}) {
    if (!(reelsItems && typeof reelsItems === "object" && !Array.isArray(reelsItems) || Array.isArray(reelsItems) && reelsItems.every((item) => item && typeof item === "object" && !Array.isArray(item)))) {
      throw new TypeError("Reels items must be an object or an array of objects");
    }
    if (!Array.isArray(reelsItems)) {
      reelsItems = [reelsItems];
    }
    const reels = reelsItems.map((item) => ({ ...item, _avatar: Toolkit.resolveMedia(this.#client, item.profileIconUrl ?? item.profile_url ?? item.profile ?? "", "image", { resolveUrl }), _thumbnail: Toolkit.resolveMedia(this.#client, item.thumbnailUrl ?? item.thumbnail ?? "", "image", { resolveUrl }) }));
    this._submessages.push({ messageType: 9, contentItemsMetadata: { contentType: 1, itemsMetadata: reels.map((item) => ({ reelItem: { title: item.username ?? "", profileIconUrl: item._avatar, thumbnailUrl: item._thumbnail, videoUrl: item.videoUrl ?? item.url ?? "" } })) } });
    reels.forEach((item, idx) => {
      this._richResponseSources.push({ provider: "Evernight AI", thumbnailCDNURL: item._thumbnail, sourceProviderURL: item.videoUrl ?? item.url ?? "", sourceQuery: "", faviconCDNURL: item._avatar, citationNumber: idx + 1, sourceTitle: item.username ?? "" });
    });
    this._sections.push(AIRich.newLayout("HScroll", reels.map((item) => ({ reels_url: item.videoUrl ?? item.url ?? "", thumbnail_url: item._thumbnail, creator: item.username ?? item.title ?? "", avatar_url: item._avatar, reels_title: item.reels_title ?? item.title ?? "", likes_count: item.likes_count ?? item.like ?? 0, shares_count: item.shares_count ?? item.share ?? 0, view_count: item.view_count ?? item.view ?? 0, reel_source: item.reel_source ?? item.source ?? "IG", is_verified: !!(item.is_verified || item.verified), __typename: "GenAIReelPrimitive" }))));
    return this;
  }
  addImage(imageUrl, { resolveUrl = false, instant = true } = {}) {
    if (!(typeof imageUrl === "string" || Buffer.isBuffer(imageUrl) || Array.isArray(imageUrl) && imageUrl.every((v) => typeof v === "string" || Buffer.isBuffer(v)))) {
      throw new TypeError("imageUrl must be string | buffer | array of string/buffer");
    }
    if (instant !== false && instant !== true && instant !== "only") {
      throw new TypeError(`instant must be false, true, or 'only' — got ${JSON.stringify(instant)}`);
    }
    const list = Array.isArray(imageUrl) ? imageUrl.map((v) => {
      const url = Toolkit.resolveMedia(this.#client, v, "image", { resolveUrl });
      return { imagePreviewUrl: url, imageHighResUrl: url, sourceUrl: url };
    }) : (() => {
      const url = Toolkit.resolveMedia(this.#client, imageUrl, "image", { resolveUrl });
      return [{ imagePreviewUrl: url, imageHighResUrl: url, sourceUrl: url }];
    })();
    const buildCard = instant !== "only";
    if (buildCard) {
      this._submessages.push({ messageType: 1, gridImageMetadata: { gridImageUrl: { imagePreviewUrl: list[0]?.imagePreviewUrl }, imageUrls: list } });
    }
    list.forEach(({ imagePreviewUrl }) => {
      if (buildCard) {
        this._sections.push(AIRich.newLayout("Single", { media: { url: imagePreviewUrl, mime_type: "image/png" }, imagine_type: "IMAGE", status: { status: "READY" }, __typename: "GenAIImaginePrimitive" }));
      }
      if (instant) {
        this._mediaFallbacks.push({ type: "image", url: imagePreviewUrl, caption: void 0 });
        this._inlineImages.push({ url: imagePreviewUrl, caption: void 0 });
      }
    });
    return this;
  }
  addInlineImage(imageUrl, { text = "", alignment = "center", tapLinkUrl = "", resolveUrl = false } = {}) {
    if (!(typeof imageUrl === "string" || Buffer.isBuffer(imageUrl) || imageUrl && typeof imageUrl === "object")) {
      throw new TypeError("imageUrl must be string | buffer | { imagePreviewUrl, imageHighResUrl, sourceUrl }");
    }
    const ALIGNMENT_ENUM = { leading: 0, trailing: 1, center: 2 };
    const ALIGNMENT_NAME = ["AI_RICH_RESPONSE_IMAGE_LAYOUT_LEADING_ALIGNED", "AI_RICH_RESPONSE_IMAGE_LAYOUT_TRAILING_ALIGNED", "AI_RICH_RESPONSE_IMAGE_LAYOUT_CENTER_ALIGNED"];
    const alignmentNum = typeof alignment === "number" ? alignment : ALIGNMENT_ENUM[String(alignment).toLowerCase()] ?? ALIGNMENT_ENUM.center;
    const url = imageUrl && typeof imageUrl === "object" ? { imagePreviewUrl: imageUrl.imagePreviewUrl || imageUrl.url, imageHighResUrl: imageUrl.imageHighResUrl || imageUrl.url, sourceUrl: imageUrl.sourceUrl || imageUrl.url } : (() => {
      const resolved = Toolkit.resolveMedia(this.#client, imageUrl, "image", { resolveUrl });
      return { imagePreviewUrl: resolved, imageHighResUrl: resolved, sourceUrl: resolved };
    })();
    this._submessages.push({ messageType: 3, imageMetadata: { imageUrl: url, imageText: text, alignment: alignmentNum, tapLinkUrl } });
    this._sections.push(AIRich.newLayout("Single", { image_url: { image_preview_url: url.imagePreviewUrl || "", image_high_res_url: url.imageHighResUrl || "", source_url: url.sourceUrl || "" }, image_text: text, alignment: ALIGNMENT_NAME[alignmentNum], tap_link_url: tapLinkUrl, __typename: "GenAIInlineImageUXPrimitive" }));
    this._inlineImages.push({ url: url.sourceUrl || url.imageHighResUrl || url.imagePreviewUrl, caption: text || void 0 });
    return this;
  }
  addVideo(videoUrl, { autoFill = false, resolveUrl = false, instant = true } = {}) {
    const isObjectVideo = (v) => v && typeof v === "object" && v.url;
    const isValidPrimitive = typeof videoUrl === "string" || Buffer.isBuffer(videoUrl) || isObjectVideo(videoUrl) || Array.isArray(videoUrl) && videoUrl.every((v) => typeof v === "string" || Buffer.isBuffer(v) || isObjectVideo(v));
    if (!isValidPrimitive) {
      throw new TypeError("videoUrl must be string | buffer | object | array");
    }
    const items = Array.isArray(videoUrl) ? videoUrl : [videoUrl];
    this._submessages.push({ messageType: 2, messageText: "[ Video tidak dapat dimuat ]" });
    items.forEach((item) => {
      const isObject = isObjectVideo(item);
      const url = isObject ? Toolkit.resolveMedia(this.#client, item.url ?? "", "video", { resolveUrl }) : Toolkit.resolveMedia(this.#client, item, "video", { resolveUrl });
      const bufferPromise = autoFill ? Promise.resolve(url).then((u) => Toolkit.fetchBuffer(u)) : null;
      const file_length = isObject && item.file_length != null ? item.file_length : autoFill ? bufferPromise.then((b) => b?.length ?? 0) : 0;
      const duration = isObject && item.duration != null ? item.duration : autoFill ? bufferPromise.then((b) => Toolkit.getMp4Duration(b, { silent: true })) : 0;
      const thumbnail = isObject && item.thumbnail ? Toolkit.resolveMedia(this.#client, item.thumbnail, "image", { result: "base64", resize: true, width: 300, height: 300 }) : autoFill ? bufferPromise ? bufferPromise.then((b) => Toolkit.getMp4Preview(b, { time: 0, result: "base64" })) : null : null;
      this._sections.push(AIRich.newLayout("Single", { media: { url, mime_type: isObject ? item.mime_type ?? "video/mp4" : "video/mp4", file_length, duration }, imagine_type: "ANIMATE", status: { status: "READY" }, thumbnail: { raw_media: thumbnail }, __typename: "GenAIImaginePrimitive" }));
      if (instant) {
        this._mediaFallbacks.push({ type: "video", url, caption: isObject ? item.caption ?? "" : "", mimetype: isObject ? item.mime_type ?? "video/mp4" : "video/mp4" });
      }
    });
    return this;
  }
  addProduct(data = {}, { resolveUrl = false } = {}) {
    if (!(data && typeof data === "object" && !Array.isArray(data) || Array.isArray(data) && data.every((item) => item && typeof item === "object" && !Array.isArray(item)))) {
      throw new TypeError("Product items must be an object or an array of objects");
    }
    const itemsToCheck = Array.isArray(data) ? data : [data];
    const missingTitleAt = itemsToCheck.findIndex((item) => !item.title);
    if (missingTitleAt !== -1) {
      throw new TypeError(`addProduct() item[${missingTitleAt}] is missing a required "title"`);
    }
    this._submessages.push({ messageType: 2, messageText: "[ Produk tidak dapat dimuat ]" });
    const items = Array.isArray(data) ? data : [data];
    const product = items.map((item) => ({ title: item.title, brand: item.brand, price: item.price, sale_price: item.sale_price, product_url: item.product_url ?? item.url, image: { url: Toolkit.resolveMedia(this.#client, item.image_url ?? item.image, "image", { resolveUrl }) }, additional_images: [{ url: Toolkit.resolveMedia(this.#client, item.icon_url ?? item.icon, "image", { resolveUrl }) }], __typename: "GenAIProductItemCardPrimitive" }));
    this._sections.push(AIRich.newLayout(Array.isArray(data) ? "HScroll" : "Single", Array.isArray(data) ? product : product[0]));
    return this;
  }
  addPost(data = {}, { resolveUrl = false } = {}) {
    if (!(data && typeof data === "object" && !Array.isArray(data) || Array.isArray(data) && data.every((item) => item && typeof item === "object" && !Array.isArray(item)))) {
      throw new TypeError("Post items must be an object or an array of objects");
    }
    const posts = Array.isArray(data) ? data : [data];
    this._submessages.push({ messageType: 2, messageText: "[ Postingan tidak dapat dimuat ]" });
    const primitives = posts.map((p) => ({ title: p.title ?? "", subtitle: p.subtitle ?? "", username: p.username ?? "", profile_picture_url: Toolkit.resolveMedia(this.#client, p.profile_picture_url ?? p.profile_url ?? p.profile ?? "", "image", { resolveUrl }), is_verified: !!(p.is_verified || p.verified), thumbnail_url: Toolkit.resolveMedia(this.#client, p.thumbnail_url ?? p.thumbnail ?? "", "image", { resolveUrl }), post_caption: p.post_caption ?? p.caption ?? "", likes_count: p.likes_count ?? p.like ?? 0, comments_count: p.comments_count ?? p.comment ?? 0, shares_count: p.shares_count ?? p.share ?? 0, post_url: p.post_url ?? p.url ?? "", post_deeplink: p.post_deeplink ?? p.deeplink ?? "", source_app: p.source_app || p.source || "INSTAGRAM", footer_label: p.footer_label ?? p.footer ?? "", footer_icon: Toolkit.resolveMedia(this.#client, p.footer_icon ?? p.icon ?? "", "image", { resolveUrl }), is_carousel: posts.length > 1, orientation: p.orientation ?? "LANDSCAPE", post_type: p.post_type ?? "VIDEO", __typename: "GenAIPostPrimitive" }));
    this._sections.push(AIRich.newLayout("HScroll", primitives));
    return this;
  }
  setResponseId(id) {
    if (typeof id !== "string" || !id) throw new TypeError("setResponseId(id) requires a non-empty string");
    this._responseId = id;
    return this;
  }
  refreshResponseId() {
    this._responseId = crypto.randomUUID();
    return this;
  }
  setBotResponseId(id) {
    if (typeof id !== "string" || !id) throw new TypeError("setBotResponseId(id) requires a non-empty string");
    this._botResponseId = id;
    return this;
  }
  refreshBotResponseId() {
    this._botResponseId = crypto.randomUUID();
    return this;
  }
  hasId(id) {
    return typeof id === "string" && this._blocks.has(id);
  }
  getIds() {
    return [...this._blocks.keys()];
  }
  peek(id) {
    const block = this._blocks.get(id);
    if (!block) return null;
    return { id, sections: [...block.secItems], submessages: [...block.subItems] };
  }
  delete(id) {
    const block = this._blocks.get(id);
    if (!block) throw new Error(`delete(id): no block registered with id "${id}"`);
    for (const item of block.subItems) {
      const idx = this._submessages.indexOf(item);
      if (idx !== -1) this._submessages.splice(idx, 1);
    }
    for (const item of block.secItems) {
      const idx = this._sections.indexOf(item);
      if (idx !== -1) this._sections.splice(idx, 1);
    }
    this._blocks.delete(id);
    return this;
  }
  addMetadata(text) {
    if (typeof text !== "string" || !text) throw new TypeError("addMetadata(text) requires a non-empty string");
    this._submessages.push({ messageType: 2, messageText: text });
    this._sections.push(AIRich.newLayout("Single", { text, __typename: "GenAIMetadataTextPrimitive" }));
    return this;
  }
  addTip(text) {
    if (typeof text !== "string" || !text) {
      throw new TypeError("addTip(text) requires a non-empty string");
    }
    this._submessages.push({ messageType: 2, messageText: text });
    this._sections.push(AIRich.newLayout("Single", { text, __typename: "GenAIMetadataTextPrimitive" }));
    return this;
  }
  addHeading(text) {
    if (typeof text !== "string" || !text) {
      throw new TypeError("addHeading(text) requires a non-empty string");
    }
    this._submessages.push({ messageType: 2, messageText: text });
    this._sections.push(AIRich.newLayout("Single", { text, __typename: "FOATextPrimitive" }));
    return this;
  }
  addWidget(data = {}, { layout } = {}) {
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item, i) => {
      const hasTitle = item?.title || item?.header?.title;
      if (!hasTitle) {
        throw new TypeError(`addWidget() item[${i}] is missing a required "title" (or "header.title")`);
      }
      const ctas = item.ctas ?? item.actions;
      if (!Array.isArray(ctas) || !ctas.length) {
        throw new TypeError(`addWidget() item[${i}] requires a non-empty "ctas" (or "actions") array`);
      }
    });
    this._submessages.push({ messageType: 2, messageText: items.map((item) => item.header?.title ?? item.title).join(", ") });
    const widgets = items.map((item) => {
      const ctas = item.ctas ?? item.actions;
      const headerTitle = item.header?.title ?? item.title;
      const headerSubtitle = item.header?.subtitle ?? item.subtitle ?? void 0;
      return { header: { title: headerTitle, ...headerSubtitle !== void 0 && { subtitle: headerSubtitle }, __typename: "GenAI3PExtWidgetStandardHeader" }, body: { sections: item.sections ?? [], ctas: ctas.map((cta, idx) => ({ label: cta.label ?? "", state: cta.state ?? "PENDING", kind: cta.kind ?? "OTHER", tool_call_id: cta.tool_call_id ?? cta.id ?? String(idx).padStart(2, "0"), ...cta.toast !== false && { toast: { label: typeof cta.toast === "string" ? cta.toast : headerTitle, __typename: "GenAI3PExtWidgetToast" } }, __typename: "GenAI3PExtWidgetCTA" })), __typename: item.body_typename ?? "GenAI3PExtCalendarEventList" }, __typename: "GenAI3PExtWidgetPrimitive" };
    });
    const resolvedLayout = layout ?? (Array.isArray(data) ? "HScroll" : "Single");
    const asArray = resolvedLayout !== "Single";
    this._sections.push(AIRich.newLayout(resolvedLayout, asArray ? widgets : widgets[0]));
    return this;
  }
  addFooterAction(actions) {
    const items = Array.isArray(actions) ? actions : [actions];
    items.forEach((item, i) => {
      if (!item?.text || !item?.url) {
        throw new TypeError(`addFooterAction() item[${i}] requires both "text" and "url"`);
      }
    });
    const primitives = items.map((item) => ({ cta_text: item.text, cta_type: item.type ?? "OPEN_URL", cta_url: item.url, __typename: "GenAIFooterActionPrimitive" }));
    this._sections.push(AIRich.newLayout("HScroll", primitives));
    return this;
  }
  addDivider() {
    this._submessages.push({ messageType: 2, messageText: "---" });
    this._sections.push(AIRich.newLayout("Single", { __typename: "GenAIDividerPrimitive" }));
    return this;
  }
  addSpacer(spacing = 1) {
    if (typeof spacing !== "number" || spacing < 0) {
      throw new TypeError("addSpacer(spacing) requires a non-negative number");
    }
    this._submessages.push({ messageType: 2, messageText: `spasi ${spacing}` });
    this._sections.push(AIRich.newLayout("Single", { spacing, __typename: "GenAISpacerPrimitive" }));
    return this;
  }
  addLatex(expression) {
    if (typeof expression !== "string" || !expression) {
      throw new TypeError("addLatex(expression) requires a non-empty string");
    }
    this._submessages.push({ messageType: 8, latexMetadata: { text: expression, expressions: [{ latexExpression: expression }] } });
    this._sections.push(AIRich.newLayout("Single", { latex_expression: expression, __typename: "GenAILatexUXPrimitive" }));
    return this;
  }
  addTask(data = {}) {
    if (!data?.title) {
      throw new TypeError('addTask() requires a "title"');
    }
    this._submessages.push({ messageType: 2, messageText: `Tugas: ${data.title}` });
    this._sections.push(AIRich.newLayout("Single", { task_id: data.task_id ?? "", title: data.title, subtitle: data.subtitle ?? "", status: data.status ?? "IN_PROGRESS", __typename: "GenAITaskPrimitive" }));
    if (data.textFallback !== false) {
      const fallbackText = data.subtitle ? `${data.title} — ${data.subtitle}` : data.title;
      this._sections.push(AIRich.newLayout("Single", { text: `Tugas: ${fallbackText}`, __typename: "FOATextPrimitive" }));
    }
    return this;
  }
  addProgressStatus(title, { icon = "SEARCH", is_in_progress = true, target_secondary_screen_id, target_secondary_screen_tab_id } = {}) {
    if (typeof title !== "string" || !title) {
      throw new TypeError("addProgressStatus(title) requires a non-empty string");
    }
    this._submessages.push({ messageType: 2, messageText: title });
    const primitive = { title, icon, is_in_progress, meta_search_apps: [], __typename: "GenAIBotProgressStatusPrimitive" };
    if (target_secondary_screen_id != null) primitive.target_secondary_screen_id = target_secondary_screen_id;
    if (target_secondary_screen_tab_id != null) primitive.target_secondary_screen_tab_id = target_secondary_screen_tab_id;
    this._sections.push(AIRich.newLayout("Single", primitive));
    return this;
  }
  addThinkingStatus(title, { icon = "THINKING", is_in_progress = true, target_secondary_screen_id, target_secondary_screen_tab_id, textFallback = true } = {}) {
    if (typeof title !== "string" || !title) {
      throw new TypeError("addThinkingStatus(title) requires a non-empty string");
    }
    this._submessages.push({ messageType: 2, messageText: title });
    const primitive = { title, icon, is_in_progress, meta_search_apps: [], __typename: "GenAIBotThinkingStatusPrimitive" };
    if (target_secondary_screen_id != null) primitive.target_secondary_screen_id = target_secondary_screen_id;
    if (target_secondary_screen_tab_id != null) primitive.target_secondary_screen_tab_id = target_secondary_screen_tab_id;
    this._sections.push(AIRich.newLayout("Single", primitive));
    if (textFallback) {
      this._sections.push(AIRich.newLayout("Single", { text: title, __typename: "FOATextPrimitive" }));
    }
    return this;
  }
  addQuotaUpsell(data = {}) {
    if (!data?.title) {
      throw new TypeError('addQuotaUpsell() requires a "title"');
    }
    this._submessages.push({ messageType: 2, messageText: data.title });
    this._sections.push(AIRich.newLayout("Single", { title: data.title, body: data.body ?? "", body_line1: data.body_line1 ?? "", body_line2: data.body_line2 ?? "", buttons: (data.buttons ?? []).map((b) => ({ label: b.label ?? "", action: b.action ?? "OPEN_DEEPLINK", deeplink: b.deeplink ?? "" })), __typename: "GenAIMetaSubsQuotaUpsellPrimitive" }));
    return this;
  }
  addBloks(data = {}) {
    if (!data?.type) {
      throw new TypeError('addBloks() requires a "type"');
    }
    this._submessages.push({ messageType: 2, messageText: "Bloks" });
    const primitive = { type: data.type, data: data.data ?? "{}", uuid: data.uuid ?? "", versioning_id: data.versioning_id ?? "", __typename: "FOABloksPrimitive" };
    if (data.initial_response != null) primitive.initial_response = data.initial_response;
    this._sections.push(AIRich.newLayout("Single", primitive));
    if (data.textFallback !== false) {
      this._sections.push(AIRich.newLayout("Single", { text: `Bloks: ${data.type}`, __typename: "FOATextPrimitive" }));
    }
    return this;
  }
  addSuggest(suggestion, { scroll = true, layout } = {}) {
    if (!(typeof suggestion === "string" || Array.isArray(suggestion) && suggestion.every((v) => typeof v === "string"))) {
      throw new TypeError("Suggestion must be a string or array of strings");
    }
    const suggest = Array.isArray(suggestion) ? suggestion.map((text) => ({ prompt_text: text, prompt_type: "SUGGESTED_PROMPT", __typename: "GenAIFollowUpSuggestionPillPrimitive" })) : [{ prompt_text: suggestion, prompt_type: "SUGGESTED_PROMPT", __typename: "GenAIFollowUpSuggestionPillPrimitive" }];
    const type = layout ?? (suggest.length === 1 ? "Single" : scroll ? "HScroll" : "ActionRow");
    this._sections.push(AIRich.newLayout(type, type === "Single" ? suggest[0] : suggest, { __typename: "GenAIUnifiedResponseSection" }));
    return this;
  }
  async build({ forwarded = true, notification = false, includesUnifiedResponse = true, includesSubmessages = true, quoted, quotedParticipant, ...options } = {}) {
    const forward = forwarded ? { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: "0@bot" }, forwardOrigin: 4 } : {};
    const notif = notification ? { sessionTransparencyMetadata: { disclaimerText: "~ Ahmad tumbuh kembang", hcaId: `hca_${Date.now()}`, sessionTransparencyType: 1 } } : {};
    const qObj = quoted ? { stanzaId: quoted?.key?.id || quoted?.id, participant: quotedParticipant || quoted?.key?.participant || quoted?.key?.remoteJid, quotedType: 0, quotedMessage: typeof quoted === "object" && quoted !== null ? quoted.message ?? quoted : void 0 } : {};
    const sections = this._footer ? [...await waitAllPromises(this._sections), AIRich.newLayout("Single", { text: this._footer, __typename: "GenAIMetadataTextPrimitive" })] : [...await waitAllPromises(this._sections)];
    const responseId = this._responseId ?? crypto.randomUUID();
    const botResponseId = this._botResponseId ?? crypto.randomUUID();
    return { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2, botMetadata: { messageDisclaimerText: this._title, richResponseSourcesMetadata: { sources: this._richResponseSources }, botResponseId, verificationMetadata: { proofs: [{ certificateChain: [botMetadataCertificate(), botMetadataCertificate(892)], version: 1, useCase: 1, signature: botMetadataSignature() }] }, ...notif } }, ...this._extraPayload, botForwardedMessage: { message: { richResponseMessage: { messageType: 1, submessages: includesSubmessages ? await waitAllPromises(this._submessages) : [], unifiedResponse: { data: includesUnifiedResponse ? Buffer.from(JSON.stringify({ response_id: responseId, sections })).toString("base64") : "" }, contextInfo: { ...forward, ...qObj, ...this._contextInfo } } } } };
  }
  async send(jid, { forwarded, notification, includesUnifiedResponse, includesSubmessages, skipImageFallback = false, nativeFallback = true, quoted, messageId, ...options } = {}) {
    const msg = await this.build({ forwarded, notification, includesUnifiedResponse, includesSubmessages, quoted, ...options });
    const sendOptions = quoted ? { quoted } : {};
    if (nativeFallback) {
      const sent = [];
      if (!skipImageFallback && this._mediaFallbacks.length) {
        const fallbacks = await waitAllPromises(this._mediaFallbacks);
        for (const item of fallbacks) {
          try {
            const media = Buffer.isBuffer(item.url) ? item.url : { url: item.url };
            const content = { [item.type]: media };
            if (item.caption) content.caption = item.caption;
            if (item.mimetype) content.mimetype = item.mimetype;
            if (item.fileName) content.fileName = item.fileName;
            sent.push(await this.#client.sendMessage(jid, content, sendOptions));
          } catch (err) {
            this.#client.logger?.warn?.({ err, url: item.url, type: item.type }, "AIRich native media fallback failed");
          }
        }
      }
      const lines = [];
      for (const sub of await waitAllPromises(this._submessages)) {
        if (!sub) continue;
        if (typeof sub.messageText === "string" && sub.messageText.trim()) {
          const t = sub.messageText.trim();
          if (t === "[ Video tidak dapat dimuat ]" || t === "[ Postingan tidak dapat dimuat ]" || t === "[ Produk tidak dapat dimuat ]" || t === "[ Sedang diproses... ]") continue;
          lines.push(t);
          continue;
        }
        if (sub.codeMetadata) {
          const blocks = sub.codeMetadata.codeBlocks ?? [];
          const code = Array.isArray(blocks) ? blocks.map((b) => typeof b === "string" ? b : b?.value ?? "").join("") : String(blocks);
          lines.push("```" + (sub.codeMetadata.codeLanguage || "") + "\\n" + code + "\\n```");
          continue;
        }
        if (sub.tableMetadata?.rows) {
          const rows = sub.tableMetadata.rows;
          if (Array.isArray(rows)) {
            lines.push(rows.map((row) => {
              const cells = Array.isArray(row) ? row : row?.cells;
              return Array.isArray(cells) ? cells.map((c) => typeof c === "string" ? c : c?.text ?? c?.value ?? "").join(" | ") : String(row);
            }).join("\\n"));
          }
          continue;
        }
        if (sub.latexMetadata?.text) {
          lines.push(sub.latexMetadata.text);
        }
      }
      const text = lines.join("\\n\\n").trim();
      if (text) {
        sent.push(await this.#client.sendMessage(jid, { text }, sendOptions));
      }
      if (sent.length) return sent.length === 1 ? sent[0] : sent;
    }
    messageId = messageId || generateMessageIDV2();
    await this.#client.relayMessage(jid, msg, { messageId, ...options });
    this._lastMessageKey = { remoteJid: jid, fromMe: true, id: messageId };
    return { key: this._lastMessageKey, message: msg };
  }
  async buildEdit(targetJid, targetId, { msg, messageId, ...options } = {}) {
    const editedMessage = msg || await this.build({ ...options });
    if (!editedMessage) {
      throw new Error("buildEdit: no message content to edit (build() returned nothing)");
    }
    return generateWAMessageFromContent(targetJid, { protocolMessage: { key: { remoteJid: targetJid, fromMe: true, id: targetId }, type: 14, editedMessage } }, { messageId: messageId || generateMessageIDV2(), ...options });
  }
  async sendEdit(jid, id, { msg, messageId, additionalNodes = [], ...options } = {}) {
    jid = jid ?? this._lastMessageKey?.remoteJid;
    id = id ?? this._lastMessageKey?.id;
    if (!jid) {
      throw new Error("sendEdit: no jid \u2014 pass one explicitly, or call send() first");
    }
    if (!id) {
      throw new Error("sendEdit: no message id \u2014 pass one explicitly, or call send() first");
    }
    const msgEdit = await this.buildEdit(jid, id, { msg, messageId: messageId || generateMessageIDV2(), ...options });
    await this.#client.relayMessage(jid, msgEdit.message, { messageId: msgEdit.key.id, additionalNodes });
    return msgEdit;
  }
  static tokenizer(code, lang = "javascript") {
    const keywordsMap = { javascript: new Set(["break", "case", "catch", "continue", "debugger", "delete", "do", "else", "finally", "for", "function", "if", "in", "instanceof", "new", "return", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "true", "false", "null", "undefined", "class", "const", "let", "super", "extends", "export", "import", "yield", "static", "constructor", "async", "await", "get", "set"]), typescript: new Set(["abstract", "any", "as", "asserts", "bigint", "boolean", "declare", "enum", "implements", "infer", "interface", "is", "keyof", "module", "namespace", "never", "readonly", "require", "number", "object", "override", "private", "protected", "public", "satisfies", "string", "symbol", "type", "unknown", "using", "from", "break", "case", "catch", "continue", "do", "else", "finally", "for", "function", "if", "new", "return", "switch", "this", "throw", "try", "var", "void", "while", "class", "const", "let", "extends", "import", "export", "async", "await"]), python: new Set(["False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"]), java: new Set(["abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void", "volatile", "while"]), golang: new Set(["break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select", "struct", "switch", "type", "var"]), c: new Set(["auto", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum", "extern", "float", "for", "goto", "if", "int", "long", "register", "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned", "void", "volatile", "while"]), cpp: new Set(["alignas", "alignof", "and", "auto", "bool", "break", "case", "catch", "class", "const", "constexpr", "continue", "delete", "do", "double", "else", "enum", "explicit", "export", "extern", "false", "float", "for", "friend", "if", "inline", "int", "long", "mutable", "namespace", "new", "noexcept", "nullptr", "operator", "private", "protected", "public", "return", "short", "signed", "sizeof", "static", "struct", "switch", "template", "this", "throw", "true", "try", "typedef", "typename", "union", "unsigned", "using", "virtual", "void", "while"]), php: new Set(["abstract", "and", "array", "as", "break", "callable", "case", "catch", "class", "clone", "const", "continue", "declare", "default", "do", "echo", "else", "elseif", "empty", "enddeclare", "endfor", "endforeach", "endif", "endswitch", "endwhile", "extends", "final", "finally", "fn", "for", "foreach", "function", "global", "goto", "if", "implements", "include", "include_once", "instanceof", "interface", "match", "namespace", "new", "null", "or", "private", "protected", "public", "require", "require_once", "return", "static", "switch", "throw", "trait", "try", "use", "var", "while", "yield"]), rust: new Set(["as", "break", "const", "continue", "crate", "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while"]), html: new Set(["html", "head", "body", "div", "span", "p", "a", "img", "video", "audio", "script", "style", "link", "meta", "form", "input", "button", "table", "tr", "td", "th", "ul", "ol", "li", "section", "article", "header", "footer", "nav", "main"]), bash: new Set(["if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "function", "in", "select", "until", "break", "continue", "return", "export", "readonly", "local", "declare"]), markdown: new Set(["#", "##", "###", "####", "#####", "######"]) };
    if (!lang || lang === "txt" || lang === "text" || lang === "plaintext") {
      return { codeBlock: [{ codeContent: code, highlightType: 0 }], unified_codeBlock: [{ content: code, type: "DEFAULT" }] };
    }
    const TYPE_MAP = { 0: "DEFAULT", 1: "KEYWORD", 2: "METHOD", 3: "STR", 4: "NUMBER", 5: "COMMENT" };
    const keywords = keywordsMap[lang.toLowerCase()] || new Set();
    const tokens = [];
    let i = 0;
    const push = (content, type) => {
      if (!content) return;
      const last = tokens[tokens.length - 1];
      if (last && last.highlightType === type) {
        last.codeContent += content;
      } else {
        tokens.push({ codeContent: content, highlightType: type });
      }
    };
    const isIdentifier = (char) => {
      switch (lang.toLowerCase()) {
        case "css":
          return /[a-zA-Z0-9_$-]/.test(char);
        case "html":
          return /[a-zA-Z0-9_$:-]/.test(char);
        default:
          return /[a-zA-Z0-9_$]/.test(char);
      }
    };
    while (i < code.length) {
      const c = code[i];
      if (/\s/.test(c)) {
        let s = i;
        while (i < code.length && /\s/.test(code[i])) {
          i++;
        }
        push(code.slice(s, i), 0);
        continue;
      }
      if (c === "/" && code[i + 1] === "/" || c === "#" && ["python", "bash"].includes(lang)) {
        let s = i;
        while (i < code.length && code[i] !== "\n") {
          i++;
        }
        push(code.slice(s, i), 5);
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        let s = i;
        const q = c;
        i++;
        while (i < code.length) {
          if (code[i] === "\\" && i + 1 < code.length) {
            i += 2;
          } else if (code[i] === q) {
            i++;
            break;
          } else {
            i++;
          }
        }
        push(code.slice(s, i), 3);
        continue;
      }
      if (/[0-9]/.test(c)) {
        let s = i;
        while (i < code.length && /[0-9._]/.test(code[i])) {
          i++;
        }
        push(code.slice(s, i), 4);
        continue;
      }
      if (/[a-zA-Z_$]/.test(c)) {
        let s = i;
        while (i < code.length && isIdentifier(code[i])) {
          i++;
        }
        const word = code.slice(s, i);
        let type = 0;
        if (keywords.has(word)) {
          type = 1;
        } else if (lang === "css") {
          let j = i;
          while (j < code.length && /\s/.test(code[j])) {
            j++;
          }
          if (code[j] === ":") {
            type = 1;
          }
        } else if (lang === "html") {
          let p = s - 1;
          while (p >= 0 && /\s/.test(code[p])) {
            p--;
          }
          if (code[p] === "<" || code[p] === "/" && code[p - 1] === "<") {
            type = 1;
          }
        }
        if (type === 0) {
          let j = i;
          while (j < code.length && /\s/.test(code[j])) {
            j++;
          }
          if (code[j] === "(") {
            type = 2;
          }
        }
        push(word, type);
        continue;
      }
      push(c, 0);
      i++;
    }
    return { codeBlock: tokens, unified_codeBlock: tokens.map((t) => ({ content: t.codeContent, type: TYPE_MAP[t.highlightType] })) };
  }
  static toTableMetadata(arr, { hyperlink = true, citation = true, latex = true } = {}) {
    if (!Array.isArray(arr) || !arr.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string"))) {
      throw new TypeError("Table must be a nested array of strings");
    }
    if (arr.length === 0 || arr[0].length === 0) {
      throw new TypeError("Table must contain a non-empty header row");
    }
    const [header, ...rows] = arr;
    const maxLen = Math.max(header.length, ...rows.map((r) => r.length));
    const normalize = (r) => [...r, ...Array(maxLen - r.length).fill("")];
    const unified_rows = [{ is_header: true, cells: normalize(header) }, ...rows.map((r) => ({ is_header: false, cells: normalize(r) }))].map((row) => {
      const markdown_cells = row.cells.map((cell) => {
        const extracted = extractIE(cell, { hyperlink, citation, latex });
        return { text: extracted.text, ...extracted.inline_entities.length ? { inline_entities: extracted.inline_entities } : {} };
      });
      return { ...row, ...markdown_cells.some((c) => c.inline_entities?.length) ? { markdown_cells } : {} };
    });
    const rowsMeta = unified_rows.map((r) => ({ items: r.cells, ...r.is_header ? { isHeading: true } : {} }));
    return { title: "", rows: rowsMeta, unified_rows };
  }
  addGenerating({ imagine_type = "IMAGE", estimated_completion_time, textFallback = true } = {}) {
    this._submessages.push({ messageType: 2, messageText: "[ Sedang diproses... ]" });
    this._sections.push(AIRich.newLayout("Single", { media: { url: "", mime_type: imagine_type === "ANIMATE" ? "video/mp4" : "image/png" }, imagine_type, status: { status: "GENERATING", estimated_completion_time: estimated_completion_time ?? Math.floor(Date.now() / 1e3) + 30 }, __typename: "GenAIImaginePrimitive" }));
    if (textFallback) {
      this._sections.push(AIRich.newLayout("Single", { text: "[ Sedang diproses... ]", __typename: "FOATextPrimitive" }));
    }
    return this;
  }
  static async sendSupportPayload(client, jid, text, { ticketId = crypto.randomUUID(), isAiMessage = true, shouldShowSystemMessage = true, version = 1 } = {}) {
    if (!client) throw new Error("Socket is required");
    if (typeof text !== "string" || !text) throw new TypeError("sendSupportPayload(client, jid, text) requires a non-empty string text");
    const msg = { conversation: text, messageContextInfo: { messageSecret: crypto.randomBytes(32), supportPayload: JSON.stringify({ version, is_ai_message: isAiMessage, should_show_system_message: shouldShowSystemMessage, ticket_id: ticketId }) } };
    return client.relayMessage(jid, msg, { additionalNodes: [{ tag: "bot", attrs: { biz_bot: "1" } }, { tag: "biz", attrs: {} }] });
  }
  static async sendPairedMedia(client, jid, { image, video } = {}) {
    if (!client) throw new Error("Socket is required");
    if (!image || !video) throw new TypeError('sendPairedMedia() requires both "image" and "video"');
    const imagePrepared = await prepareWAMessageMedia({ image: typeof image === "string" ? { url: image } : image }, { upload: client.waUploadToServer });
    const videoPrepared = await prepareWAMessageMedia({ video: typeof video === "string" ? { url: video } : video }, { upload: client.waUploadToServer });
    const imageMsg = generateWAMessageFromContent(jid, { imageMessage: { ...imagePrepared.imageMessage, contextInfo: { pairedMediaType: 5, statusSourceType: 0 } } }, {});
    await client.relayMessage(jid, imageMsg.message, { messageId: imageMsg.key.id });
    await client.relayMessage(jid, { videoMessage: { ...videoPrepared.videoMessage, contextInfo: { pairedMediaType: 6, statusSourceType: 0 } }, messageContextInfo: { messageAssociation: { associationType: 12, parentMessageKey: imageMsg.key } } }, {});
    return imageMsg.key;
  }
  static newLayout(name, data, extra = {}) {
    return { ...extra, view_model: { [Array.isArray(data) ? "primitives" : "primitive"]: data, __typename: `GenAI${name}LayoutViewModel` } };
  }
}
export {
  AIRich,
  Button,
  ButtonV2,
  Carousel,
  AIRich as LeafReach,
  AIRich as LeafRich,
  MESSAGE_BUILDER_VERSION,
  Poll,
  Toolkit
};
