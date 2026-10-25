import { EventEmitter } from "events";
import { URL } from "url";
class AbstractSocketClient extends EventEmitter {
  constructor(url, config) {
    super();
    this.url = url;
    this.config = config;
    this.setMaxListeners(0);
  }
}
export {
  AbstractSocketClient
};
