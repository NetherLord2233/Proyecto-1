import { Boom } from "@hapi/boom";
import { spawn } from "child_process";
import * as Crypto from "crypto";
import { once } from "events";
import { createReadStream, createWriteStream, promises as fs, WriteStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable, Transform } from "stream";
import { URL } from "url";
import { proto } from "../../WAProto/index.js";
import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP } from "../Defaults/index.js";
import { getBinaryNodeChild, getBinaryNodeChildBuffer, jidNormalizedUser } from "../WABinary/index.js";
import { aesDecryptGCM, aesEncryptGCM, hkdf } from "./crypto.js";
import { generateMessageIDV2 } from "./generics.js";
const getTmpFilesDirectory = () => tmpdir();
let imageProcessingLibrary;
let _imageLibInitPromise = null;
const getImageProcessingLibrary = async () => {
  if (imageProcessingLibrary) {
    return imageProcessingLibrary;
  }
  if (!_imageLibInitPromise) {
    _imageLibInitPromise = (async () => {
      const [sharp, image, jimp] = await Promise.all([import("sharp").catch(() => {
      }), import("@napi-rs/image").catch(() => {
      }), import("jimp").catch(() => {
      })]);
      if (sharp) {
        imageProcessingLibrary = { sharp };
      } else if (image) {
        imageProcessingLibrary = { image };
      } else if (jimp) {
        imageProcessingLibrary = { jimp };
      } else {
        throw new Boom("No image processing library available");
      }
      return imageProcessingLibrary;
    })();
  }
  return _imageLibInitPromise;
};
const hkdfInfoKey = (type) => {
  const hkdfInfo = MEDIA_HKDF_KEY_MAPPING[type];
  return `WhatsApp ${hkdfInfo} Keys`;
};
const getRawMediaUploadData = async (media, mediaType, logger) => {
  const { stream } = await getStream(media);
  logger?.debug("got stream for raw upload");
  const hasher = Crypto.createHash("sha256");
  const filePath = join(tmpdir(), mediaType + generateMessageIDV2());
  const fileWriteStream = createWriteStream(filePath);
  let streamError = null;
  fileWriteStream.on("error", (err) => {
    streamError = streamError || err;
  });
  let fileLength = 0;
  try {
    for await (const data of stream) {
      if (streamError) throw streamError;
      fileLength += data.length;
      hasher.update(data);
      if (!fileWriteStream.destroyed && !fileWriteStream.write(data)) {
        await Promise.race([once(fileWriteStream, "drain"), once(fileWriteStream, "error").then(() => {})]);
        if (streamError) throw streamError;
      }
    }
    if (streamError) throw streamError;
    fileWriteStream.end();
    await once(fileWriteStream, "finish");
    stream.destroy();
    const fileSha256 = hasher.digest();
    logger?.debug("hashed data for raw upload");
    return { filePath, fileSha256, fileLength };
  } catch (error) {
    if (!fileWriteStream.destroyed) fileWriteStream.destroy();
    stream.destroy();
    try {
      await fs.unlink(filePath);
    } catch {
    }
    throw streamError || error;
  }
};
async function getMediaKeys(buffer, mediaType) {
  if (!buffer) {
    throw new Boom("Cannot derive from empty media key");
  }
  if (typeof buffer === "string") {
    buffer = Buffer.from(buffer.replace("data:;base64,", ""), "base64");
  }
  const expandedMediaKey = hkdf(buffer, 112, { info: hkdfInfoKey(mediaType) });
  return { iv: expandedMediaKey.slice(0, 16), cipherKey: expandedMediaKey.slice(16, 48), macKey: expandedMediaKey.slice(48, 80) };
}
const extractVideoThumb = async (path, time, size) => {
  const ffmpeg = spawn("ffmpeg", ["-loglevel", "error", "-ss", String(time), "-i", path, "-an", "-sn", "-dn", "-map_metadata", "-1", "-vf", `scale=${size.width}:-1`, "-frames:v", "1", "-c:v", "mjpeg", "-f", "image2pipe", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
  let buffer = Buffer.alloc(0);
  const stderrChunks = [];
  ffmpeg.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
  });
  ffmpeg.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  const [code] = await once(ffmpeg, "close");
  if (code !== 0) {
    throw new Boom(`FFmpeg failed (code ${code}):
` + Buffer.concat(stderrChunks).toString("utf8"));
  }
  return buffer;
};
const extractImageThumb = async (bufferOrFilePath, width = 32) => {
  if (bufferOrFilePath instanceof Readable) {
    bufferOrFilePath = await toBuffer(bufferOrFilePath);
  }
  const lib = await getImageProcessingLibrary();
  if ("sharp" in lib && lib.sharp?.default) {
    const img = lib.sharp.default(bufferOrFilePath);
    const dimensions = await img.metadata();
    const buffer = await img.resize(width).jpeg({ quality: 50 }).toBuffer();
    return { buffer, original: { width: dimensions.width, height: dimensions.height } };
  } else if ("image" in lib && lib.image?.Transformer) {
    if (!Buffer.isBuffer(bufferOrFilePath)) {
      bufferOrFilePath = await fs.readFile(bufferOrFilePath);
    }
    const img = new lib.image.Transformer(bufferOrFilePath);
    const dimensions = await img.metadata();
    const buffer = await img.resize(width, void 0, 0).jpeg(50);
    return { buffer, original: { width: dimensions.width, height: dimensions.height } };
  } else if ("jimp" in lib && lib.jimp?.Jimp) {
    const jimp = await lib.jimp.Jimp.read(bufferOrFilePath);
    const dimensions = { width: jimp.width, height: jimp.height };
    const buffer = await jimp.resize({ w: width, mode: lib.jimp.ResizeStrategy.BILINEAR }).getBuffer("image/jpeg", { quality: 50 });
    return { buffer, original: dimensions };
  } else {
    throw new Boom("No image processing library available");
  }
};
const encodeBase64EncodedStringForUpload = (b64) => encodeURIComponent(b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, ""));
const generateProfilePicture = async (mediaUpload, dimensions, opts) => {
  let buffer;
  const { full = true } = opts || {};
  const { width: w = full ? 720 : 640, height: h = full ? 720 : 640 } = dimensions || {};
  if (Buffer.isBuffer(mediaUpload)) {
    buffer = mediaUpload;
  } else {
    const { stream } = await getStream(mediaUpload);
    buffer = await toBuffer(stream);
  }
  const lib = await getImageProcessingLibrary();
  let img;
  if ("sharp" in lib && lib.sharp?.default) {
    img = lib.sharp.default(buffer).resize(w, h, full ? { fit: "inside", withoutEnlargement: false } : void 0).jpeg({ quality: full ? 100 : 80 }).toBuffer();
  } else if ("image" in lib && lib.image?.Transformer) {
    const transformer = new lib.image.Transformer(buffer);
    if (full) {
      img = transformer.resize(w, h).jpeg(100);
    } else {
      img = transformer.resize(w, h, 0).jpeg(80);
    }
  } else if ("jimp" in lib && lib.jimp?.Jimp) {
    const jimp = await lib.jimp.Jimp.read(buffer);
    let resized;
    if (full) {
      const scale = Math.min(w / jimp.width, h / jimp.height, 1);
      const targetW = Math.max(1, Math.round(jimp.width * scale));
      const targetH = Math.max(1, Math.round(jimp.height * scale));
      resized = jimp.resize({ w: targetW, h: targetH, mode: lib.jimp.ResizeStrategy.BILINEAR });
    } else {
      const min = Math.min(jimp.width, jimp.height);
      const cropped = jimp.crop({ x: 0, y: 0, w: min, h: min });
      resized = cropped.resize({ w, h, mode: lib.jimp.ResizeStrategy.BILINEAR });
    }
    img = resized.getBuffer("image/jpeg", { quality: full ? 100 : 80 });
  } else {
    throw new Boom("No image processing library available");
  }
  return { img: await img };
};
const mediaMessageSHA256B64 = (message) => {
  const media = Object.values(message)[0];
  return media?.fileSha256 && Buffer.from(media.fileSha256).toString("base64");
};
async function getAudioDuration(buffer) {
  const musicMetadata = await import("music-metadata");
  let metadata;
  const options = { duration: true };
  if (Buffer.isBuffer(buffer)) {
    metadata = await musicMetadata.parseBuffer(buffer, void 0, options);
  } else if (typeof buffer === "string") {
    metadata = await musicMetadata.parseFile(buffer, options);
  } else {
    metadata = await musicMetadata.parseStream(buffer, void 0, options);
  }
  return metadata.format.duration;
}
async function getAudioWaveform(buffer, logger) {
  try {
    const { default: decoder } = await import("audio-decode");
    let audioData;
    if (Buffer.isBuffer(buffer)) {
      audioData = buffer;
    } else if (typeof buffer === "string") {
      const rStream = createReadStream(buffer);
      audioData = await toBuffer(rStream);
    } else {
      audioData = await toBuffer(buffer);
    }
    const audioBuffer = await decoder(audioData);
    const rawData = audioBuffer.getChannelData(0);
    const samples = 64;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];
    for (let i = 0; i < samples; i++) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum = sum + Math.abs(rawData[blockStart + j]);
      }
      filteredData.push(sum / blockSize);
    }
    const multiplier = Math.pow(Math.max(...filteredData), -1);
    const normalizedData = filteredData.map((n) => n * multiplier);
    const waveform = new Uint8Array(normalizedData.map((n) => Math.floor(100 * n)));
    return waveform;
  } catch (e) {
    logger?.debug("Failed to generate waveform: " + e);
  }
}
const toReadable = (buffer) => {
  const readable = new Readable({ read: () => {
  } });
  readable.push(buffer);
  readable.push(null);
  return readable;
};
const toBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  stream.destroy();
  return Buffer.concat(chunks);
};
const getStream = async (item, opts) => {
  if (Buffer.isBuffer(item)) {
    return { stream: toReadable(item), type: "buffer" };
  }
  if ("stream" in item) {
    return { stream: item.stream, type: "readable" };
  }
  const urlStr = item.url.toString();
  if (urlStr.startsWith("data:")) {
    const buffer = Buffer.from(urlStr.split(",")[1], "base64");
    return { stream: toReadable(buffer), type: "buffer" };
  }
  if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
    return { stream: await getHttpStream(item.url, opts), type: "remote" };
  }
  return { stream: createReadStream(item.url), type: "file" };
};
async function generateThumbnail(file, mediaType, options) {
  let thumbnail;
  let originalImageDimensions;
  if (mediaType === "image") {
    const { buffer, original } = await extractImageThumb(file);
    thumbnail = buffer.toString("base64");
    if (original.width && original.height) {
      originalImageDimensions = { width: original.width, height: original.height };
    }
  } else if (mediaType === "video") {
    try {
      const buff = await extractVideoThumb(file, "00:00:00", { width: 32, height: 32 });
      thumbnail = buff.toString("base64");
    } catch (err) {
      options.logger?.debug("could not generate video thumb: " + err);
    }
  }
  return { thumbnail, originalImageDimensions };
}
const getHttpStream = async (url, options = {}) => {
  const response = await fetch(url.toString(), { dispatcher: options.dispatcher, method: "GET", headers: options.headers, signal: AbortSignal.timeout(options.timeoutMs || 9e5) });
  if (!response.ok) {
    throw new Boom(`Failed to fetch stream from ${url}`, { statusCode: response.status, data: { url } });
  }
  return response.body instanceof Readable ? response.body : Readable.fromWeb(response.body);
};
const encryptedStream = async (media, mediaType, { logger, saveOriginalFileIfRequired, opts } = {}) => {
  const { stream, type } = await getStream(media, opts);
  logger?.debug("fetched media stream");
  const mediaKey = Crypto.randomBytes(32);
  const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, mediaType);
  const encFilePath = join(getTmpFilesDirectory(), mediaType + generateMessageIDV2() + "-enc");
  const encFileWriteStream = createWriteStream(encFilePath);
  let originalFileStream;
  let originalFilePath;
  let streamError = null;
  const onStreamError = (err) => {
    streamError = streamError || err;
  };
  encFileWriteStream.on("error", onStreamError);
  if (saveOriginalFileIfRequired) {
    originalFilePath = join(getTmpFilesDirectory(), mediaType + generateMessageIDV2() + "-original");
    originalFileStream = createWriteStream(originalFilePath);
    originalFileStream.on("error", onStreamError);
  }
  let fileLength = 0;
  const aes = Crypto.createCipheriv("aes-256-cbc", cipherKey, iv);
  const hmac = Crypto.createHmac("sha256", macKey).update(iv);
  const sha256Plain = Crypto.createHash("sha256");
  const sha256Enc = Crypto.createHash("sha256");
  const safeWrite = async (writeStream, buff) => {
    if (!writeStream || writeStream.destroyed || streamError) return;
    if (!writeStream.write(buff)) {
      await Promise.race([once(writeStream, "drain"), once(writeStream, "error").then(() => {})]);
    }
  };
  const onChunk = async (buff) => {
    sha256Enc.update(buff);
    hmac.update(buff);
    await safeWrite(encFileWriteStream, buff);
  };
  try {
    for await (const data of stream) {
      if (streamError) throw streamError;
      fileLength += data.length;
      if (type === "remote" && opts?.maxContentLength && fileLength + data.length > opts.maxContentLength) {
        throw new Boom(`content length exceeded when encrypting "${type}"`, { data: { media, type } });
      }
      await safeWrite(originalFileStream, data);
      sha256Plain.update(data);
      await onChunk(aes.update(data));
      if (streamError) throw streamError;
    }
    await onChunk(aes.final());
    if (streamError) throw streamError;
    const mac = hmac.digest().slice(0, 10);
    sha256Enc.update(mac);
    const fileSha256 = sha256Plain.digest();
    const fileEncSha256 = sha256Enc.digest();
    await safeWrite(encFileWriteStream, mac);
    if (streamError) throw streamError;
    const encFinishPromise = once(encFileWriteStream, "finish");
    const originalFinishPromise = originalFileStream ? once(originalFileStream, "finish") : Promise.resolve();
    encFileWriteStream.end();
    originalFileStream?.end?.();
    stream.destroy();
    await encFinishPromise;
    await originalFinishPromise;
    logger?.debug("encrypted data successfully");
    return { mediaKey, originalFilePath, encFilePath, mac, fileEncSha256, fileSha256, fileLength };
  } catch (error) {
    if (!encFileWriteStream.destroyed) encFileWriteStream.destroy();
    if (originalFileStream && !originalFileStream.destroyed) originalFileStream.destroy();
    aes.destroy();
    hmac.destroy();
    sha256Plain.destroy();
    sha256Enc.destroy();
    stream.destroy();
    try {
      await fs.unlink(encFilePath);
      if (originalFilePath) {
        await fs.unlink(originalFilePath);
      }
    } catch (err) {
      logger?.error({ err }, "failed deleting tmp files");
    }
    throw streamError || error;
  }
};
const DEF_MEDIA_HOST = "mmg.whatsapp.net";
const AES_CHUNK_SIZE = 16;
const toSmallestChunkSize = (num) => {
  return Math.floor(num / AES_CHUNK_SIZE) * AES_CHUNK_SIZE;
};
const getUrlFromDirectPath = (directPath, host = DEF_MEDIA_HOST) => `https://${host}${directPath}`;
const extractHost = (url) => {
  if (!url) return void 0;
  try {
    return new URL(url).host;
  } catch {
    return void 0;
  }
};
const downloadContentFromMessage = async ({ mediaKey, directPath, url }, type, opts = {}) => {
  const fallbackHost = opts.host ?? extractHost(url);
  const downloadUrl = directPath ? getUrlFromDirectPath(directPath, fallbackHost) : url;
  if (!downloadUrl) {
    throw new Boom("No valid media URL or directPath present in message", { statusCode: 400 });
  }
  const keys = await getMediaKeys(mediaKey, type);
  const MAX_RETRIES = 3;
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await downloadEncryptedContent(downloadUrl, keys, opts);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
};
const downloadEncryptedContent = async (downloadUrl, { cipherKey, iv }, { startByte, endByte, options } = {}) => {
  let bytesFetched = 0;
  let startChunk = 0;
  let firstBlockIsIV = false;
  if (startByte) {
    const chunk = toSmallestChunkSize(startByte || 0);
    if (chunk) {
      startChunk = chunk - AES_CHUNK_SIZE;
      bytesFetched = chunk;
      firstBlockIsIV = true;
    }
  }
  const endChunk = endByte ? toSmallestChunkSize(endByte || 0) + AES_CHUNK_SIZE : void 0;
  const headersInit = options?.headers ? options.headers : void 0;
  const headers = { ...headersInit ? Array.isArray(headersInit) ? Object.fromEntries(headersInit) : headersInit : {}, Origin: DEFAULT_ORIGIN };
  if (startChunk || endChunk) {
    headers.Range = `bytes=${startChunk}-`;
    if (endChunk) {
      headers.Range += endChunk;
    }
  }
  const fetched = await getHttpStream(downloadUrl, { ...options || {}, headers });
  let remainingBytes = Buffer.from([]);
  let aes;
  const pushBytes = (bytes, push) => {
    if (startByte || endByte) {
      const start = bytesFetched >= startByte ? void 0 : Math.max(startByte - bytesFetched, 0);
      const end = bytesFetched + bytes.length < endByte ? void 0 : Math.max(endByte - bytesFetched, 0);
      push(bytes.slice(start, end));
      bytesFetched += bytes.length;
    } else {
      push(bytes);
    }
  };
  const output = new Transform({ transform(chunk, _, callback) {
    let data = remainingBytes.length ? Buffer.concat([remainingBytes, chunk]) : chunk;
    const decryptLength = toSmallestChunkSize(data.length);
    remainingBytes = data.slice(decryptLength);
    data = data.slice(0, decryptLength);
    if (!aes) {
      let ivValue = iv;
      if (firstBlockIsIV) {
        ivValue = data.slice(0, AES_CHUNK_SIZE);
        data = data.slice(AES_CHUNK_SIZE);
      }
      aes = Crypto.createDecipheriv("aes-256-cbc", cipherKey, ivValue);
      if (endByte) {
        aes.setAutoPadding(false);
      }
    }
    try {
      pushBytes(aes.update(data), (b) => this.push(b));
      callback();
    } catch (error) {
      callback(error);
    }
  }, final(callback) {
    try {
      pushBytes(aes.final(), (b) => this.push(b));
      callback();
    } catch (error) {
      callback(error);
    }
  } });
  fetched.on("error", (err) => output.destroy(err));
  fetched.pipe(output, { end: true });
  return output;
};
function extensionForMediaMessage(message) {
  const getExtension = (mimetype) => mimetype.split(";")[0]?.split("/")[1];
  const type = Object.keys(message)[0];
  let extension;
  if (type === "locationMessage" || type === "liveLocationMessage" || type === "productMessage") {
    extension = ".jpeg";
  } else {
    const messageContent = message[type];
    extension = getExtension(messageContent.mimetype);
  }
  return extension;
}
const isNodeRuntime = () => {
  return typeof process !== "undefined" && process.versions?.node !== null && typeof process.versions.bun === "undefined" && typeof globalThis.Deno === "undefined";
};
const uploadWithNodeHttp = async ({ url, filePath, headers, timeoutMs, agent }, redirectCount = 0) => {
  if (redirectCount > 5) {
    throw new Error("Too many redirects");
  }
  const parsedUrl = new URL(url);
  const httpModule = parsedUrl.protocol === "https:" ? await import("https") : await import("http");
  const fileStats = await fs.stat(filePath);
  const fileSize = fileStats.size;
  return new Promise((resolve, reject) => {
    const req = httpModule.request({ hostname: parsedUrl.hostname, port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80), path: parsedUrl.pathname + parsedUrl.search, method: "POST", headers: { ...headers, "Content-Length": fileSize }, agent, timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const newUrl = new URL(res.headers.location, url).toString();
        resolve(uploadWithNodeHttp({ url: newUrl, filePath, headers, timeoutMs, agent }, redirectCount + 1));
        return;
      }
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(void 0);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Upload timeout"));
    });
    const stream = createReadStream(filePath);
    stream.pipe(req);
    stream.on("error", (err) => {
      req.destroy();
      reject(err);
    });
  });
};
const uploadWithFetch = async ({ url, filePath, headers, timeoutMs, agent }) => {
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream);
  const dispatcher = typeof agent?.dispatch === "function" ? agent : void 0;
  const response = await fetch(url, { ...dispatcher ? { dispatcher } : {}, method: "POST", body: webStream, headers, duplex: "half", signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : void 0 });
  try {
    return await response.json();
  } catch {
    return void 0;
  }
};
const uploadMedia = async (params, logger) => {
  if (isNodeRuntime()) {
    logger?.debug("Using Node.js https module for upload (avoids undici buffering bug)");
    return uploadWithNodeHttp(params);
  } else {
    logger?.debug("Using web-standard Fetch API for upload");
    return uploadWithFetch(params);
  }
};
const getWAUploadToServer = ({ customUploadHosts, fetchAgent, logger, options }, refreshMediaConn) => {
  return async (filePath, { mediaType, fileEncSha256B64, timeoutMs, newsletter }) => {
    let uploadInfo = await refreshMediaConn(false);
    let urls;
    const hosts = [...customUploadHosts, ...uploadInfo.hosts];
    fileEncSha256B64 = encodeBase64EncodedStringForUpload(fileEncSha256B64);
    const customHeaders = (() => {
      const hdrs = options?.headers;
      if (!hdrs) return {};
      return Array.isArray(hdrs) ? Object.fromEntries(hdrs) : hdrs;
    })();
    const headers = { ...customHeaders, "Content-Type": "application/octet-stream", Origin: DEFAULT_ORIGIN };
    for (let hostIdx = 0; hostIdx < hosts.length; hostIdx++) {
      const { hostname } = hosts[hostIdx];
      logger.debug(`uploading to "${hostname}"`);
      const auth = encodeURIComponent(uploadInfo.auth);
      const mediaPathMap = newsletter ? NEWSLETTER_MEDIA_PATH_MAP : MEDIA_PATH_MAP;
      const serverThumb = newsletter ? "&server_thumb_gen=1" : "";
      const url = `https://${hostname}${mediaPathMap[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}${serverThumb}`;
      let result;
      try {
        result = await uploadMedia({ url, filePath, headers, timeoutMs, agent: fetchAgent }, logger);
        if (result?.url || result?.direct_path) {
          urls = { mediaUrl: result.url, directPath: result.direct_path, meta_hmac: result.meta_hmac, fbid: result.fbid, ts: result.ts, thumbnailDirectPath: result.thumbnail_info?.thumbnail_direct_path, thumbnailSha256: result.thumbnail_info?.thumbnail_sha256 };
          break;
        } else {
          uploadInfo = await refreshMediaConn(true);
          throw new Error(`upload failed, reason: ${JSON.stringify(result)}`);
        }
      } catch (error) {
        const isLast = hostIdx === hosts.length - 1;
        logger.warn({ trace: error?.stack, uploadResult: result }, `Error in uploading to ${hostname} ${isLast ? "" : ", retrying..."}`);
        if (!isLast) {
          await new Promise((r) => setTimeout(r, 300 * (hostIdx + 1)));
        }
      }
    }
    if (!urls) {
      throw new Boom("Media upload failed on all hosts", { statusCode: 500 });
    }
    return urls;
  };
};
const getMediaRetryKey = (mediaKey) => {
  return hkdf(mediaKey, 32, { info: "WhatsApp Media Retry Notification" });
};
const encryptMediaRetryRequest = (key, mediaKey, meId) => {
  const recp = { stanzaId: key.id };
  const recpBuffer = proto.ServerErrorReceipt.encode(recp).finish();
  const iv = Crypto.randomBytes(12);
  const retryKey = getMediaRetryKey(mediaKey);
  const ciphertext = aesEncryptGCM(recpBuffer, retryKey, iv, Buffer.from(key.id));
  const req = { tag: "receipt", attrs: { id: key.id, to: jidNormalizedUser(meId), type: "server-error" }, content: [{ tag: "encrypt", attrs: {}, content: [{ tag: "enc_p", attrs: {}, content: ciphertext }, { tag: "enc_iv", attrs: {}, content: iv }] }, { tag: "rmr", attrs: { jid: key.remoteJid, from_me: (!!key.fromMe).toString(), participant: key.participant || void 0 } }] };
  return req;
};
const decodeMediaRetryNode = (node) => {
  const rmrNode = getBinaryNodeChild(node, "rmr");
  const event = { key: { id: node.attrs.id, remoteJid: rmrNode.attrs.jid, fromMe: rmrNode.attrs.from_me === "true", participant: rmrNode.attrs.participant } };
  const errorNode = getBinaryNodeChild(node, "error");
  if (errorNode) {
    const errorCode = +errorNode.attrs.code;
    event.error = new Boom(`Failed to re-upload media (${errorCode})`, { data: errorNode.attrs, statusCode: getStatusCodeForMediaRetry(errorCode) });
  } else {
    const encryptedInfoNode = getBinaryNodeChild(node, "encrypt");
    const ciphertext = getBinaryNodeChildBuffer(encryptedInfoNode, "enc_p");
    const iv = getBinaryNodeChildBuffer(encryptedInfoNode, "enc_iv");
    if (ciphertext && iv) {
      event.media = { ciphertext, iv };
    } else {
      event.error = new Boom("Failed to re-upload media (missing ciphertext)", { statusCode: 404 });
    }
  }
  return event;
};
const decryptMediaRetryData = ({ ciphertext, iv }, mediaKey, msgId) => {
  const retryKey = getMediaRetryKey(mediaKey);
  const plaintext = aesDecryptGCM(ciphertext, retryKey, iv, Buffer.from(msgId));
  return proto.MediaRetryNotification.decode(plaintext);
};
const getStatusCodeForMediaRetry = (code) => MEDIA_RETRY_STATUS_MAP[code];
const MEDIA_RETRY_STATUS_MAP = { [proto.MediaRetryNotification.ResultType.SUCCESS]: 200, [proto.MediaRetryNotification.ResultType.DECRYPTION_ERROR]: 412, [proto.MediaRetryNotification.ResultType.NOT_FOUND]: 404, [proto.MediaRetryNotification.ResultType.GENERAL_ERROR]: 418 };
export {
  DEF_MEDIA_HOST,
  decodeMediaRetryNode,
  decryptMediaRetryData,
  downloadContentFromMessage,
  downloadEncryptedContent,
  encodeBase64EncodedStringForUpload,
  encryptMediaRetryRequest,
  encryptedStream,
  extensionForMediaMessage,
  extractImageThumb,
  extractVideoThumb,
  generateProfilePicture,
  generateThumbnail,
  getAudioDuration,
  getAudioWaveform,
  getHttpStream,
  getImageProcessingLibrary,
  getMediaKeys,
  getRawMediaUploadData,
  getStatusCodeForMediaRetry,
  getStream,
  getUrlFromDirectPath,
  getWAUploadToServer,
  hkdfInfoKey,
  mediaMessageSHA256B64,
  toBuffer,
  toReadable,
  uploadWithNodeHttp
};
