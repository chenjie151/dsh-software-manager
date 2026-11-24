/**
 * 「已卸载」记录的删除（遗忘）清单。
 *
 * 会话日志是唯一数据源，重扫必然把历史命令再解析出来；所以"彻底删掉一条记录"
 * 只能靠一份持久的忽略清单：把这些条目 id 记下来，扫描结果里直接滤掉。
 * 文件很小（每条约 40 字节），永久保留，不做过期清理——清掉它记录反而会复活。
 */

import fs from "node:fs";
import path from "node:path";

const VERSION = 1;
const DIR_NAME = "software-manager";
const FILE_NAME = "forgotten.json";

export function createStore({ home, logger }) {
  const dir = path.join(home, DIR_NAME);
  const file = path.join(dir, FILE_NAME);
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const ignored =
        parsed && typeof parsed.ignored === "object" && parsed.ignored !== null ? parsed.ignored : {};
      cache = { version: VERSION, ignored };
    } catch {
      cache = { version: VERSION, ignored: {} };
    }
    return cache;
  }

  function save(next) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
      cache = next;
      return true;
    } catch (error) {
      logger?.warn?.(`software-manager: save forgotten failed: ${error?.message ?? error}`);
      return false;
    }
  }

  function isIgnored(id) {
    if (typeof id !== "string" || !id) return false;
    return Object.prototype.hasOwnProperty.call(load().ignored, id);
  }

  /** 记下要永久隐藏的条目 id。返回成功写入的条数。 */
  function ignore(ids) {
    const current = load();
    const ignored = { ...current.ignored };
    const now = Date.now();
    let changed = 0;
    for (const id of ids) {
      if (typeof id !== "string" || !id) continue;
      if (Object.prototype.hasOwnProperty.call(ignored, id)) continue;
      ignored[id] = { at: now };
      changed += 1;
    }
    if (changed === 0) return 0;
    return save({ version: VERSION, ignored }) ? changed : 0;
  }

  /** 撤销删除，让记录重新出现。 */
  function restore(ids) {
    const current = load();
    const ignored = { ...current.ignored };
    let changed = 0;
    for (const id of ids) {
      if (typeof id !== "string" || !id) continue;
      if (!Object.prototype.hasOwnProperty.call(ignored, id)) continue;
      delete ignored[id];
      changed += 1;
    }
    if (changed === 0) return 0;
    return save({ version: VERSION, ignored }) ? changed : 0;
  }

  return { isIgnored, ignore, restore, file, count: () => Object.keys(load().ignored).length };
}
