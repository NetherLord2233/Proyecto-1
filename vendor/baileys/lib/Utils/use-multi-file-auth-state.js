import { Mutex } from "async-mutex";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { proto } from "../../WAProto/index.js";
import { initAuthCreds } from "./auth-utils.js";
import { BufferJSON } from "./generics.js";
const fileLocks = new Map();
const getFileLock = (path) => {
  let mutex = fileLocks.get(path);
  if (!mutex) {
    mutex = new Mutex();
    fileLocks.set(path, mutex);
  }
  return mutex;
};
const pruneStaleAuthFiles = async (folder, { maxAgeDays = 14, categories = ["sender-key-memory"], dryRun = false } = {}) => {
  let entries;
  try {
    entries = await readdir(folder);
  } catch {
    return { scanned: 0, removed: 0 };
  }
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1e3;
  let scanned = 0;
  let removed = 0;
  await Promise.all(entries.map(async (name) => {
    if (!categories.some((cat) => name.startsWith(`${cat}-`) && name.endsWith(".json"))) return;
    scanned++;
    const filePath = join(folder, name);
    try {
      const info = await stat(filePath);
      if (info.mtimeMs < cutoff) {
        if (!dryRun) await unlink(filePath).catch(() => {
        });
        removed++;
      }
    } catch {
    }
  }));
  return { scanned, removed };
};
const useMultiFileAuthState = async (folder) => {
  const writeData = async (data, file) => {
    const filePath = join(folder, fixFileName(file));
    const mutex = getFileLock(filePath);
    return mutex.acquire().then(async (release) => {
      try {
        await writeFile(filePath, JSON.stringify(data, BufferJSON.replacer));
      } finally {
        release();
      }
    });
  };
  const readData = async (file) => {
    try {
      const filePath = join(folder, fixFileName(file));
      const mutex = getFileLock(filePath);
      return await mutex.acquire().then(async (release) => {
        try {
          const data = await readFile(filePath, { encoding: "utf-8" });
          return JSON.parse(data, BufferJSON.reviver);
        } finally {
          release();
        }
      });
    } catch (error) {
      return null;
    }
  };
  const removeData = async (file) => {
    try {
      const filePath = join(folder, fixFileName(file));
      const mutex = getFileLock(filePath);
      return mutex.acquire().then(async (release) => {
        try {
          await unlink(filePath);
        } catch {
        } finally {
          release();
        }
      });
    } catch {
    }
  };
  const folderInfo = await stat(folder).catch(() => {
  });
  if (folderInfo) {
    if (!folderInfo.isDirectory()) {
      throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
    }
  } else {
    await mkdir(folder, { recursive: true });
  }
  const fixFileName = (file) => file?.replace(/\//g, "__")?.replace(/:/g, "-");
  const creds = await readData("creds.json") || initAuthCreds();
  pruneStaleAuthFiles(folder).catch(() => {
  });
  return { state: { creds, keys: { get: async (type, ids) => {
    const data = {};
    await Promise.all(ids.map(async (id) => {
      let value = await readData(`${type}-${id}.json`);
      if (type === "app-state-sync-key" && value) {
        value = proto.Message.AppStateSyncKeyData.fromObject(value);
      }
      data[id] = value;
    }));
    return data;
  }, set: async (data) => {
    const tasks = [];
    for (const category in data) {
      for (const id in data[category]) {
        const value = data[category][id];
        const file = `${category}-${id}.json`;
        tasks.push(value ? writeData(value, file) : removeData(file));
      }
    }
    await Promise.all(tasks);
  } } }, saveCreds: async () => {
    return writeData(creds, "creds.json");
  } };
};
export {
  pruneStaleAuthFiles,
  useMultiFileAuthState
};
