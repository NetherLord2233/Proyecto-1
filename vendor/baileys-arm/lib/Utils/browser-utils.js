import { platform, release } from "os";
import { proto } from "../../WAProto/index.js";
const PLATFORM_MAP = { aix: "AIX", darwin: "Mac OS", win32: "Windows", android: "Android", freebsd: "FreeBSD", openbsd: "OpenBSD", sunos: "Solaris", linux: void 0, haiku: void 0, cygwin: void 0, netbsd: void 0 };
const Browsers = { ubuntu: (browser) => ["Ubuntu", browser, "22.04.4"], macOS: (browser) => ["Mac OS", browser, "14.4.1"], baileys: (browser) => ["Baileys", browser, "6.5.0"], windows: (browser) => ["Windows", browser, "10.0.22631"], appropriate: (browser) => [PLATFORM_MAP[platform()] || "Ubuntu", browser, release()] };
const getPlatformId = (browser) => {
  const platformType = proto.DeviceProps.PlatformType[browser.toUpperCase()];
  return platformType ? platformType.toString() : "1";
};
export {
  Browsers,
  getPlatformId
};
