var CompanionWebClientType;
(function(CompanionWebClientType2) {
  CompanionWebClientType2[CompanionWebClientType2["UNKNOWN"] = 0] = "UNKNOWN";
  CompanionWebClientType2[CompanionWebClientType2["CHROME"] = 1] = "CHROME";
  CompanionWebClientType2[CompanionWebClientType2["EDGE"] = 2] = "EDGE";
  CompanionWebClientType2[CompanionWebClientType2["FIREFOX"] = 3] = "FIREFOX";
  CompanionWebClientType2[CompanionWebClientType2["IE"] = 4] = "IE";
  CompanionWebClientType2[CompanionWebClientType2["OPERA"] = 5] = "OPERA";
  CompanionWebClientType2[CompanionWebClientType2["SAFARI"] = 6] = "SAFARI";
  CompanionWebClientType2[CompanionWebClientType2["ELECTRON"] = 7] = "ELECTRON";
  CompanionWebClientType2[CompanionWebClientType2["UWP"] = 8] = "UWP";
  CompanionWebClientType2[CompanionWebClientType2["OTHER_WEB_CLIENT"] = 9] = "OTHER_WEB_CLIENT";
})(CompanionWebClientType || (CompanionWebClientType = {}));
const BROWSER_TO_COMPANION_WEB_CLIENT = { Chrome: CompanionWebClientType.CHROME, Edge: CompanionWebClientType.EDGE, Firefox: CompanionWebClientType.FIREFOX, IE: CompanionWebClientType.IE, Opera: CompanionWebClientType.OPERA, Safari: CompanionWebClientType.SAFARI };
const getCompanionWebClientType = ([os, browserName]) => {
  if (browserName === "Desktop") {
    return os === "Windows" ? CompanionWebClientType.UWP : CompanionWebClientType.ELECTRON;
  }
  return BROWSER_TO_COMPANION_WEB_CLIENT[browserName] || CompanionWebClientType.OTHER_WEB_CLIENT;
};
const getCompanionPlatformId = (browser) => {
  return getCompanionWebClientType(browser).toString();
};
const buildPairingQRData = (ref, noiseKeyB64, identityKeyB64, advB64, browser) => {
  return "https://wa.me/settings/linked_devices#" + [ref, noiseKeyB64, identityKeyB64, advB64, getCompanionPlatformId(browser)].join(",");
};
export {
  CompanionWebClientType,
  buildPairingQRData,
  getCompanionPlatformId,
  getCompanionWebClientType
};
