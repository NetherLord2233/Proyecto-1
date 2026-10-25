const S_WHATSAPP_NET = "@s.whatsapp.net";
const OFFICIAL_BIZ_JID = "16505361212@c.us";
const SERVER_JID = "server@c.us";
const PSA_WID = "0@c.us";
const STORIES_JID = "status@broadcast";
const META_AI_JID = "13135550002@c.us";
var WAJIDDomains;
(function(WAJIDDomains2) {
  WAJIDDomains2[WAJIDDomains2["WHATSAPP"] = 0] = "WHATSAPP";
  WAJIDDomains2[WAJIDDomains2["LID"] = 1] = "LID";
  WAJIDDomains2[WAJIDDomains2["HOSTED"] = 128] = "HOSTED";
  WAJIDDomains2[WAJIDDomains2["HOSTED_LID"] = 129] = "HOSTED_LID";
})(WAJIDDomains || (WAJIDDomains = {}));
const getServerFromDomainType = (initialServer, domainType) => {
  switch (domainType) {
    case WAJIDDomains.LID:
      return "lid";
    case WAJIDDomains.HOSTED:
      return "hosted";
    case WAJIDDomains.HOSTED_LID:
      return "hosted.lid";
    case WAJIDDomains.WHATSAPP:
    default:
      return initialServer;
  }
};
const jidEncode = (user, server, device, agent) => {
  return `${user || ""}${!!agent ? `_${agent}` : ""}${!!device ? `:${device}` : ""}@${server || "lid"}`;
};
const jidDecode = (jid) => {
  const sepIdx = typeof jid === "string" ? jid.indexOf("@") : -1;
  if (sepIdx < 0) {
    return void 0;
  }
  const server = jid.slice(sepIdx + 1);
  const userCombined = jid.slice(0, sepIdx);
  const [userAgent, device] = userCombined.split(":");
  const [user, agent] = userAgent.split("_");
  let domainType = WAJIDDomains.WHATSAPP;
  if (server === "lid") {
    domainType = WAJIDDomains.LID;
  } else if (server === "hosted") {
    domainType = WAJIDDomains.HOSTED;
  } else if (server === "hosted.lid") {
    domainType = WAJIDDomains.HOSTED_LID;
  } else if (agent) {
    domainType = parseInt(agent);
  }
  return { server, user, domainType, device: device ? +device : void 0 };
};
const areJidsSameUser = (jid1, jid2) => jidDecode(jid1)?.user === jidDecode(jid2)?.user;
const isJidMetaAI = (jid) => jid?.endsWith("@bot");
const isPnUser = (jid) => jid?.endsWith("@s.whatsapp.net");
const isLidUser = (jid) => jid?.endsWith("@lid");
const isJidBroadcast = (jid) => jid?.endsWith("@broadcast");
const isJidGroup = (jid) => jid?.endsWith("@g.us");
const isJidStatusBroadcast = (jid) => jid === "status@broadcast";
const isJidNewsletter = (jid) => jid?.endsWith("@newsletter");
const isHostedPnUser = (jid) => jid?.endsWith("@hosted");
const isHostedLidUser = (jid) => jid?.endsWith("@hosted.lid");
const botRegexp = /^1313555\d{4}$|^131655500\d{2}$/;
const isJidBot = (jid) => jid && botRegexp.test(jid.split("@")[0]) && jid.endsWith("@c.us");
const jidNormalizedUser = (jid) => {
  const result = jidDecode(jid);
  if (!result) {
    return "";
  }
  const { user, server } = result;
  return jidEncode(user, server === "c.us" ? "s.whatsapp.net" : server);
};
const transferDevice = (fromJid, toJid) => {
  const fromDecoded = jidDecode(fromJid);
  const deviceId = fromDecoded?.device || 0;
  const { server, user } = jidDecode(toJid);
  return jidEncode(user, server, deviceId);
};
export {
  META_AI_JID,
  OFFICIAL_BIZ_JID,
  PSA_WID,
  SERVER_JID,
  STORIES_JID,
  S_WHATSAPP_NET,
  WAJIDDomains,
  areJidsSameUser,
  getServerFromDomainType,
  isHostedLidUser,
  isHostedPnUser,
  isJidBot,
  isJidBroadcast,
  isJidGroup,
  isJidMetaAI,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidDecode,
  jidEncode,
  jidNormalizedUser,
  transferDevice
};
