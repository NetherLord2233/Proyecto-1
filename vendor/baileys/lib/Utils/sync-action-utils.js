import { proto } from "../../WAProto/index.js";
import { isLidUser, isPnUser } from "../WABinary/index.js";
const processContactAction = (action, id, logger) => {
  const results = [];
  if (!id) {
    logger?.warn({ hasFullName: !!action.fullName, hasLidJid: !!action.lidJid, hasPnJid: !!action.pnJid }, "contactAction sync: missing id in index");
    return results;
  }
  const lidJid = action.lidJid;
  const idIsPn = isPnUser(id);
  const phoneNumber = idIsPn ? id : action.pnJid || void 0;
  results.push({ event: "contacts.upsert", data: [{ id, name: action.fullName || action.firstName || action.username || void 0, username: action.username || void 0, lid: lidJid || void 0, phoneNumber }] });
  if (lidJid && isLidUser(lidJid) && idIsPn) {
    results.push({ event: "lid-mapping.update", data: { lid: lidJid, pn: id } });
  }
  return results;
};
const emitSyncActionResults = (ev, results) => {
  for (const result of results) {
    if (result.event === "contacts.upsert") {
      ev.emit("contacts.upsert", result.data);
    } else {
      ev.emit("lid-mapping.update", result.data);
    }
  }
};
export {
  emitSyncActionResults,
  processContactAction
};
