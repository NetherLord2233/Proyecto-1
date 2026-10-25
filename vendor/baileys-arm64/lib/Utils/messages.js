import { Boom } from "@hapi/boom";
import { createCipheriv, createHash, createHmac, randomBytes } from "crypto";
import { zipSync } from "fflate";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { proto } from "../../WAProto/index.js";
import { CALL_AUDIO_PREFIX, CALL_VIDEO_PREFIX, DONATE_URL, LIBRARY_NAME, MEDIA_KEYS, URL_REGEX, WA_DEFAULT_EPHEMERAL } from "../Defaults/index.js";
import { AssociationType, ButtonHeaderType, ButtonType, CarouselCardType, ListType, ProtocolType, WAMessageStatus, WAProto } from "../Types/index.js";
import { isLidUser, isPnUser, isJidGroup, isJidNewsletter, isJidStatusBroadcast, jidNormalizedUser } from "../WABinary/index.js";
import { sha256 } from "./crypto.js";
import { generateMessageIDV2, getKeyAuthor, unixTimestampSeconds } from "./generics.js";
import { downloadContentFromMessage, encryptedStream, generateThumbnail, getAudioDuration, getAudioWaveform, getImageProcessingLibrary, getMediaKeys, getRawMediaUploadData, getStream, toBuffer } from "./messages-media.js";
import { prepareRichResponseMessage } from "./rich-message-utils.js";
import { shouldIncludeReportingToken } from "./reporting-utils.js";
const CONCURRENCY_LIMIT = 15;
const MIMETYPE_MAP = { image: "image/jpeg", video: "video/mp4", document: "application/pdf", audio: "audio/ogg; codecs=opus", sticker: "image/webp", "product-catalog-image": "image/jpeg" };
const MessageTypeProto = { image: WAProto.Message.ImageMessage, video: WAProto.Message.VideoMessage, audio: WAProto.Message.AudioMessage, sticker: WAProto.Message.StickerMessage, document: WAProto.Message.DocumentMessage };
const extractUrlFromText = (text) => text.match(URL_REGEX)?.[0];
const generateLinkPreviewIfRequired = async (text, getUrlInfo, logger) => {
  const url = extractUrlFromText(text);
  if (!!getUrlInfo && url) {
    try {
      const urlInfo = await getUrlInfo(url);
      return urlInfo;
    } catch (error) {
      logger?.warn({ trace: error.stack }, "url generation failed");
    }
  }
};
const assertColor = async (color) => {
  let assertedColor;
  if (typeof color === "number") {
    assertedColor = color > 0 ? color : 4294967295 + Number(color) + 1;
  } else {
    let hex = color.trim().replace("#", "");
    if (hex.length <= 6) {
      hex = "FF" + hex.padStart(6, "0");
    }
    assertedColor = parseInt(hex, 16);
    return assertedColor;
  }
};
const prepareWAMessageMedia = async (message, options) => {
  const logger = options.logger;
  let mediaType;
  for (const key of MEDIA_KEYS) {
    if (key in message) {
      mediaType = key;
    }
  }
  if (!mediaType) {
    throw new Boom("Invalid media type", { statusCode: 400 });
  }
  const uploadData = { ...message, media: message[mediaType] };
  delete uploadData[mediaType];
  const cacheableKey = typeof uploadData.media === "object" && "url" in uploadData.media && !!uploadData.media.url && !!options.mediaCache && mediaType + ":" + uploadData.media.url.toString();
  if (mediaType === "document" && !uploadData.fileName) {
    uploadData.fileName = "file";
  }
  if (!uploadData.mimetype) {
    uploadData.mimetype = MIMETYPE_MAP[mediaType];
  }
  if (cacheableKey) {
    const mediaBuff = await options.mediaCache.get(cacheableKey);
    if (mediaBuff) {
      logger?.debug({ cacheableKey }, "got media cache hit");
      const obj2 = proto.Message.decode(mediaBuff);
      const key = `${mediaType}Message`;
      Object.assign(obj2[key], { ...uploadData, media: void 0 });
      return obj2;
    }
  }
  const isNewsletter = !!options.jid && isJidNewsletter(options.jid);
  if (isNewsletter) {
    logger?.info({ key: cacheableKey }, "Preparing raw media for newsletter");
    const { filePath, fileSha256: fileSha2562, fileLength: fileLength2 } = await getRawMediaUploadData(uploadData.media, options.mediaTypeOverride || mediaType, logger);
    const fileSha256B64 = fileSha2562.toString("base64");
    const { mediaUrl: mediaUrl2, directPath: directPath2, thumbnailDirectPath, thumbnailSha256 } = await options.upload(filePath, { fileEncSha256B64: fileSha256B64, mediaType, timeoutMs: options.mediaUploadTimeoutMs, newsletter: isNewsletter });
    await fs.unlink(filePath);
    const obj2 = WAProto.Message.fromObject({ [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({ url: mediaUrl2, directPath: directPath2, fileSha256: fileSha2562, fileLength: fileLength2, thumbnailDirectPath, thumbnailSha256, ...uploadData, media: void 0 }) });
    if (uploadData.ptv) {
      obj2.ptvMessage = obj2.videoMessage;
      delete obj2.videoMessage;
    }
    if (obj2.stickerMessage) {
      obj2.stickerMessage.stickerSentTs = Date.now();
    }
    if (cacheableKey) {
      logger?.debug({ cacheableKey }, "set cache");
      await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj2).finish());
    }
    return obj2;
  }
  const requiresDurationComputation = mediaType === "audio" && typeof uploadData.seconds === "undefined";
  const requiresThumbnailComputation = (mediaType === "image" || mediaType === "video") && typeof uploadData["jpegThumbnail"] === "undefined";
  const requiresWaveformProcessing = mediaType === "audio" && uploadData.ptt === true && typeof uploadData.waveform === "undefined";
  const requiresAudioBackground = options.backgroundColor && mediaType === "audio" && uploadData.ptt === true;
  const requiresOriginalForSomeProcessing = requiresDurationComputation || requiresThumbnailComputation;
  const { mediaKey, encFilePath, originalFilePath, fileEncSha256, fileSha256, fileLength } = await encryptedStream(uploadData.media, options.mediaTypeOverride || mediaType, { logger, saveOriginalFileIfRequired: requiresOriginalForSomeProcessing, opts: options.options });
  const fileEncSha256B64 = fileEncSha256.toString("base64");
  const [{ mediaUrl, directPath }] = await Promise.all([(async () => {
    const result = await options.upload(encFilePath, { fileEncSha256B64, mediaType, timeoutMs: options.mediaUploadTimeoutMs });
    logger?.debug({ mediaType, cacheableKey }, "uploaded media");
    return result;
  })(), (async () => {
    try {
      if (requiresThumbnailComputation) {
        const { thumbnail, originalImageDimensions } = await generateThumbnail(originalFilePath, mediaType, options);
        uploadData.jpegThumbnail = thumbnail;
        if (!uploadData.width && originalImageDimensions) {
          uploadData.width = originalImageDimensions.width;
          uploadData.height = originalImageDimensions.height;
          logger?.debug("set dimensions");
        }
        logger?.debug("generated thumbnail");
      }
      if (requiresDurationComputation) {
        uploadData.seconds = await getAudioDuration(originalFilePath);
        logger?.debug("computed audio duration");
      }
      if (requiresWaveformProcessing) {
        uploadData.waveform = await getAudioWaveform(originalFilePath, logger);
        logger?.debug("processed waveform");
      }
      if (requiresAudioBackground) {
        uploadData.backgroundArgb = await assertColor(options.backgroundColor);
        logger?.debug("computed backgroundColor audio status");
      }
    } catch (error) {
      logger?.warn({ trace: error.stack }, "failed to obtain extra info");
    }
  })()]).finally(async () => {
    try {
      await fs.unlink(encFilePath);
      if (originalFilePath) {
        await fs.unlink(originalFilePath);
      }
      logger?.debug("removed tmp files");
    } catch (error) {
      logger?.warn("failed to remove tmp file");
    }
  });
  const obj = WAProto.Message.fromObject({ [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({ url: mediaUrl, directPath, mediaKey, fileEncSha256, fileSha256, fileLength, mediaKeyTimestamp: unixTimestampSeconds(), ...uploadData, media: void 0 }) });
  if (uploadData.ptv) {
    obj.ptvMessage = obj.videoMessage;
    delete obj.videoMessage;
  }
  if (cacheableKey) {
    logger?.debug({ cacheableKey }, "set cache");
    await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj).finish());
  }
  return obj;
};
const prepareProductMessage = async (message, options) => {
  if (!message.businessOwnerJid) {
    throw new Boom('"businessOwnerJid" is missing from the content', { statusCode: 400 });
  }
  const { imageMessage } = await prepareWAMessageMedia({ image: message.image || message.product.productImage }, options);
  const { image, ...content } = message;
  content.product = { currencyCode: "IDR", priceAmount1000: 1e3, title: LIBRARY_NAME, ...message.product, productImage: imageMessage };
  return content;
};
const encryptMediaBuffer = async (buf, mediaKey) => {
  const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, "sticker-pack");
  const aes = createCipheriv("aes-256-cbc", cipherKey, iv);
  const hmac = createHmac("sha256", macKey).update(iv);
  const encPart1 = aes.update(buf);
  const encPart2 = aes.final();
  hmac.update(encPart1).update(encPart2);
  const mac = hmac.digest().subarray(0, 10);
  const encBody = Buffer.concat([encPart1, encPart2, mac]);
  const fileEncSha256 = createHash("sha256").update(encPart1).update(encPart2).update(mac).digest();
  const fileSha256 = createHash("sha256").update(buf).digest();
  return { encBody, fileSha256, fileEncSha256 };
};
const generateStickerPackMessage = async (stickerPack, options) => {
  const { stickers, cover, name, publisher, packId, description } = stickerPack;
  if (!stickers || stickers.length === 0) {
    throw new Boom("Sticker pack must contain at least one sticker", { statusCode: 400 });
  }
  if (stickers.length > 120) {
    throw new Boom("Sticker pack exceeds the maximum limit of 120 stickers", { statusCode: 400 });
  }
  if (!cover) {
    throw new Boom("Sticker pack must contain a cover", { statusCode: 400 });
  }
  const lib = await getImageProcessingLibrary();
  const hasSharp = "sharp" in lib && !!lib.sharp?.default;
  const hasJimp = "jimp" in lib && !!lib.jimp?.Jimp;
  const stickerPackId = packId || generateMessageIDV2();
  const stickerData = {};
  const stickerMetadata = await Promise.all(stickers.map(async (s, i) => {
    const source = s.sticker ?? s.data;
    if (!source) {
      throw new Boom(`Sticker at index ${i} is missing its image data`, { statusCode: 400 });
    }
    const { stream } = await getStream(source);
    const buffer = await toBuffer(stream);
    let webpBuffer;
    let isAnimated = false;
    if (isWebPBuffer(buffer)) {
      webpBuffer = buffer;
      isAnimated = isAnimatedWebP(buffer);
    } else if (hasSharp) {
      webpBuffer = await lib.sharp.default(buffer).resize(512, 512, { fit: "inside" }).webp({ quality: 80 }).toBuffer();
    } else if (hasJimp) {
      const jimpImage = await lib.jimp.Jimp.read(buffer);
      webpBuffer = await jimpImage.resize({ w: 512, h: 512, mode: lib.jimp.ResizeStrategy.BILINEAR }).getBuffer("image/webp");
    } else {
      webpBuffer = buffer;
    }
    if (webpBuffer.length > 1024 * 1024) {
      throw new Boom(`Sticker at index ${i} exceeds the 1MB size limit`, { statusCode: 400 });
    }
    const fileName = `${i + 1}.webp`;
    stickerData[fileName] = [new Uint8Array(webpBuffer), { level: 0 }];
    return { fileName, mimetype: "image/webp", isAnimated: s.isAnimated !== void 0 ? s.isAnimated : isAnimated, isLottie: s.isLottie || false, emojis: s.emojis || [], accessibilityLabel: s.accessibilityLabel || "" };
  }));
  const { stream: coverStream } = await getStream(cover);
  const coverBuffer = await toBuffer(coverStream);
  const coverFileName = `${stickerPackId}.webp`;
  stickerData[coverFileName] = [new Uint8Array(coverBuffer), { level: 0 }];
  const zipBuffer = Buffer.from(zipSync(stickerData));
  const mediaKey = randomBytes(32);
  const zipEnc = await encryptMediaBuffer(zipBuffer, mediaKey);
  const zipEncPath = join(tmpdir(), "stickerpack_" + stickerPackId);
  await fs.writeFile(zipEncPath, zipEnc.encBody);
  let stickerPackUploadResult;
  try {
    stickerPackUploadResult = await options.upload(zipEncPath, { fileEncSha256B64: zipEnc.fileEncSha256.toString("base64"), mediaType: "sticker-pack", timeoutMs: options.mediaUploadTimeoutMs });
  } finally {
    await fs.unlink(zipEncPath).catch(() => {
    });
  }
  const thumbEnc = await encryptMediaBuffer(coverBuffer, mediaKey);
  const thumbEncPath = join(tmpdir(), "stickerthumb_" + stickerPackId);
  await fs.writeFile(thumbEncPath, thumbEnc.encBody);
  let thumbUploadResult;
  try {
    thumbUploadResult = await options.upload(thumbEncPath, { fileEncSha256B64: thumbEnc.fileEncSha256.toString("base64"), mediaType: "thumbnail-sticker-pack", timeoutMs: options.mediaUploadTimeoutMs });
  } finally {
    await fs.unlink(thumbEncPath).catch(() => {
    });
  }
  const imageDataHash = sha256(coverBuffer).toString("base64");
  return { name, publisher, stickerPackId, packDescription: description, stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.USER_CREATED, stickerPackSize: zipBuffer.length, stickers: stickerMetadata, fileSha256: zipEnc.fileSha256, fileEncSha256: zipEnc.fileEncSha256, mediaKey, directPath: stickerPackUploadResult.directPath, fileLength: zipBuffer.length, mediaKeyTimestamp: unixTimestampSeconds(), trayIconFileName: coverFileName, imageDataHash, thumbnailDirectPath: thumbUploadResult.directPath, thumbnailSha256: thumbEnc.fileSha256, thumbnailEncSha256: thumbEnc.fileEncSha256, thumbnailHeight: 96, thumbnailWidth: 96 };
};
const prepareNativeFlowButtons = (message) => {
  const buttons = message.nativeFlow;
  const isButtonsFieldArray = Array.isArray(buttons);
  const correctedField = isButtonsFieldArray ? buttons : buttons?.buttons ?? [];
  const messageParamsJson = {};
  if (hasOptionalProperty(message, "offerText") && !!message.offerText) {
    Object.assign(messageParamsJson, { limited_time_offer: { text: message.offerText || LIBRARY_NAME, url: message.offerUrl || DONATE_URL || void 0, copy_code: message.offerCode, expiration_time: message.offerExpiration } });
  }
  if (hasOptionalProperty(message, "optionText") && !!message.optionText) {
    Object.assign(messageParamsJson, { bottom_sheet: { in_thread_buttons_limit: 1, divider_indices: Array.from({ length: correctedField.length }, (_, index) => index), list_title: message.optionTitle || "📄 Select Options", button_title: message.optionText } });
  }
  return { buttons: correctedField.map((button) => {
    const buttonText = button.text || button.buttonText;
    const buttonIcon = button.icon?.toUpperCase();
    if (hasOptionalProperty(button, "id") && !!button.id) {
      return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: buttonText || "👉🏻 Click", id: button.id, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "copy") && !!button.copy) {
      return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: buttonText || "📋 Copy", copy_code: button.copy, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "url") && !!button.url) {
      return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: buttonText || "🌐 Visit", url: button.url, merchant_url: button.url, webview_interaction: button.useWebview, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "call") && !!button.call) {
      return { name: "cta_call", buttonParamsJson: JSON.stringify({ display_text: buttonText || "📞 Call", phone_number: button.call, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "sections") && !!button.sections) {
      return { name: "single_select", buttonParamsJson: JSON.stringify({ title: buttonText || "📋 Select", sections: button.sections, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "reminder") && !!button.reminder) {
      return { name: "cta_reminder", buttonParamsJson: JSON.stringify({ display_text: buttonText || "⏰ Remind me", id: button.id || button.reminder, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "cancelReminder") && !!button.cancelReminder) {
      return { name: "cta_cancel_reminder", buttonParamsJson: JSON.stringify({ display_text: buttonText || "🔕 Cancel reminder", id: button.id || button.cancelReminder, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "address") && !!button.address) {
      return { name: "address_message", buttonParamsJson: JSON.stringify({ display_text: buttonText || "📍 Send address", id: button.id || "address_message" }) };
    } else if (hasOptionalProperty(button, "location") && button.location === true) {
      return { name: "send_location", buttonParamsJson: JSON.stringify({}) };
    } else if (hasOptionalProperty(button, "catalog") && !!button.catalog) {
      return { name: "catalog_message", buttonParamsJson: JSON.stringify({ business_phone_number: button.catalog.bizJid || button.catalog, display_text: buttonText || "🛍️ View catalog", id: button.id || "catalog_message" }) };
    } else if (hasOptionalProperty(button, "products") && !!button.products) {
      return { name: "mpm", buttonParamsJson: JSON.stringify({ business_phone_number: button.bizJid || button.products.bizJid, product_ids: Array.isArray(button.products) ? button.products : button.products.ids }) };
    } else if (hasOptionalProperty(button, "phoneNumber") && !!button.phoneNumber) {
      return { name: "cta_call", buttonParamsJson: JSON.stringify({ display_text: buttonText || "📞 Call", phone_number: button.phoneNumber, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "urlBtn") && !!button.urlBtn) {
      return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: buttonText || "🌐 Open", url: button.urlBtn, merchant_url: button.urlBtn, webview_interaction: button.useWebview, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "reply") && !!button.reply) {
      return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: buttonText || button.reply, id: button.id || button.reply, icon: buttonIcon }) };
    } else if (hasOptionalProperty(button, "card") && !!button.card) {
      return { name: "card_message", buttonParamsJson: JSON.stringify(button.card) };
    } else if (hasOptionalProperty(button, "orderDetails") && !!button.orderDetails) {
      return { name: "order_details", buttonParamsJson: JSON.stringify(button.orderDetails) };
    } else if (hasOptionalProperty(button, "orderStatus") && !!button.orderStatus) {
      return { name: "order_status", buttonParamsJson: JSON.stringify(button.orderStatus) };
    } else if (hasOptionalProperty(button, "reviewAndPay") && !!button.reviewAndPay) {
      return { name: "review_and_pay", buttonParamsJson: JSON.stringify(button.reviewAndPay) };
    } else if (hasOptionalProperty(button, "paymentStatus") && !!button.paymentStatus) {
      return { name: "payment_status", buttonParamsJson: JSON.stringify(button.paymentStatus) };
    } else if (hasOptionalProperty(button, "paymentMethod") && !!button.paymentMethod) {
      return { name: "payment_method", buttonParamsJson: JSON.stringify(button.paymentMethod) };
    } else if (hasOptionalProperty(button, "trackOrder") && !!button.trackOrder) {
      return { name: "track_order", buttonParamsJson: JSON.stringify({ id: button.id || button.trackOrder, display_text: buttonText || "🚚 Track order" }) };
    } else if (hasOptionalProperty(button, "reorder") && !!button.reorder) {
      return { name: "reorder", buttonParamsJson: JSON.stringify({ id: button.id || button.reorder, display_text: buttonText || "🔁 Reorder" }) };
    } else if (hasOptionalProperty(button, "cancelOrder") && !!button.cancelOrder) {
      return { name: "cancel_order", buttonParamsJson: JSON.stringify({ id: button.id || button.cancelOrder, display_text: buttonText || "❌ Cancel order" }) };
    } else if (hasOptionalProperty(button, "clearChat") && button.clearChat === true) {
      return { name: "clear_chat", buttonParamsJson: JSON.stringify({}) };
    } else if (hasOptionalProperty(button, "screen") && !!button.screen) {
      return { name: "navigateToScreen", buttonParamsJson: JSON.stringify({ screen_name: button.screen, data: button.data || {} }) };
    } else if (hasOptionalProperty(button, "flow") && !!button.flow) {
      return { name: "flow_action", buttonParamsJson: JSON.stringify({ flow_message_version: button.flow.version || "3", flow_id: button.flow.id, flow_cta: buttonText || button.flow.cta || "Continue", flow_action: button.flow.action || "navigate", flow_action_payload: button.flow.actionPayload || { screen: button.flow.screen || "WELCOME", data: button.flow.data || {} } }) };
    } else if (hasOptionalProperty(button, "voiceCall") && !!button.voiceCall) {
      return { name: "voice_call", buttonParamsJson: JSON.stringify({ display_text: buttonText || "📞 Voice call", id: button.id || button.voiceCall }) };
    } else if (hasOptionalProperty(button, "videoCall") && !!button.videoCall) {
      return { name: "video_call_button", buttonParamsJson: JSON.stringify({ display_text: buttonText || "🎥 Video call", id: button.id || button.videoCall }) };
    }
    return button;
  }), messageParamsJson: JSON.stringify(messageParamsJson) };
};
const prepareDisappearingMessageSettingContent = (ephemeralExpiration) => {
  ephemeralExpiration = ephemeralExpiration || 0;
  const content = { ephemeralMessage: { message: { protocolMessage: { type: WAProto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING, ephemeralExpiration } } } };
  return WAProto.Message.fromObject(content);
};
const generateForwardMessageContent = (message, forceForward) => {
  let content = message.message;
  if (!content) {
    throw new Boom("no content in message", { statusCode: 400 });
  }
  content = normalizeMessageContent(content);
  content = proto.Message.decode(proto.Message.encode(content).finish());
  let key = Object.keys(content)[0];
  let innerContent = content?.[key];
  if (key === "viewOnceMessage" || key === "ephemeralMessage") {
    const innerKey = innerContent?.message ? Object.keys(innerContent.message)[0] : null;
    if (innerKey) {
      innerContent = innerContent.message[innerKey];
    }
  }
  let score = innerContent?.contextInfo?.forwardingScore || 0;
  score += message.key.fromMe && !forceForward ? 0 : 1;
  if (key === "conversation") {
    content.extendedTextMessage = { text: content[key] };
    delete content.conversation;
    key = "extendedTextMessage";
  }
  const key_ = content?.[key];
  if (score > 0) {
    key_.contextInfo = { forwardingScore: score, isForwarded: true };
  } else {
    key_.contextInfo = {};
  }
  return content;
};
const hasNonNullishProperty = (message, key) => {
  return message != null && typeof message === "object" && key in message && message[key] != null;
};
const hasOptionalProperty = (obj, key) => {
  return obj != null && typeof obj === "object" && key in obj && obj[key] != null;
};
const hasValidAlbumMedia = (message) => {
  return !!(message.imageMessage || message.videoMessage);
};
const hasValidInteractiveHeader = (message) => {
  return !!(message.imageMessage || message.videoMessage || message.documentMessage || message.productMessage || message.locationMessage);
};
const hasValidCarouselHeader = (message) => {
  return !!(message.imageMessage || message.videoMessage || message.productMessage);
};
const generateWAMessageContent = async (message, options) => {
  var _a, _b;
  let m = {};
  if (hasNonNullishProperty(message, "raw")) {
    delete message.raw;
    return message;
  } else if (hasNonNullishProperty(message, "code") || hasNonNullishProperty(message, "links") || hasNonNullishProperty(message, "table") || hasNonNullishProperty(message, "richResponse") || hasNonNullishProperty(message, "inlineImage") || hasNonNullishProperty(message, "inlineVideo") || hasNonNullishProperty(message, "headerText") || hasNonNullishProperty(message, "contentText") || hasNonNullishProperty(message, "footerText") || hasNonNullishProperty(message, "latex") || hasNonNullishProperty(message, "items") || hasNonNullishProperty(message, "posts") || hasNonNullishProperty(message, "products") || hasNonNullishProperty(message, "suggested")) {
    m = prepareRichResponseMessage(message);
  } else if (hasNonNullishProperty(message, "text")) {
    const extContent = { text: message.text };
    let urlInfo = message.linkPreview;
    if (typeof urlInfo === "undefined") {
      urlInfo = await generateLinkPreviewIfRequired(message.text, options.getUrlInfo, options.logger);
    }
    if (urlInfo) {
      extContent.matchedText = urlInfo["matched-text"];
      extContent.jpegThumbnail = urlInfo.jpegThumbnail;
      extContent.description = urlInfo.description;
      extContent.title = urlInfo.title;
      extContent.previewType = urlInfo.previewType ?? 0;
      extContent.linkPreviewMetadata = urlInfo.linkPreviewMetadata;
      const img = urlInfo.highQualityThumbnail;
      if (img) {
        extContent.thumbnailDirectPath = img.directPath;
        extContent.mediaKey = img.mediaKey;
        extContent.mediaKeyTimestamp = img.mediaKeyTimestamp;
        extContent.thumbnailWidth = img.width;
        extContent.thumbnailHeight = img.height;
        extContent.thumbnailSha256 = img.fileSha256;
        extContent.thumbnailEncSha256 = img.fileEncSha256;
      }
    }
    const faviconData = message.favicon;
    if (faviconData && typeof options.upload === "function") {
      const { imageMessage } = await prepareWAMessageMedia({ image: faviconData }, options);
      extContent.faviconMMSMetadata = { thumbnailDirectPath: imageMessage.directPath, mediaKey: imageMessage.mediaKey, mediaKeyTimestamp: imageMessage.mediaKeyTimestamp, thumbnailWidth: 32, thumbnailHeight: 32, thumbnailSha256: imageMessage.fileSha256, thumbnailEncSha256: imageMessage.fileEncSha256 };
    }
    if (options.backgroundColor) {
      extContent.backgroundArgb = await assertColor(options.backgroundColor);
    }
    if (options.font) {
      extContent.font = options.font;
    }
    m.extendedTextMessage = extContent;
  } else if (hasNonNullishProperty(message, "contacts")) {
    const contactLen = message.contacts.contacts.length;
    if (!contactLen) {
      throw new Boom("require atleast 1 contact", { statusCode: 400 });
    }
    if (contactLen === 1) {
      m.contactMessage = WAProto.Message.ContactMessage.create(message.contacts.contacts[0]);
    } else {
      m.contactsArrayMessage = WAProto.Message.ContactsArrayMessage.create(message.contacts);
    }
  } else if (hasNonNullishProperty(message, "location")) {
    m.locationMessage = WAProto.Message.LocationMessage.create(message.location);
  } else if (hasNonNullishProperty(message, "react")) {
    if (!message.react.senderTimestampMs) {
      message.react.senderTimestampMs = Date.now();
    }
    m.reactionMessage = WAProto.Message.ReactionMessage.create(message.react);
  } else if (hasNonNullishProperty(message, "delete")) {
    m.protocolMessage = { key: message.delete, type: WAProto.Message.ProtocolMessage.Type.REVOKE };
  } else if (hasNonNullishProperty(message, "forward")) {
    m = generateForwardMessageContent(message.forward, message.force);
  } else if (hasNonNullishProperty(message, "disappearingMessagesInChat")) {
    const exp = typeof message.disappearingMessagesInChat === "boolean" ? message.disappearingMessagesInChat ? WA_DEFAULT_EPHEMERAL : 0 : message.disappearingMessagesInChat;
    m = prepareDisappearingMessageSettingContent(exp);
  } else if (hasNonNullishProperty(message, "groupInvite")) {
    m.groupInviteMessage = {};
    m.groupInviteMessage.inviteCode = message.groupInvite.inviteCode;
    m.groupInviteMessage.inviteExpiration = message.groupInvite.inviteExpiration ?? 0;
    m.groupInviteMessage.caption = message.groupInvite.text;
    m.groupInviteMessage.groupJid = message.groupInvite.jid;
    m.groupInviteMessage.groupName = message.groupInvite.subject;
    if (options.getProfilePicUrl) {
      const pfpUrl = await options.getProfilePicUrl(message.groupInvite.jid, "preview");
      if (pfpUrl) {
        const resp = await fetch(pfpUrl, { method: "GET", dispatcher: options?.options?.dispatcher });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          if (options.upload) {
            try {
              const uploaded = await prepareWAMessageMedia({ image: buf }, { upload: options.upload });
              if (uploaded.imageMessage) {
                m.groupInviteMessage.jpegThumbnail = buf;
                m.groupInviteMessage.thumbnailDirectPath = uploaded.imageMessage.directPath;
                m.groupInviteMessage.thumbnailSha256 = uploaded.imageMessage.fileSha256;
                m.groupInviteMessage.thumbnailEncSha256 = uploaded.imageMessage.fileEncSha256;
                m.groupInviteMessage.mediaKey = uploaded.imageMessage.mediaKey;
              }
            } catch {
              m.groupInviteMessage.jpegThumbnail = buf;
            }
          } else {
            m.groupInviteMessage.jpegThumbnail = buf;
          }
        }
      }
    }
  } else if (hasNonNullishProperty(message, "stickers") || hasNonNullishProperty(message, "stickerPack")) {
    m.stickerPackMessage = await generateStickerPackMessage(message.stickerPack || message, options);
  } else if (hasNonNullishProperty(message, "pin")) {
    m.pinInChatMessage = {};
    m.messageContextInfo = {};
    m.pinInChatMessage.key = message.pin;
    m.pinInChatMessage.type = message.type;
    m.pinInChatMessage.senderTimestampMs = Date.now();
    m.messageContextInfo.messageAddOnDurationInSecs = message.type === 1 ? message.time || 86400 : 0;
  } else if (hasNonNullishProperty(message, "keep")) {
    m.keepInChatMessage = {};
    m.keepInChatMessage.key = message.keep;
    m.keepInChatMessage.keepType = message.type;
    m.keepInChatMessage.timestampMs = Date.now();
  } else if (hasNonNullishProperty(message, "flowReply")) {
    m.interactiveResponseMessage = { body: { format: message.flowReply.format || proto.Message.InteractiveResponseMessage.Body.Format.DEFAULT, text: message.flowReply.text }, nativeFlowResponseMessage: { name: message.flowReply.name, paramsJson: message.flowReply.paramsJson || "{}", version: message.flowReply.version || 1 } };
  } else if (hasNonNullishProperty(message, "buttonReply")) {
    switch (message.type) {
      case "template":
        m.templateButtonReplyMessage = { selectedDisplayText: message.buttonReply.displayText, selectedId: message.buttonReply.id, selectedIndex: message.buttonReply.index };
        break;
      case "plain":
        m.buttonsResponseMessage = { selectedButtonId: message.buttonReply.id, selectedDisplayText: message.buttonReply.displayText, type: proto.Message.ButtonsResponseMessage.Type.DISPLAY_TEXT };
        break;
    }
  } else if (hasNonNullishProperty(message, "listReply")) {
    m.listResponseMessage = { description: message.listReply.description, listType: proto.Message.ListResponseMessage.ListType.SINGLE_SELECT, singleSelectReply: { selectedRowId: message.listReply.id }, title: message.listReply.title };
  } else if (hasOptionalProperty(message, "ptv") && message.ptv) {
    const { videoMessage } = await prepareWAMessageMedia({ video: message.video }, options);
    m.ptvMessage = videoMessage;
  } else if (hasNonNullishProperty(message, "product")) {
    m.productMessage = await prepareProductMessage(message, options);
  } else if (hasNonNullishProperty(message, "event")) {
    m.eventMessage = {};
    const startTime = Math.floor(message.event.startDate.getTime() / 1e3);
    if (message.event.call && options.getCallLink) {
      const token = await options.getCallLink(message.event.call, { startTime });
      m.eventMessage.joinLink = (message.event.call === "audio" ? CALL_AUDIO_PREFIX : CALL_VIDEO_PREFIX) + token;
    }
    m.messageContextInfo = { messageSecret: message.event.messageSecret || randomBytes(32) };
    m.eventMessage.name = message.event.name;
    m.eventMessage.description = message.event.description;
    m.eventMessage.startTime = startTime;
    m.eventMessage.endTime = message.event.endDate ? message.event.endDate.getTime() / 1e3 : void 0;
    m.eventMessage.isCanceled = message.event.isCancelled ?? false;
    m.eventMessage.extraGuestsAllowed = message.event.extraGuestsAllowed;
    m.eventMessage.isScheduleCall = message.event.isScheduleCall ?? false;
    m.eventMessage.location = message.event.location;
  } else if (hasNonNullishProperty(message, "poll")) {
    (_a = message.poll).selectableCount || (_a.selectableCount = 0);
    (_b = message.poll).toAnnouncementGroup || (_b.toAnnouncementGroup = false);
    if (!Array.isArray(message.poll.values)) {
      throw new Boom("Invalid poll values", { statusCode: 400 });
    }
    if (message.poll.selectableCount < 0 || message.poll.selectableCount > message.poll.values.length) {
      throw new Boom(`poll.selectableCount in poll should be >= 0 and <= ${message.poll.values.length}`, { statusCode: 400 });
    }
    const pollCreationMessage = { name: message.poll.name, selectableOptionsCount: message.poll.selectableCount, options: message.poll.values.map((optionName) => ({ optionName })), endTime: message.poll.endDate ? message.poll.endDate.getTime() : void 0, hideParticipantName: message.poll.hideVoter ?? false, allowAddOption: message.poll.canAddOption ?? false };
    if (message.poll.toAnnouncementGroup) {
      m.pollCreationMessageV2 = pollCreationMessage;
    } else {
      if (message.poll.pollType === 1) {
        if (!message.poll.correctAnswer) {
          throw new Boom('No "correctAnswer" provided for quiz', { statusCode: 400 });
        }
        m.pollCreationMessageV5 = { ...pollCreationMessage, correctAnswer: { optionName: message.poll.correctAnswer.toString() }, pollType: 1, selectableOptionsCount: 1 };
      } else if (message.poll.selectableCount === 1) {
        m.pollCreationMessageV3 = pollCreationMessage;
      } else {
        m.pollCreationMessage = pollCreationMessage;
      }
    }
    m.messageContextInfo = { messageSecret: message.poll.messageSecret || randomBytes(32) };
  } else if (hasNonNullishProperty(message, "pollResult")) {
    const pollResultSnapshotMessage = { name: message.pollResult.name, pollVotes: message.pollResult.votes.map((vote) => ({ optionName: vote.name, optionVoteCount: parseInt(vote.voteCount) })) };
    if (message.pollResult.pollType === 1) {
      pollResultSnapshotMessage.pollType = proto.Message.PollType.QUIZ;
      m.pollResultSnapshotMessageV3 = pollResultSnapshotMessage;
    } else {
      pollResultSnapshotMessage.pollType = proto.Message.PollType.POLL;
      m.pollResultSnapshotMessage = pollResultSnapshotMessage;
    }
  } else if (hasNonNullishProperty(message, "pollUpdate")) {
    if (!message.pollUpdate.key) {
      throw new Boom("Message key is required", { statusCode: 400 });
    }
    if (!message.pollUpdate.vote) {
      throw new Boom("Encrypted vote payload is required", { statusCode: 400 });
    }
    m.pollUpdateMessage = { metadata: message.pollUpdate.metadata, pollCreationMessageKey: message.pollUpdate.key, senderTimestampMs: Date.now(), vote: message.pollUpdate.vote };
  } else if (hasNonNullishProperty(message, "paymentInviteServiceType")) {
    m.paymentInviteMessage = { expiryTimestamp: Date.now(), serviceType: message.paymentInviteServiceType };
  } else if (hasNonNullishProperty(message, "orderText")) {
    if (!Buffer.isBuffer(message.thumbnail)) {
      throw new Boom("Must provide thumbnail buffer in order message", { statusCode: 400 });
    }
    m.orderMessage = { itemCount: 1, messageVersion: 1, orderTitle: LIBRARY_NAME, status: proto.Message.OrderMessage.OrderStatus.INQUIRY, surface: proto.Message.OrderMessage.OrderSurface.CATALOG, token: generateMessageIDV2(), totalAmount1000: 1e3, totalCurrencyCode: "IDR", ...message, message: message.orderText };
    delete m.orderMessage.orderText;
  } else if (hasNonNullishProperty(message, "album")) {
    if (!Array.isArray(message.album)) {
      throw new Boom("Invalid album type. Expected an array.", { statusCode: 400 });
    }
    let videoCount = 0;
    for (let i = 0; i < message.album.length; i++) {
      if (message.album[i].video) videoCount++;
    }
    ;
    let imageCount = 0;
    for (let i = 0; i < message.album.length; i++) {
      if (message.album[i].image) imageCount++;
    }
    ;
    if (videoCount + imageCount < 2) {
      throw new Boom("Minimum provide 2 media to upload album message", { statusCode: 400 });
    }
    m.albumMessage = { expectedImageCount: imageCount, expectedVideoCount: videoCount };
  } else if (hasNonNullishProperty(message, "sharePhoneNumber")) {
    m.protocolMessage = { type: proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER };
  } else if (hasNonNullishProperty(message, "requestPhoneNumber")) {
    m.requestPhoneNumberMessage = {};
  } else if (hasNonNullishProperty(message, "limitSharing")) {
    m.protocolMessage = { type: proto.Message.ProtocolMessage.Type.LIMIT_SHARING, limitSharing: { sharingLimited: message.limitSharing === true, trigger: 1, limitSharingSettingTimestamp: Date.now(), initiatedByMe: true } };
  } else {
    m = await prepareWAMessageMedia(message, options);
  }
  if (hasNonNullishProperty(message, "buttons")) {
    const buttonsMessage = { buttons: message.buttons.map((button) => {
      const buttonText = button.text || button.buttonText;
      if (hasOptionalProperty(button, "sections")) {
        return { nativeFlowInfo: { name: "single_select", paramsJson: JSON.stringify({ title: buttonText, sections: button.sections }) }, type: ButtonType.NATIVE_FLOW };
      } else if (hasOptionalProperty(button, "name")) {
        return { nativeFlowInfo: { name: button.name, paramsJson: button.paramsJson }, type: ButtonType.NATIVE_FLOW };
      }
      return { buttonId: button.id || button.buttonId, buttonText: typeof buttonText === "string" ? { displayText: buttonText } : buttonText, type: button.type || ButtonType.RESPONSE };
    }) };
    if (hasOptionalProperty(message, "text")) {
      buttonsMessage.contentText = message.text;
      buttonsMessage.headerType = ButtonHeaderType.EMPTY;
    } else {
      if (hasOptionalProperty(message, "caption")) {
        buttonsMessage.contentText = message.caption;
      }
      const type = Object.keys(m)[0].replace("Message", "").toUpperCase();
      buttonsMessage.headerType = ButtonHeaderType[type];
      Object.assign(buttonsMessage, m);
    }
    if (hasOptionalProperty(message, "footer")) {
      buttonsMessage.footerText = message.footer;
    }
    m = { buttonsMessage };
  } else if (hasNonNullishProperty(message, "sections")) {
    const listMessage = { sections: message.sections, buttonText: message.buttonText, title: message.title, footerText: message.footer, description: message.text, listType: ListType.SINGLE_SELECT };
    m = { listMessage };
  } else if (hasNonNullishProperty(message, "templateButtons")) {
    const hydratedTemplate = { hydratedButtons: message.templateButtons.map((button, i) => {
      const buttonText = button.text || button.buttonText;
      if (hasOptionalProperty(button, "id")) {
        return { index: i, quickReplyButton: { displayText: buttonText || "👉🏻 Click", id: button.id } };
      } else if (hasOptionalProperty(button, "url")) {
        return { index: i, urlButton: { displayText: buttonText || "🌐 Visit", url: button.url } };
      } else if (hasOptionalProperty(button, "call")) {
        return { index: i, callButton: { displayText: buttonText || "📞 Call", phoneNumber: button.call } };
      }
      button.index = button.index || i;
      return button;
    }) };
    if (hasOptionalProperty(message, "text")) {
      hydratedTemplate.hydratedContentText = message.text;
    } else {
      if (hasOptionalProperty(message, "caption")) {
        hydratedTemplate.hydratedTitleText = message.title;
        hydratedTemplate.hydratedContentText = message.caption;
      }
      ;
      Object.assign(hydratedTemplate, m);
    }
    if (hasOptionalProperty(message, "footer")) {
      hydratedTemplate.hydratedFooterText = message.footer;
    }
    hydratedTemplate.templateId = message.id || "template-" + Date.now();
    m = { templateMessage: { hydratedFourRowTemplate: hydratedTemplate, hydratedTemplate } };
  } else if (hasNonNullishProperty(message, "nativeFlow")) {
    const interactiveMessage = { nativeFlowMessage: prepareNativeFlowButtons(message) };
    if (hasOptionalProperty(message, "bizJid")) {
      interactiveMessage.collectionMessage = { bizJid: message.bizJid, id: message.id, messageVersion: 1 };
    } else if (hasOptionalProperty(message, "shopSurface")) {
      interactiveMessage.shopStorefrontMessage = { surface: message.shopSurface, id: message.id, messageVersion: 1 };
    }
    if (hasOptionalProperty(message, "text")) {
      interactiveMessage.body = { text: message.text };
    } else {
      if (hasOptionalProperty(message, "caption")) {
        const isValidHeader = hasValidInteractiveHeader(m);
        if (!isValidHeader) {
          throw new Boom("Invalid media type for interactive message header", { statusCode: 400 });
        }
        interactiveMessage.header = { title: message.title || "", subtitle: message.subtitle || "", hasMediaAttachment: isValidHeader };
        interactiveMessage.body = { text: message.caption };
      }
      if (hasOptionalProperty(message, "thumbnail") && !!message.thumbnail) {
        interactiveMessage.jpegThumbnail = message.thumbnail;
      }
      Object.assign(interactiveMessage.header, m);
    }
    if (hasOptionalProperty(message, "audioFooter")) {
      const { audioMessage } = await prepareWAMessageMedia({ audio: message.audioFooter }, options);
      interactiveMessage.footer = { audioMessage, hasMediaAttachment: true };
    } else if (hasOptionalProperty(message, "footer")) {
      interactiveMessage.footer = { text: message.footer };
    }
    m = { interactiveMessage };
  } else if (hasNonNullishProperty(message, "cards")) {
    const interactiveMessage = { carouselMessage: { cards: await Promise.all(message.cards.map(async (card) => {
      let carouselHeader = {};
      if (hasNonNullishProperty(card, "product")) {
        carouselHeader.productMessage = await prepareProductMessage(card, options);
      } else {
        carouselHeader = await prepareWAMessageMedia(card, options).catch(() => ({}));
      }
      const isValidHeader = hasValidCarouselHeader(carouselHeader);
      if (!isValidHeader) {
        throw new Boom("Invalid media type for carousel card", { statusCode: 400 });
      }
      const carouselCard = { nativeFlowMessage: prepareNativeFlowButtons(card.nativeFlow ? card : []) };
      if (hasOptionalProperty(card, "text")) {
        carouselCard.body = { text: card.text };
      } else {
        if (hasOptionalProperty(card, "caption")) {
          carouselCard.header = { title: card.title || "", subtitle: card.subtitle || "", hasMediaAttachment: isValidHeader };
          carouselCard.body = { text: card.caption };
        }
        if (hasOptionalProperty(card, "thumbnail") && !!card.thumbnail) {
          carouselCard.jpegThumbnail = card.thumbnail;
        }
        Object.assign(carouselCard.header, carouselHeader);
      }
      if (hasOptionalProperty(card, "audioFooter")) {
        const { audioMessage } = await prepareWAMessageMedia({ audio: card.audioFooter }, options);
        carouselCard.footer = { audioMessage, hasMediaAttachment: true };
      } else if (hasOptionalProperty(card, "footer")) {
        carouselCard.footer = { text: card.footer };
      }
      if (hasNonNullishProperty(card, "contextInfo")) {
        carouselCard.contextInfo = card.contextInfo;
      }
      return carouselCard;
    })), carouselCardType: CarouselCardType.UNKNOWN, messageVersion: 1 } };
    if (hasOptionalProperty(message, "text")) {
      interactiveMessage.body = { text: message.text };
    }
    if (hasOptionalProperty(message, "footer")) {
      interactiveMessage.footer = { text: message.footer };
    }
    m = { interactiveMessage };
  } else if (hasNonNullishProperty(message, "requestPaymentFrom")) {
    const requestPaymentMessage = { amount: { currencyCode: "IDR", offset: 1e3, value: 1e3 }, amount1000: 1e3, currencyCodeIso4217: "IDR", expiryTimestamp: Date.now(), noteMessage: m, requestFrom: message.requestPaymentFrom, ...message };
    delete requestPaymentMessage.requestPaymentFrom;
    if (hasNonNullishProperty(m, "extendedTextMessage") || hasNonNullishProperty(m, "stickerMessage")) {
      Object.assign(requestPaymentMessage.noteMessage, m);
    } else {
      throw new Boom("Invalid message type for request payment note message", { statusCode: 400 });
    }
    m = { requestPaymentMessage };
  } else if (hasNonNullishProperty(message, "invoiceNote")) {
    const attachment = m.imageMessage || m.documentMessage;
    const type = Object.keys(m)[0].replace("Message", "").toUpperCase();
    const invoiceMessage = { attachmentType: proto.Message.InvoiceMessage.AttachmentType[type === "DOCUMENT" ? "PDF" : "IMAGE"], note: message.invoiceNote };
    if (attachment) {
      const { directPath, fileEncSha256, fileSha256, jpegThumbnail = void 0, mediaKey, mediaKeyTimestamp, mimetype } = attachment;
      Object.assign(invoiceMessage, { attachmentDirectPath: directPath, attachmentFileEncSha256: fileEncSha256, attachmentFileSha256: fileSha256, attachmentJpegThumbnail: jpegThumbnail, attachmentMediaKey: mediaKey, attachmentMediaKeyTimestamp: mediaKeyTimestamp, attachmentMimetype: mimetype, token: generateMessageIDV2() });
    } else {
      throw new Boom("Invalid media type for invoice message", { statusCode: 400 });
    }
    m = { invoiceMessage };
  }
  if (hasOptionalProperty(message, "externalAdReply") && !!message.externalAdReply) {
    const messageType = Object.keys(m)[0];
    const key = m[messageType];
    const content = message.externalAdReply;
    if ("thumbnail" in content && !Buffer.isBuffer(content.thumbnail)) {
      throw new Boom("Thumbnail must in buffer type", { statusCode: 400 });
    }
    if (!content.url || typeof content.url !== "string") {
      content.url = DONATE_URL || "";
    }
    const externalAdReply = { ...content, body: content.body, mediaType: content.mediaType || 1, mediaUrl: content.url, renderLargerThumbnail: content.largeThumbnail, sourceUrl: content.url, thumbnail: content.thumbnail, thumbnailUrl: content.url + "?update=" + Date.now(), title: content.title || LIBRARY_NAME };
    delete externalAdReply.subTitle;
    delete externalAdReply.largeThumbnail;
    delete externalAdReply.url;
    if ("contextInfo" in key && !!key.contextInfo) {
      key.contextInfo.externalAdReply = { ...key.contextInfo.externalAdReply, ...externalAdReply };
    } else if (key) {
      key.contextInfo = { externalAdReply };
    }
  }
  if (hasOptionalProperty(message, "mentions") && message.mentions?.length || hasOptionalProperty(message, "mentionAll") && message.mentionAll) {
    const messageType = Object.keys(m)[0];
    const key = m[messageType];
    if (key && "contextInfo" in key) {
      key.contextInfo = key.contextInfo || {};
      if (message.mentions?.length) {
        key.contextInfo.mentionedJid = message.mentions;
      }
      if (message.mentionAll) {
        key.contextInfo.nonJidMentions = 1;
      }
    } else if (key) {
      key.contextInfo = { mentionedJid: message.mentions, nonJidMentions: message.mentionAll ? 1 : 0 };
    }
  }
  if (hasOptionalProperty(message, "contextInfo") && !!message.contextInfo) {
    const messageType = Object.keys(m)[0];
    const key = m[messageType];
    if ("contextInfo" in key && !!key.contextInfo) {
      key.contextInfo = { ...key.contextInfo, ...message.contextInfo };
    } else if (key) {
      key.contextInfo = message.contextInfo;
    }
  }
  if (hasOptionalProperty(message, "groupStatus") && !!message.groupStatus) {
    const messageType = Object.keys(m)[0];
    const key = m[messageType];
    if ("contextInfo" in key && !!key.contextInfo) {
      key.contextInfo.isGroupStatus = message.groupStatus;
    } else if (key) {
      key.contextInfo = { isGroupStatus: message.groupStatus };
    }
    if (messageType === "audioMessage") {
      m = { groupStatusMessage: { message: m } };
    } else {
      m = { groupStatusMessageV2: { message: m } };
    }
    delete message.groupStatus;
  }
  if (hasOptionalProperty(message, "spoiler") && !!message.spoiler) {
    const messageType = Object.keys(m)[0];
    const key = m[messageType];
    if ("contextInfo" in key && !!key.contextInfo) {
      key.contextInfo.isSpoiler = message.spoiler;
    } else if (key) {
      key.contextInfo = { isSpoiler: message.spoiler };
    }
    m = { spoilerMessage: { message: m } };
    delete message.spoiler;
  } else if (hasOptionalProperty(message, "interactiveAsTemplate") && !!message.interactiveAsTemplate) {
    if (!m.interactiveMessage) {
      throw new Boom("Invalid message type for template", { statusCode: 400 });
    }
    m = { templateMessage: { interactiveMessageTemplate: m.interactiveMessage, templateId: message.id || "template-" + Date.now() } };
    delete message.interactiveAsTemplate;
  }
  if (hasOptionalProperty(message, "ephemeral") && !!message.ephemeral) {
    m = { ephemeralMessage: { message: m } };
    delete message.ephemeral;
  }
  if (hasOptionalProperty(message, "isLottie") && !!message.isLottie) {
    m = { lottieStickerMessage: { message: m } };
  } else if (hasOptionalProperty(message, "viewOnce") && !!message.viewOnce) {
    m = { viewOnceMessage: { message: m } };
  } else if (hasOptionalProperty(message, "viewOnceV2") && !!message.viewOnceV2) {
    m = { viewOnceMessageV2: { message: m } };
    delete message.viewOnceV2;
  } else if (hasOptionalProperty(message, "viewOnceV2Extension") && !!message.viewOnceV2Extension) {
    m = { viewOnceMessageV2Extension: { message: m } };
    delete message.viewOnceV2Extension;
  }
  if (hasOptionalProperty(message, "edit")) {
    m = { protocolMessage: { key: message.edit, editedMessage: m, timestampMs: Date.now(), type: WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT } };
  }
  if (shouldIncludeReportingToken(m)) {
    m.messageContextInfo = m.messageContextInfo || {};
    if (!m.messageContextInfo.messageSecret) {
      m.messageContextInfo.messageSecret = randomBytes(32);
    }
  }
  return WAProto.Message.create(m);
};
const generateWAMessageFromContent = (jid, message, options) => {
  if (!options.timestamp) {
    options.timestamp = new Date();
  }
  const innerMessage = normalizeMessageContent(message);
  const messageContextInfo = message.messageContextInfo;
  const key = getContentType(innerMessage);
  const timestamp = unixTimestampSeconds(options.timestamp);
  const isNewsletter = isJidNewsletter(jid);
  const { quoted, userJid } = options;
  if (quoted) {
    const participant = quoted.key.fromMe ? userJid : quoted.participant || quoted.key.participant || quoted.key.remoteJid;
    let quotedMsg = normalizeMessageContent(quoted.message);
    const msgType = getContentType(quotedMsg);
    quotedMsg = proto.Message.create({ [msgType]: quotedMsg[msgType] });
    const quotedContent = quotedMsg[msgType];
    if (typeof quotedContent === "object" && quotedContent && "contextInfo" in quotedContent) {
      delete quotedContent.contextInfo;
    }
    const contextInfo = "contextInfo" in innerMessage[key] && innerMessage[key]?.contextInfo || {};
    contextInfo.participant = jidNormalizedUser(participant);
    contextInfo.stanzaId = quoted.key.id;
    contextInfo.quotedMessage = quotedMsg;
    if (!isNewsletter && jid !== quoted.key.remoteJid) {
      contextInfo.remoteJid = quoted.key.remoteJid;
    }
    if (contextInfo && innerMessage[key]) {
      innerMessage[key].contextInfo = contextInfo;
    }
  }
  if (!!options?.ephemeralExpiration && key !== "protocolMessage" && key !== "ephemeralMessage" && !isNewsletter) {
    innerMessage[key].contextInfo = { ...innerMessage[key].contextInfo || {}, expiration: options.ephemeralExpiration || WA_DEFAULT_EPHEMERAL };
  }
  if (messageContextInfo?.messageSecret && (isPnUser(jid) || isLidUser(jid))) {
    messageContextInfo.deviceListMetadata = { recipientKeyHash: randomBytes(10), recipientTimestamp: unixTimestampSeconds() };
    messageContextInfo.deviceListMetadataVersion = 2;
  }
  message = WAProto.Message.create(message);
  const messageJSON = { key: { remoteJid: jid, fromMe: true, id: options?.messageId || generateMessageIDV2() }, message, messageTimestamp: timestamp, messageStubParameters: [], participant: isJidGroup(jid) || isJidStatusBroadcast(jid) ? userJid : void 0, status: WAMessageStatus.PENDING };
  return WAProto.WebMessageInfo.fromObject(messageJSON);
};
const prepareMessageFromContent = generateWAMessageFromContent;
const generateWAMessage = async (jid, content, options) => {
  options.logger = options?.logger?.child({ msgId: options.messageId });
  if (jid) {
    options.jid = jid;
  }
  return generateWAMessageFromContent(jid, await generateWAMessageContent(content, options), options);
};
const getContentType = (content) => {
  if (content) {
    const keys = Object.keys(content);
    const key = keys.find((k) => (k === "conversation" || k.includes("Message")) && k !== "senderKeyDistributionMessage");
    return key;
  }
};
const normalizeMessageContent = (content) => {
  if (!content) {
    return void 0;
  }
  for (let i = 0; i < 5; i++) {
    const inner = getFutureProofMessage(content);
    if (!inner) {
      break;
    }
    content = inner.message;
  }
  return content;
  function getFutureProofMessage(message) {
    return message?.associatedChildMessage || message?.botForwardedMessage || message?.botInvokeMessage || message?.botTaskMessage || message?.documentWithCaptionMessage || message?.editedMessage || message?.ephemeralMessage || message?.eventCoverImage || message?.groupMentionedMessage || message?.groupStatusMentionMessage || message?.groupStatusMessage || message?.groupStatusMessageV2 || message?.limitSharingMessage || message?.lottieStickerMessage || message?.newsletterAdminProfileMessage || message?.newsletterAdminProfileMessageV2 || message?.newsletterAdminProfileStatusMessage || message?.pollCreationMessageV4 || message?.pollCreationOptionImageMessage || message?.questionMessage || message?.questionReplyMessage || message?.spoilerMessage || message?.statusAddYours || message?.statusMentionMessage || message?.viewOnceMessage || message?.viewOnceMessageV2 || message?.viewOnceMessageV2Extension;
  }
};
const extractMessageContent = (content) => {
  const extractFromTemplateMessage = (msg) => {
    if (msg.imageMessage) {
      return { imageMessage: msg.imageMessage };
    } else if (msg.documentMessage) {
      return { documentMessage: msg.documentMessage };
    } else if (msg.videoMessage) {
      return { videoMessage: msg.videoMessage };
    } else if (msg.locationMessage) {
      return { locationMessage: msg.locationMessage };
    } else {
      return { conversation: "contentText" in msg ? msg.contentText : "hydratedContentText" in msg ? msg.hydratedContentText : "" };
    }
  };
  content = normalizeMessageContent(content);
  if (content?.buttonsMessage) {
    return extractFromTemplateMessage(content.buttonsMessage);
  }
  if (content?.templateMessage?.hydratedFourRowTemplate) {
    return extractFromTemplateMessage(content?.templateMessage?.hydratedFourRowTemplate);
  }
  if (content?.templateMessage?.hydratedTemplate) {
    return extractFromTemplateMessage(content?.templateMessage?.hydratedTemplate);
  }
  if (content?.templateMessage?.fourRowTemplate) {
    return extractFromTemplateMessage(content?.templateMessage?.fourRowTemplate);
  }
  return content;
};
const getDevice = (id) => /^3A.{18}$/.test(id) ? "ios" : /^3E.{20}$/.test(id) ? "web" : /^(.{21}|.{32})$/.test(id) ? "android" : /^(3F|.{18}$)/.test(id) ? "desktop" : "unknown";
const updateMessageWithReceipt = (msg, receipt) => {
  msg.userReceipt = msg.userReceipt || [];
  const recp = msg.userReceipt.find((m) => m.userJid === receipt.userJid);
  if (recp) {
    Object.assign(recp, receipt);
  } else {
    msg.userReceipt.push(receipt);
  }
};
const updateMessageWithReaction = (msg, reaction) => {
  const authorID = getKeyAuthor(reaction.key);
  const reactions = (msg.reactions || []).filter((r) => getKeyAuthor(r.key) !== authorID);
  reaction.text = reaction.text || "";
  reactions.push(reaction);
  msg.reactions = reactions;
};
const updateMessageWithPollUpdate = (msg, update) => {
  const authorID = getKeyAuthor(update.pollUpdateMessageKey);
  const reactions = (msg.pollUpdates || []).filter((r) => getKeyAuthor(r.pollUpdateMessageKey) !== authorID);
  if (update.vote?.selectedOptions?.length) {
    reactions.push(update);
  }
  msg.pollUpdates = reactions;
};
const updateMessageWithEventResponse = (msg, update) => {
  const authorID = getKeyAuthor(update.eventResponseMessageKey);
  const responses = (msg.eventResponses || []).filter((r) => getKeyAuthor(r.eventResponseMessageKey) !== authorID);
  responses.push(update);
  msg.eventResponses = responses;
};
function getAggregateVotesInPollMessage({ message, pollUpdates }, meId) {
  const opts = message?.pollCreationMessage?.options || message?.pollCreationMessageV2?.options || message?.pollCreationMessageV3?.options || [];
  const voteHashMap = opts.reduce((acc, opt) => {
    const hash = sha256(Buffer.from(opt.optionName || "")).toString();
    acc[hash] = { name: opt.optionName || "", voters: [] };
    return acc;
  }, {});
  for (const update of pollUpdates || []) {
    const { vote } = update;
    if (!vote) {
      continue;
    }
    for (const option of vote.selectedOptions || []) {
      const hash = option.toString();
      let data = voteHashMap[hash];
      if (!data) {
        voteHashMap[hash] = { name: "Unknown", voters: [] };
        data = voteHashMap[hash];
      }
      voteHashMap[hash].voters.push(getKeyAuthor(update.pollUpdateMessageKey, meId));
    }
  }
  return Object.values(voteHashMap);
}
function getAggregateResponsesInEventMessage({ eventResponses }, meId) {
  const responseTypes = ["GOING", "NOT_GOING", "MAYBE"];
  const responseMap = {};
  for (const type of responseTypes) {
    responseMap[type] = { response: type, responders: [] };
  }
  for (const update of eventResponses || []) {
    const responseType = update.eventResponse || "UNKNOWN";
    if (responseType !== "UNKNOWN" && responseMap[responseType]) {
      responseMap[responseType].responders.push(getKeyAuthor(update.eventResponseMessageKey, meId));
    }
  }
  return Object.values(responseMap);
}
const aggregateMessageKeysNotFromMe = (keys) => {
  const keyMap = {};
  for (const { remoteJid, id, participant, fromMe } of keys) {
    if (!fromMe) {
      const uqKey = `${remoteJid}:${participant || ""}`;
      if (!keyMap[uqKey]) {
        keyMap[uqKey] = { jid: remoteJid, participant, messageIds: [] };
      }
      keyMap[uqKey].messageIds.push(id);
    }
  }
  return Object.values(keyMap);
};
const REUPLOAD_REQUIRED_STATUS = [410, 404];
const downloadMediaMessage = async (message, type, options, ctx) => {
  const result = await downloadMsg().catch(async (error) => {
    if (ctx && typeof error?.status === "number" && REUPLOAD_REQUIRED_STATUS.includes(error.status)) {
      ctx.logger.info({ key: message.key }, "sending reupload media request...");
      message = await ctx.reuploadRequest(message);
      const result2 = await downloadMsg();
      return result2;
    }
    throw error;
  });
  return result;
  async function downloadMsg() {
    const mContent = extractMessageContent(message.message);
    if (!mContent) {
      throw new Boom("No message present", { statusCode: 400, data: message });
    }
    const contentType = getContentType(mContent);
    let mediaType = contentType?.replace("Message", "");
    const media = mContent[contentType];
    if (!media || typeof media !== "object" || !("url" in media) && !("thumbnailDirectPath" in media)) {
      throw new Boom(`"${contentType}" message is not a media message`);
    }
    let download;
    if ("thumbnailDirectPath" in media && !("url" in media)) {
      download = { directPath: media.thumbnailDirectPath, mediaKey: media.mediaKey };
      mediaType = "thumbnail-link";
    } else {
      download = media;
    }
    const stream = await downloadContentFromMessage(download, mediaType, options);
    if (type === "buffer") {
      const bufferArray = [];
      for await (const chunk of stream) {
        bufferArray.push(chunk);
      }
      return Buffer.concat(bufferArray);
    }
    return stream;
  }
};
const assertMediaContent = (content) => {
  content = extractMessageContent(content);
  const mediaContent = content?.documentMessage || content?.imageMessage || content?.videoMessage || content?.audioMessage || content?.stickerMessage;
  if (!mediaContent) {
    throw new Boom("given message is not a media message", { statusCode: 400, data: content });
  }
  return mediaContent;
};
const isAnimatedWebP = (buffer) => {
  if (buffer.length < 12 || buffer[0] !== 82 || buffer[1] !== 73 || buffer[2] !== 70 || buffer[3] !== 70 || buffer[8] !== 87 || buffer[9] !== 69 || buffer[10] !== 66 || buffer[11] !== 80) {
    return false;
  }
  ;
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkFourCC = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkFourCC === "VP8X") {
      const flagsOffset = offset + 8;
      if (flagsOffset < buffer.length) {
        const flags = buffer[flagsOffset];
        if (flags & 2) {
          return true;
        }
        ;
      }
      ;
    } else if (chunkFourCC === "ANIM" || chunkFourCC === "ANMF") {
      return true;
    }
    ;
    offset += 8 + chunkSize + chunkSize % 2;
  }
  ;
  return false;
};
const isWebPBuffer = (buffer) => {
  return buffer.length >= 12 && buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80;
};
const shouldIncludeBizBinaryNode = (message) => !!(message.buttonsMessage || message.listMessage || message.templateMessage || message.interactiveMessage && message.interactiveMessage.nativeFlowMessage);
export {
  aggregateMessageKeysNotFromMe,
  assertMediaContent,
  downloadMediaMessage,
  extractMessageContent,
  extractUrlFromText,
  generateForwardMessageContent,
  generateLinkPreviewIfRequired,
  generateStickerPackMessage,
  generateWAMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  getAggregateResponsesInEventMessage,
  getAggregateVotesInPollMessage,
  getContentType,
  getDevice,
  hasNonNullishProperty,
  hasOptionalProperty,
  hasValidAlbumMedia,
  hasValidCarouselHeader,
  hasValidInteractiveHeader,
  normalizeMessageContent,
  prepareDisappearingMessageSettingContent,
  prepareMessageFromContent,
  prepareWAMessageMedia,
  shouldIncludeBizBinaryNode,
  updateMessageWithEventResponse,
  updateMessageWithPollUpdate,
  updateMessageWithReaction,
  updateMessageWithReceipt
};
