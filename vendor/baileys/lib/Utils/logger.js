import P from "pino";
var logger_default = P({ timestamp: () => `,"time":"${(new Date()).toJSON()}"` });
export {
  logger_default as default
};
