export * from "./Auth.js";
export * from "./GroupMetadata.js";
export * from "./Chat.js";
export * from "./Contact.js";
export * from "./State.js";
export * from "./Message.js";
export * from "./Socket.js";
export * from "./Events.js";
export * from "./Product.js";
export * from "./Call.js";
export * from "./Signal.js";
export * from "./Mex.js";
var DisconnectReason;
(function(DisconnectReason2) {
  DisconnectReason2[DisconnectReason2["connectionClosed"] = 428] = "connectionClosed";
  DisconnectReason2[DisconnectReason2["connectionLost"] = 408] = "connectionLost";
  DisconnectReason2[DisconnectReason2["connectionReplaced"] = 440] = "connectionReplaced";
  DisconnectReason2[DisconnectReason2["timedOut"] = 408] = "timedOut";
  DisconnectReason2[DisconnectReason2["loggedOut"] = 401] = "loggedOut";
  DisconnectReason2[DisconnectReason2["badSession"] = 500] = "badSession";
  DisconnectReason2[DisconnectReason2["restartRequired"] = 515] = "restartRequired";
  DisconnectReason2[DisconnectReason2["multideviceMismatch"] = 411] = "multideviceMismatch";
  DisconnectReason2[DisconnectReason2["forbidden"] = 403] = "forbidden";
  DisconnectReason2[DisconnectReason2["unavailableService"] = 503] = "unavailableService";
})(DisconnectReason || (DisconnectReason = {}));
export {
  DisconnectReason
};
