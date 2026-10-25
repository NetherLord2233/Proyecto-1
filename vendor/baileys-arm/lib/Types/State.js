import { Boom } from "@hapi/boom";
var SyncState;
(function(SyncState2) {
  SyncState2[SyncState2["Connecting"] = 0] = "Connecting";
  SyncState2[SyncState2["AwaitingInitialSync"] = 1] = "AwaitingInitialSync";
  SyncState2[SyncState2["Syncing"] = 2] = "Syncing";
  SyncState2[SyncState2["Online"] = 3] = "Online";
})(SyncState || (SyncState = {}));
var ReachoutTimelockEnforcementType;
(function(ReachoutTimelockEnforcementType2) {
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_ALCOHOL"] = "BIZ_COMMERCE_VIOLATION_ALCOHOL";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_ADULT"] = "BIZ_COMMERCE_VIOLATION_ADULT";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_ANIMALS"] = "BIZ_COMMERCE_VIOLATION_ANIMALS";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_BODY_PARTS_FLUIDS"] = "BIZ_COMMERCE_VIOLATION_BODY_PARTS_FLUIDS";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_DATING"] = "BIZ_COMMERCE_VIOLATION_DATING";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_DIGITAL_SERVICES_PRODUCTS"] = "BIZ_COMMERCE_VIOLATION_DIGITAL_SERVICES_PRODUCTS";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_DRUGS"] = "BIZ_COMMERCE_VIOLATION_DRUGS";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_DRUGS_ONLY_OTC"] = "BIZ_COMMERCE_VIOLATION_DRUGS_ONLY_OTC";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_GAMBLING"] = "BIZ_COMMERCE_VIOLATION_GAMBLING";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_HEALTHCARE"] = "BIZ_COMMERCE_VIOLATION_HEALTHCARE";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_REAL_FAKE_CURRENCY"] = "BIZ_COMMERCE_VIOLATION_REAL_FAKE_CURRENCY";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_SUPPLEMENTS"] = "BIZ_COMMERCE_VIOLATION_SUPPLEMENTS";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_TOBACCO"] = "BIZ_COMMERCE_VIOLATION_TOBACCO";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_VIOLENT_CONTENT"] = "BIZ_COMMERCE_VIOLATION_VIOLENT_CONTENT";
  ReachoutTimelockEnforcementType2["BIZ_COMMERCE_VIOLATION_WEAPONS"] = "BIZ_COMMERCE_VIOLATION_WEAPONS";
  ReachoutTimelockEnforcementType2["BIZ_QUALITY"] = "BIZ_QUALITY";
  ReachoutTimelockEnforcementType2["DEFAULT"] = "DEFAULT";
  ReachoutTimelockEnforcementType2["WEB_COMPANION_ONLY"] = "WEB_COMPANION_ONLY";
})(ReachoutTimelockEnforcementType || (ReachoutTimelockEnforcementType = {}));
var NewChatMessageCappingStatusType;
(function(NewChatMessageCappingStatusType2) {
  NewChatMessageCappingStatusType2["NONE"] = "NONE";
  NewChatMessageCappingStatusType2["FIRST_WARNING"] = "FIRST_WARNING";
  NewChatMessageCappingStatusType2["SECOND_WARNING"] = "SECOND_WARNING";
  NewChatMessageCappingStatusType2["CAPPED"] = "CAPPED";
})(NewChatMessageCappingStatusType || (NewChatMessageCappingStatusType = {}));
var NewChatMessageCappingMVStatusType;
(function(NewChatMessageCappingMVStatusType2) {
  NewChatMessageCappingMVStatusType2["NOT_ELIGIBLE"] = "NOT_ELIGIBLE";
  NewChatMessageCappingMVStatusType2["NOT_ACTIVE"] = "NOT_ACTIVE";
  NewChatMessageCappingMVStatusType2["ACTIVE"] = "ACTIVE";
  NewChatMessageCappingMVStatusType2["ACTIVE_UPGRADE_AVAILABLE"] = "ACTIVE_UPGRADE_AVAILABLE";
})(NewChatMessageCappingMVStatusType || (NewChatMessageCappingMVStatusType = {}));
var NewChatMessageCappingOTEStatusType;
(function(NewChatMessageCappingOTEStatusType2) {
  NewChatMessageCappingOTEStatusType2["NOT_ELIGIBLE"] = "NOT_ELIGIBLE";
  NewChatMessageCappingOTEStatusType2["ELIGIBLE"] = "ELIGIBLE";
  NewChatMessageCappingOTEStatusType2["ACTIVE_IN_CURRENT_CYCLE"] = "ACTIVE_IN_CURRENT_CYCLE";
  NewChatMessageCappingOTEStatusType2["EXHAUSTED"] = "EXHAUSTED";
})(NewChatMessageCappingOTEStatusType || (NewChatMessageCappingOTEStatusType = {}));
export {
  NewChatMessageCappingMVStatusType,
  NewChatMessageCappingOTEStatusType,
  NewChatMessageCappingStatusType,
  ReachoutTimelockEnforcementType,
  SyncState
};
