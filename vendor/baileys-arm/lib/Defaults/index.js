import { proto } from "../../WAProto/index.js";
import { makeLibSignalRepository } from "../Signal/libsignal.js";
import { Browsers } from "../Utils/browser-utils.js";
import logger from "../Utils/logger.js";
const version = [2, 3000, 1045191189];
const UNAUTHORIZED_CODES = [401, 403, 419];
const BIZ_BOT_SUPPORT_PAYLOAD = '{"version":1,"is_ai_message":true,"should_upload_client_logs":false,"should_show_system_message":false,"ticket_id":"7004947587700716","citation_items":[],"ticket_locale":"us"}';
const DEFAULT_ORIGIN = "https://web.whatsapp.com";
const CALL_VIDEO_PREFIX = "https://call.whatsapp.com/video/";
const CALL_AUDIO_PREFIX = "https://call.whatsapp.com/voice/";
const DONATE_URL = "";
const LIBRARY_NAME = "Baileys";
const DEF_CALLBACK_PREFIX = "CB:";
const DEF_TAG_PREFIX = "TAG:";
const PHONE_CONNECTION_CB = "CB:Pong";
const WA_ADV_ACCOUNT_SIG_PREFIX = Buffer.from([6, 0]);
const WA_ADV_DEVICE_SIG_PREFIX = Buffer.from([6, 1]);
const WA_ADV_HOSTED_ACCOUNT_SIG_PREFIX = Buffer.from([6, 5]);
const WA_ADV_HOSTED_DEVICE_SIG_PREFIX = Buffer.from([6, 6]);
const WA_DEFAULT_EPHEMERAL = 7 * 24 * 60 * 60;
const STATUS_EXPIRY_SECONDS = 24 * 60 * 60;
const PLACEHOLDER_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const NOISE_MODE = "Noise_XX_25519_AESGCM_SHA256\0\0\0\0";
const DICT_VERSION = 3;
const KEY_BUNDLE_TYPE = Buffer.from([5]);
const NOISE_WA_HEADER = Buffer.from([87, 65, 6, DICT_VERSION]);
const LEXER_REGEX = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[\s\S]*?`)|(\b[a-zA-Z_]\w*\b)(?=\s*\()|(\b[a-zA-Z_]\w*\b)|(\b\d+(?:\.\d+)?\b)|(\s+|[^\w\s]+)/g;
const URL_REGEX = /https:\/\/(?![^:@\/\s]+:[^:@\/\s]+@)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?/g;
const WA_CERT_DETAILS = { SERIAL: 0, ISSUER: "WhatsAppLongTerm1", PUBLIC_KEY: Buffer.from("142375574d0a587166aae71ebe516437c4a28b73e3695c6ce1f7f9545da8ee6b", "hex") };
const PROCESSABLE_HISTORY_TYPES = [proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP, proto.HistorySync.HistorySyncType.PUSH_NAME, proto.HistorySync.HistorySyncType.RECENT, proto.HistorySync.HistorySyncType.FULL, proto.HistorySync.HistorySyncType.ON_DEMAND, proto.HistorySync.HistorySyncType.NON_BLOCKING_DATA, proto.HistorySync.HistorySyncType.INITIAL_STATUS_V3];
const DEFAULT_CACHE_TTLS = { SIGNAL_STORE: 5 * 60, MSG_RETRY: 60 * 60, CALL_OFFER: 5 * 60, USER_DEVICES: 5 * 60 };
const DEFAULT_CONNECTION_CONFIG = { version, browser: Browsers.macOS("Chrome"), waWebSocketUrl: "wss://web.whatsapp.com/ws/chat", connectTimeoutMs: 2e4, keepAliveIntervalMs: 3e4, logger: logger.child({ class: "baileys" }), emitOwnEvents: true, defaultQueryTimeoutMs: 6e4, customUploadHosts: [], retryRequestDelayMs: 250, maxMsgRetryCount: 3, fireInitQueries: true, auth: void 0, markOnlineOnConnect: true, syncFullHistory: true, patchMessageBeforeSending: (msg) => msg, shouldSyncHistoryMessage: ({ syncType }) => {
  return syncType !== proto.HistorySync.HistorySyncType.FULL;
}, shouldIgnoreJid: () => false, linkPreviewImageThumbnailWidth: 192, transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3e3 }, eventBufferTimeoutMs: 3e4, statusBroadcastDelayMs: 1500, albumDelayMs: 1500, phashRetryEnabled: false, generateHighQualityLinkPreview: false, enableAutoSessionRecreation: true, enableRecentMessageCache: true, options: {}, appStateMacVerification: { patch: false, snapshot: false }, countryCode: "US", getMessage: async () => void 0, cachedGroupMetadata: async () => void 0, makeSignalRepository: makeLibSignalRepository };
const MEDIA_PATH_MAP = { image: "/mms/image", video: "/mms/video", document: "/mms/document", audio: "/mms/audio", sticker: "/mms/image", "sticker-pack": "/mms/sticker-pack", "thumbnail-sticker-pack": "/mms/thumbnail-sticker-pack", "thumbnail-link": "/mms/image", "thumbnail-image": "/mms/image", "thumbnail-video": "/mms/video", "thumbnail-document": "/mms/document", "product-catalog-image": "/product/image", "md-app-state": "", "md-msg-hist": "/mms/md-app-state", "biz-cover-photo": "/pps/biz-cover-photo" };
const NEWSLETTER_MEDIA_PATH_MAP = { image: "/newsletter/newsletter-image", video: "/newsletter/newsletter-video", document: "/newsletter/newsletter-document", audio: "/newsletter/newsletter-audio", sticker: "/newsletter/newsletter-image", "thumbnail-link": "/newsletter/newsletter-thumbnail-link" };
const MEDIA_HKDF_KEY_MAPPING = { audio: "Audio", document: "Document", gif: "Video", image: "Image", ppic: "", product: "Image", ptt: "Audio", "sticker-pack": "Sticker Pack", "thumbnail-sticker-pack": "Sticker Pack Thumbnail", sticker: "Image", video: "Video", "thumbnail-document": "Document Thumbnail", "thumbnail-image": "Image Thumbnail", "thumbnail-video": "Video Thumbnail", "thumbnail-link": "Link Thumbnail", "md-msg-hist": "History", "md-app-state": "App State", "product-catalog-image": "Product Catalog Image", "payment-bg-image": "Payment Background", ptv: "Video", "biz-cover-photo": "Image", location: "Location", contact: "Contact", "voip-token": "Voip Token" };
const MEDIA_KEYS = Object.keys(MEDIA_PATH_MAP);
const HISTORY_SYNC_PAUSED_TIMEOUT_MS = 12e4;
const MIN_PREKEY_COUNT = 5;
const INITIAL_PREKEY_COUNT = 812;
const UPLOAD_TIMEOUT = 3e4;
const TimeMs = { Minute: 60 * 1e3, Hour: 60 * 60 * 1e3, Day: 24 * 60 * 60 * 1e3, Week: 7 * 24 * 60 * 60 * 1e3 };
export {
  BIZ_BOT_SUPPORT_PAYLOAD,
  CALL_AUDIO_PREFIX,
  CALL_VIDEO_PREFIX,
  DEFAULT_CACHE_TTLS,
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_ORIGIN,
  DEF_CALLBACK_PREFIX,
  DEF_TAG_PREFIX,
  DICT_VERSION,
  DONATE_URL,
  HISTORY_SYNC_PAUSED_TIMEOUT_MS,
  INITIAL_PREKEY_COUNT,
  KEY_BUNDLE_TYPE,
  LEXER_REGEX,
  LIBRARY_NAME,
  MEDIA_HKDF_KEY_MAPPING,
  MEDIA_KEYS,
  MEDIA_PATH_MAP,
  MIN_PREKEY_COUNT,
  NEWSLETTER_MEDIA_PATH_MAP,
  NOISE_MODE,
  NOISE_WA_HEADER,
  PHONE_CONNECTION_CB,
  PLACEHOLDER_MAX_AGE_SECONDS,
  PROCESSABLE_HISTORY_TYPES,
  STATUS_EXPIRY_SECONDS,
  TimeMs,
  UNAUTHORIZED_CODES,
  UPLOAD_TIMEOUT,
  URL_REGEX,
  WA_ADV_ACCOUNT_SIG_PREFIX,
  WA_ADV_DEVICE_SIG_PREFIX,
  WA_ADV_HOSTED_ACCOUNT_SIG_PREFIX,
  WA_ADV_HOSTED_DEVICE_SIG_PREFIX,
  WA_CERT_DETAILS,
  WA_DEFAULT_EPHEMERAL
};
