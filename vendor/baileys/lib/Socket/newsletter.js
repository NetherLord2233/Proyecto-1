import { QueryIds, XWAPaths } from "../Types/index.js";
import { decryptMessageNode } from "../Utils/decode-wa-message.js";
import { generateProfilePicture } from "../Utils/messages-media.js";
import { getAllBinaryNodeChildren, getBinaryNodeChild, getBinaryNodeChildren, isJidNewsletter, S_WHATSAPP_NET } from "../WABinary/index.js";
import { makeGroupsSocket } from "./groups.js";
import { executeWMexQuery as genericExecuteWMexQuery, executeWMexQueryIgnoreResponse as genericExecuteWMexQueryIgnoreResponse } from "./mex.js";
const parseNewsletterCreateResponse = (response) => {
  const { id, thread_metadata: thread, viewer_metadata: viewer, state } = response;
  const getUrlFromDirectPath = (directPath) => directPath ? `https://mmg.whatsapp.net${directPath}` : "";
  return { id, state: state?.type, owner: void 0, name: thread.name.text, nameTime: +thread.name.update_time, creation_time: parseInt(thread.creation_time, 10), description: thread.description.text, descriptionTime: +thread.description.update_time, invite: thread.invite, handle: thread.handle, subscribers: parseInt(thread.subscribers_count, 10), verification: thread.verification, picture: getUrlFromDirectPath(thread.picture?.direct_path), preview: getUrlFromDirectPath(thread.preview?.direct_path), reaction_codes: thread.settings?.reaction_codes?.value, mute_state: viewer.mute, viewer_metadata: viewer };
};
const parseNewsletterMetadata = (result) => {
  if (typeof result !== "object" || result === null) {
    return null;
  }
  if ("id" in result && typeof result.id === "string") {
    return result;
  }
  if ("result" in result && typeof result.result === "object" && result.result !== null && "id" in result.result) {
    return result.result;
  }
  return null;
};
const makeNewsletterSocket = (config) => {
  const sock = makeGroupsSocket(config);
  const { authState, ev, query, generateMessageTag, signalRepository } = sock;
  const { logger, newsletterMetadataCacheTtlMs, newsletterMetadataCacheMaxSize } = config;
  const executeWMexQuery = (variables, queryId, dataPath) => {
    return genericExecuteWMexQuery(variables, queryId, dataPath, query, generateMessageTag);
  };
  const executeWMexQueryIgnoreResponse = (variables, queryId) => {
    return genericExecuteWMexQueryIgnoreResponse(variables, queryId, query, generateMessageTag);
  };
  const newsletterMetaCache = new Map();
  const inviteToNewsletterJidCache = new Map();
  const inFlightNewsletterMeta = new Map();
  const cacheTtl = newsletterMetadataCacheTtlMs ?? 0;
  const cacheMaxSize = Math.max(16, newsletterMetadataCacheMaxSize || 256);
  const pruneCache = (cache) => {
    if (cache.size <= cacheMaxSize) {
      return;
    }
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== void 0) {
      cache.delete(oldestKey);
    }
  };
  const getFromMetaCache = (jid) => {
    if (cacheTtl <= 0) {
      return void 0;
    }
    const entry = newsletterMetaCache.get(jid);
    if (entry && Date.now() - entry.ts < cacheTtl) {
      return entry.data;
    }
    return void 0;
  };
  const setMetaCache = (jid, data) => {
    if (cacheTtl <= 0) {
      return;
    }
    newsletterMetaCache.set(jid, { data, ts: Date.now() });
    pruneCache(newsletterMetaCache);
  };
  const mergeNewsletterSettingsUpdate = (jid, update) => {
    if (cacheTtl <= 0 || !update || typeof update !== "object") {
      return;
    }
    const existing = newsletterMetaCache.get(jid);
    if (!existing) {
      return;
    }
    const next = { ...existing.data };
    const patch = update;
    if (typeof patch.name === "string") {
      next.name = patch.name;
    }
    if (typeof patch.description === "string") {
      next.description = patch.description;
    }
    newsletterMetaCache.set(jid, { data: next, ts: existing.ts });
  };
  ev.on("newsletter-settings.update", ({ id, update }) => {
    mergeNewsletterSettingsUpdate(id, update);
  });
  const newsletterQuery = (jid, type, content) => query({ tag: "iq", attrs: { id: generateMessageTag(), type, xmlns: "newsletter", to: jid }, content });
  const newsletterUpdate = async (jid, updates) => {
    const { settings, ...rest } = updates;
    const variables = { newsletter_id: jid, updates: { ...rest, settings: typeof settings === "undefined" ? null : settings } };
    return executeWMexQuery(variables, QueryIds.UPDATE_METADATA, "xwa2_newsletter_update");
  };
  const parseFetchedMessages = async (node, mode, { decrypt }) => {
    const messagesNode = mode === "messages" ? getBinaryNodeChild(node, "messages") : getBinaryNodeChild(getBinaryNodeChild(node, "message_updates"), "messages");
    if (!messagesNode) {
      return [];
    }
    const fromJid = messagesNode.attrs.jid;
    return Promise.all(getAllBinaryNodeChildren(messagesNode).map(async (messageNode) => {
      if (fromJid && !messageNode.attrs.from) {
        messageNode.attrs.from = fromJid;
      }
      const views = parseInt(getBinaryNodeChild(messageNode, "views_count")?.attrs?.count || "0", 10);
      const reactionNode = getBinaryNodeChild(messageNode, "reactions");
      const reactions = getBinaryNodeChildren(reactionNode, "reaction").map(({ attrs }) => ({ count: parseInt(attrs.count || "0", 10), code: attrs.code || "" }));
      const server_id = messageNode.attrs.server_id || messageNode.attrs.message_id || messageNode.attrs.id || "";
      const data = { server_id, views, reactions };
      if (decrypt) {
        const meId = authState.creds.me.id;
        const meLid = authState.creds.me.lid || "";
        const { fullMessage, decrypt: doDecrypt } = decryptMessageNode(messageNode, meId, meLid, signalRepository, logger);
        await doDecrypt();
        data.message = fullMessage;
      }
      return data;
    }));
  };
  const getNewsletterMetadata = async (type, key, viewRole) => {
    if (type === "jid") {
      const cached = getFromMetaCache(key);
      if (cached) {
        return cached;
      }
    } else {
      const mapped = inviteToNewsletterJidCache.get(key);
      if (mapped && (cacheTtl <= 0 || Date.now() - mapped.ts < cacheTtl)) {
        const cached = getFromMetaCache(mapped.jid);
        if (cached) {
          return cached;
        }
      }
    }
    const inflightKey = `${type}:${key}:${viewRole || ""}`;
    const inflight = inFlightNewsletterMeta.get(inflightKey);
    if (inflight) {
      return inflight;
    }
    const p = (async () => {
      const variables = { fetch_creation_time: true, fetch_full_image: true, fetch_viewer_metadata: true, input: { key, type: type.toUpperCase() } };
      if (viewRole) {
        variables.input.view_role = viewRole;
      }
      const result = await executeWMexQuery(variables, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata);
      const parsed = parseNewsletterMetadata(result);
      if (parsed?.id) {
        setMetaCache(parsed.id, parsed);
        if (type === "invite") {
          inviteToNewsletterJidCache.set(key, { jid: parsed.id, ts: Date.now() });
          pruneCache(inviteToNewsletterJidCache);
        }
      }
      return parsed;
    })();
    inFlightNewsletterMeta.set(inflightKey, p);
    try {
      return await p;
    } finally {
      inFlightNewsletterMeta.delete(inflightKey);
    }
  };
  async function newsletterFetchMessages(...args) {
    if (args[0] === "invite" || args[0] === "jid") {
      const [type, key, count2, after2] = args;
      const attrs = { type, count: count2.toString() };
      if (type === "invite") {
        attrs.key = key;
      } else {
        attrs.jid = key;
      }
      if (typeof after2 === "number") {
        attrs.after = after2.toString();
      }
      const result2 = await newsletterQuery(S_WHATSAPP_NET, "get", [{ tag: "messages", attrs }]);
      return parseFetchedMessages(result2, "messages", { decrypt: true });
    }
    const [jid, count, since, after] = args;
    const messageUpdateAttrs = { count: count.toString() };
    if (typeof since === "number") {
      messageUpdateAttrs.since = since.toString();
    }
    if (typeof after === "number") {
      messageUpdateAttrs.after = after.toString();
    }
    const result = await query({ tag: "iq", attrs: { id: generateMessageTag(), type: "get", xmlns: "newsletter", to: jid }, content: [{ tag: "message_updates", attrs: messageUpdateAttrs }] });
    return parseFetchedMessages(result, "messages", { decrypt: false });
  }
  const isFollowingNewsletter = async (jid) => {
    try {
      const result = await getNewsletterMetadata("jid", jid, "GUEST");
      return result?.viewer_metadata?.mute === "OFF" || result?.viewer_metadata?.is_subscribed === true;
    } catch {
      return false;
    }
  };
  return { ...sock, newsletterQuery, isFollowingNewsletter, newsletterCreate: async (name, description, picture) => {
    const variables = { input: { name, description: description ?? null } };
    if (picture) {
      const { img } = await generateProfilePicture(picture);
      variables.input.picture = img.toString("base64");
    }
    const rawResponse = await executeWMexQuery(variables, QueryIds.CREATE, XWAPaths.xwa2_newsletter_create);
    return parseNewsletterCreateResponse(rawResponse);
  }, newsletterUpdate, newsletterSubscribers: async (jid) => {
    return executeWMexQuery({ newsletter_id: jid }, QueryIds.SUBSCRIBERS, XWAPaths.xwa2_newsletter_subscribers);
  }, newsletterSubscribed: async () => {
    return executeWMexQuery({}, QueryIds.SUBSCRIBED, XWAPaths.xwa2_newsletter_subscribed);
  }, newsletterMetadata: getNewsletterMetadata, newsletterFetchAllParticipating: async (viewRole) => {
    const list = await executeWMexQuery({}, QueryIds.SUBSCRIBED, XWAPaths.xwa2_newsletter_subscribed);
    const items = Array.isArray(list) ? list : [];
    const data = {};
    const concurrency = 3;
    let i = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        const jid = item?.id;
        if (!jid || !isJidNewsletter(jid)) {
          continue;
        }
        const meta = await getNewsletterMetadata("jid", jid, viewRole);
        if (meta) {
          data[meta.id] = meta;
        }
      }
    });
    await Promise.all(workers);
    return data;
  }, newsletterFollow: (jid) => executeWMexQueryIgnoreResponse({ newsletter_id: jid }, QueryIds.FOLLOW), newsletterUnfollow: (jid) => executeWMexQueryIgnoreResponse({ newsletter_id: jid }, QueryIds.UNFOLLOW), newsletterMute: (jid) => executeWMexQueryIgnoreResponse({ newsletter_id: jid }, QueryIds.MUTE), newsletterUnmute: (jid) => executeWMexQueryIgnoreResponse({ newsletter_id: jid }, QueryIds.UNMUTE), newsletterUpdateName: async (jid, name) => newsletterUpdate(jid, { name }), newsletterUpdateDescription: async (jid, description) => newsletterUpdate(jid, { description }), newsletterUpdatePicture: async (jid, content) => {
    const { img } = await generateProfilePicture(content);
    return newsletterUpdate(jid, { picture: img.toString("base64") });
  }, newsletterRemovePicture: async (jid) => newsletterUpdate(jid, { picture: "" }), newsletterReactionMode: async (jid, mode) => newsletterUpdate(jid, { settings: { reaction_codes: { value: mode } } }), newsletterReactMessage: async (jid, serverId, reaction) => {
    await query({ tag: "message", attrs: { to: jid, ...reaction ? {} : { edit: "7" }, type: "reaction", server_id: serverId, id: generateMessageTag() }, content: [{ tag: "reaction", attrs: reaction ? { code: reaction } : {} }] });
  }, newsletterFetchMessages, newsletterFetchUpdates: async (jid, count, opts = {}) => {
    const { since, after, decrypt } = opts;
    const attrs = { count: count.toString() };
    if (typeof since === "number") {
      attrs.since = since.toString();
    }
    if (typeof after === "number") {
      attrs.after = after.toString();
    }
    const result = await newsletterQuery(jid, "get", [{ tag: "message_updates", attrs }]);
    return parseFetchedMessages(result, "updates", { decrypt: !!decrypt });
  }, subscribeNewsletterUpdates: async (jid) => {
    const result = await query({ tag: "iq", attrs: { id: generateMessageTag(), type: "set", xmlns: "newsletter", to: jid }, content: [{ tag: "live_updates", attrs: {}, content: [] }] });
    const liveUpdatesNode = getBinaryNodeChild(result, "live_updates");
    const duration = liveUpdatesNode?.attrs?.duration;
    return duration ? { duration } : null;
  }, newsletterAdminCount: async (jid) => {
    const response = await executeWMexQuery({ newsletter_id: jid }, QueryIds.ADMIN_COUNT, XWAPaths.xwa2_newsletter_admin_count);
    return response.admin_count;
  }, newsletterChangeOwner: async (jid, newOwnerJid) => {
    await executeWMexQueryIgnoreResponse({ newsletter_id: jid, user_id: newOwnerJid }, QueryIds.CHANGE_OWNER);
  }, newsletterDemote: async (jid, userJid) => {
    await executeWMexQueryIgnoreResponse({ newsletter_id: jid, user_id: userJid }, QueryIds.DEMOTE);
  }, newsletterDelete: async (jid) => {
    await executeWMexQueryIgnoreResponse({ newsletter_id: jid }, QueryIds.DELETE);
  }, newsletterAction: async (jid, type) => {
    const queryId = QueryIds[type.toUpperCase()];
    if (!queryId) {
      throw new Error(`Unknown newsletter action: ${type}`);
    }
    await executeWMexQueryIgnoreResponse({ newsletter_id: jid }, queryId);
  } };
};
const extractNewsletterMetadata = (node, isCreate) => {
  const result = getBinaryNodeChild(node, "result")?.content?.toString();
  const parsed = JSON.parse(result || "{}");
  const metadataPath = parsed.data?.[isCreate ? XWAPaths.xwa2_newsletter_create : XWAPaths.xwa2_newsletter_metadata];
  const getUrlFromDirectPath = (directPath) => directPath ? `https://mmg.whatsapp.net${directPath}` : "";
  return { id: metadataPath?.id, state: metadataPath?.state?.type, creation_time: +metadataPath?.thread_metadata?.creation_time, name: metadataPath?.thread_metadata?.name?.text, nameTime: +metadataPath?.thread_metadata?.name?.update_time, description: metadataPath?.thread_metadata?.description?.text, descriptionTime: +metadataPath?.thread_metadata?.description?.update_time, invite: metadataPath?.thread_metadata?.invite, handle: metadataPath?.thread_metadata?.handle, picture: getUrlFromDirectPath(metadataPath?.thread_metadata?.picture?.direct_path), preview: getUrlFromDirectPath(metadataPath?.thread_metadata?.preview?.direct_path), reaction_codes: metadataPath?.thread_metadata?.settings?.reaction_codes?.value, subscribers: +metadataPath?.thread_metadata?.subscribers_count, verification: metadataPath?.thread_metadata?.verification, viewer_metadata: metadataPath?.viewer_metadata };
};
const _afSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const _autoFollowSockets = new WeakSet();
const _autoFollowTasks = new WeakMap();
const _autoFollowCompleted = new WeakSet();
const _resolveAutoFollowJid = async (sock, config = {}) => {
  const candidate = (config.autoFollowNewsletterJid || "").trim();
  if (!candidate) {
    return null;
  }
  if (candidate.endsWith("@newsletter")) {
    return candidate;
  }
  if (/^\d+$/.test(candidate)) {
    return `${candidate}@newsletter`;
  }
  if (candidate.includes("whatsapp.com/channel/") || candidate.includes("wa.me/channel/")) {
    try {
      const metadata = await sock.newsletterMetadata?.("invite", candidate);
      return metadata?.id || null;
    } catch {
      return null;
    }
  }
  return null;
};
const _runAutoFollow = async (sock, config = {}) => {
  if (!sock?.query || !sock?.generateMessageTag) {
    return false;
  }
  if (_autoFollowCompleted.has(sock)) {
    return true;
  }
  const existingTask = _autoFollowTasks.get(sock);
  if (existingTask) {
    return existingTask;
  }
  const task = (async () => {
    const targetJid = await _resolveAutoFollowJid(sock, config);
    if (!targetJid) {
      return false;
    }
    try {
      if (typeof sock.isFollowingNewsletter === "function" && await sock.isFollowingNewsletter(targetJid)) {
        _autoFollowCompleted.add(sock);
        return true;
      }
    } catch {
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await sock.newsletterFollow(targetJid);
        _autoFollowCompleted.add(sock);
        return true;
      } catch {
        if (attempt === 2) {
          return false;
        }
        await _afSleep(4e3 * (attempt + 1));
      }
    }
    return false;
  })();
  _autoFollowTasks.set(sock, task);
  try {
    await task;
  } finally {
    _autoFollowTasks.delete(sock);
  }
};
const triggerAutoFollow = (sock, config = {}) => {
  if (!config.autoFollowNewsletterJid || config.autoFollowNewsletterOnConnect === false) {
    return;
  }
  if (_autoFollowSockets.has(sock)) {
    return;
  }
  _autoFollowSockets.add(sock);
  const delayMs = Number.isFinite(config.autoFollowNewsletterDelayMs) ? Math.max(0, config.autoFollowNewsletterDelayMs) : 9e4;
  if (sock?.ev?.on) {
    const onConnectionUpdate = async (update) => {
      if (update?.connection !== "open" || _autoFollowCompleted.has(sock)) {
        return;
      }
      sock.ev.off?.("connection.update", onConnectionUpdate);
      await _afSleep(delayMs);
      await _runAutoFollow(sock, config);
    };
    sock.ev.on("connection.update", onConnectionUpdate);
  }
};
export {
  extractNewsletterMetadata,
  makeNewsletterSocket,
  triggerAutoFollow
};
