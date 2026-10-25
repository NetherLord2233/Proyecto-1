import { assertNodeErrorFree } from "../../WABinary/index.js";
class USyncDisappearingModeProtocol {
  constructor() {
    this.name = "disappearing_mode";
  }
  getQueryElement() {
    return { tag: "disappearing_mode", attrs: {} };
  }
  getUserElement() {
    return null;
  }
  parser(node) {
    if (node.tag === "disappearing_mode") {
      assertNodeErrorFree(node);
      const duration = +node?.attrs.duration;
      const setAt = new Date(+(node?.attrs.t || 0) * 1e3);
      return { duration, setAt };
    }
  }
}
export {
  USyncDisappearingModeProtocol
};
