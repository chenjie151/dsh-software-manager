/**
 * 把会话扫描出的"安装记录"落到真实系统状态：装在哪、还在不在、是哪个版本。
 *
 * 位置来源分级（UI 会标注）：
 *   command       命令里就写了安装目录
 *   package-index 由包管理器自己的清单反查（pip / npm）
 *   registry      Windows 卸载项
 *   default-path  包管理器默认前缀，实测该路径存在
 *   where         从 PATH 里找到同名可执行文件
 *   none          没能定位
 */

import fs from "node:fs";
import path from "node:path";

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function exists(target) {
  if (!target) return false;
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function firstExisting(candidates) {
  for (const candidate of candidates) if (exists(candidate)) return candidate;
  return null;
}

/**
 * 依赖清单 / 安装脚本这类"不是软件"的条目，位置指它的文件本身。
 * 目录优先用条目记录的 cwd（命令里的 cd），再退回 locationHint。
 */
function resolveSideFile(item) {
  const name = String(item?.package || "").replace(/["']/g, "");
  if (!name) return null;
  if (path.isAbsolute(name)) return name;
  const base = item?.cwd || item?.locationHint || null;
  if (!base) return null;
  try {
    return path.join(base, name);
  } catch {
    return null;
  }
}

function prefixOf(installer) {
  const env = process.env;
  switch (installer) {
    case "cargo":
      return env.USERPROFILE ? path.join(env.USERPROFILE, ".cargo") : null;
    case "uv":
      return env.USERPROFILE ? path.join(env.USERPROFILE, ".local") : null;
    case "dotnet":
      return env.USERPROFILE ? path.join(env.USERPROFILE, ".dotnet", "tools") : null;
    case "choco":
      return env.ProgramData ? path.join(env.ProgramData, "chocolatey", "lib") : null;
    case "scoop": {
      const root = env.SCOOP || (env.USERPROFILE ? path.join(env.USERPROFILE, "scoop") : null);
      return root ? path.join(root, "apps") : null;
    }
    default:
      return null;
  }
}

function scoreRegistry(pkg, entry) {
  const pkgNorm = normalizeName(pkg);
  if (!pkgNorm) return 0;
  const tail = normalizeName(String(pkg).split(/[./\\]/).pop());
  if (entry.normalized === pkgNorm) return 100;
  if (tail && entry.normalized === tail) return 95;
  if (tail && entry.normalized.startsWith(tail)) return 75;
  if (entry.normalized.includes(pkgNorm)) return 60;
  if (tail && tail.length >= 3 && entry.normalized.includes(tail)) return 50;
  return 0;
}

function directoryOfUninstall(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/"?([A-Za-z]:\\[^"]+?\.exe)"?/);
  if (!match) return null;
  return path.dirname(match[1]);
}

function fromRegistry(pkg, registry) {
  let best = null;
  let bestScore = 0;
  for (const entry of registry) {
    const score = scoreRegistry(pkg, entry);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    } else if (score === bestScore && score > 0 && best) {
      // 同分时优先带安装目录的那条
      if (!best.location && entry.location) best = entry;
    }
  }
  if (!best) return null;
  return {
    entry: best,
    score: bestScore,
    location: best.location || directoryOfUninstall(best.uninstall) || null,
  };
}

/**
 * 把内部 state 翻成一句人话，解释"这个状态是怎么来的"。
 * UI 的状态列 hover 与详情里都会用它，避免用户看到"已不存在"却不知道含义。
 */
/**
 * 「已卸载」记录保留 7 天：超过这个时间就自动从列表里消失。
 * 数据源仍是会话日志，这里只决定显不显示；时间以最近一次出现为准。
 */
export const RETENTION_DAYS = 7;

export function isExpired(item, now = Date.now()) {
  const seenAt = item?.time ?? item?.firstSeen ?? null;
  if (!seenAt) return false;
  return now - seenAt > RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export function explainState(located, item) {
  if (!located) return "正在查询系统状态…";
  const name = item?.package ? `「${item.package}」` : "这个软件";
  switch (located.state) {
    case "installed":
      return `${name}在当前系统里存在，位置来自${sourceText(located.locationSource)}。卸载会调用它对应的包管理器或卸载程序。`;
    case "missing":
      return `${name}当年被命令装过，现在系统里已经查不到了——它已被卸载或删除，这条记录保留备查，没有可卸载的内容。`;
    case "batch":
      return `${name}是一份依赖清单，不是单个软件。它里面包含哪些包、装了没有，要按清单逐个看，所以不能当作一个软件来卸载。`;
    case "script":
      return `${name}是一个安装脚本，它自己决定装什么、装到哪。本插件只能看到脚本跑过，无法知道它具体装了哪些东西，所以只能手动处理。`;
    case "unknown":
      return `${name}的状态无法确认：${located.detail ? located.detail + "。" : ""}可能装在了本插件检测不到的环境里。`;
    default:
      return `${name}的状态未知。`;
  }
}

function sourceText(source) {
  switch (source) {
    case "command":
      return "当初命令里写的路径";
    case "package-index":
      return "包管理器自己的已装清单";
    case "registry":
      return "Windows 卸载项注册表";
    case "default-path":
      return "包管理器的默认安装前缀";
    case "where":
      return "系统 PATH 里的同名程序";
    default:
      return "未定位";
  }
}

/**
 * @param {{ prober: ReturnType<import('./probe.js').createProber>, logger?: any }} deps
 */
export function createLocator({ prober, logger }) {
  async function locate(item) {
    const checkedAt = Date.now();
    const base = { checkedAt, location: null, locationSource: "none", version: item.version ?? null, uninstall: null, detail: null };

    // 0) 不是"一个软件"，而是清单/脚本：没有单点状态可查，单独归类，
    //    既不能显示成"已不存在"（会让人以为装过又没了），也不能给卸载。
    //    位置显示清单/脚本文件本身，绝不显示成"安装目录"，免得被误读。
    if (item.kind === "requirements") {
      const file = resolveSideFile(item);
      return {
        ...base,
        state: "batch",
        location: file && exists(file) ? file : null,
        locationSource: file && exists(file) ? "command" : "none",
        detail: "这是依赖清单文件本身，不是软件安装目录；清单里有哪些包、装了没有，要按包名逐个看",
      };
    }
    if (item.installer === "script") {
      const file = resolveSideFile(item);
      return {
        ...base,
        state: "script",
        location: file && exists(file) ? file : null,
        locationSource: file && exists(file) ? "command" : "none",
        detail: "这是安装脚本文件本身；脚本装了什么由脚本决定，本插件看不到细节",
      };
    }

    // 1) 命令里已经给出安装目录（绿色包 / 解压 / clone）
    if (item.kind === "directory") {
      const hint = item.locationHint;
      if (hint && exists(hint)) {
        return { ...base, state: "installed", location: hint, locationSource: "command" };
      }
      if (hint) {
        return { ...base, state: "missing", location: hint, locationSource: "command", detail: "命令里记录的目录已不存在" };
      }
    }

    if (item.installer === "pip") {
      const list = await prober.pythonPackages(item.interpreter, item.cwd);
      if (!list.available) {
        return { ...base, state: "unknown", detail: list.reason ?? "找不到可用的 Python 解释器" };
      }
      const hit = list.packages.get(normalizeName(item.package));
      if (hit) {
        // locate_file('') 对 wheel 安装返回 site-packages 本身；用 purelib 兜底
        const dir = list.purelib || hit.path || null;
        return {
          ...base,
          state: "installed",
          location: dir,
          locationSource: "package-index",
          version: hit.version ?? base.version,
          detail: hit.path ? `${hit.name} ${hit.version ?? ""}`.trim() : null,
        };
      }
      return { ...base, state: "missing", detail: "当前解释器的已装包列表里没有这个包" };
    }

    if (item.installer === "npm" || item.installer === "yarn" || item.installer === "pnpm" || item.installer === "bun") {
      if (item.installer === "pnpm") {
        const root = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "pnpm", "global", "5", "node_modules") : null;
        const target = root ? path.join(root, item.package) : null;
        if (target && exists(target)) {
          return { ...base, state: "installed", location: target, locationSource: "default-path" };
        }
        return { ...base, state: "unknown", detail: "pnpm 全局目录未确认" };
      }
      const npm = await prober.npmGlobal();
      if (!npm.available) return { ...base, state: "unknown", detail: "npm 不可用（命令失败或未安装）" };
      const key = String(item.package).toLowerCase();
      const hit = npm.packages.get(key);
      const target = npm.root ? path.join(npm.root, item.package) : null;
      if (hit || (target && exists(target))) {
        return {
          ...base,
          state: "installed",
          location: target,
          locationSource: "package-index",
          version: hit?.version ?? base.version,
        };
      }
      return { ...base, state: "missing", detail: "npm 全局清单里没有这个包" };
    }

    if (item.installer === "cargo" || item.installer === "uv" || item.installer === "dotnet" || item.installer === "choco" || item.installer === "scoop") {
      const prefix = prefixOf(item.installer);
      if (prefix) {
        const exeNames = [`${item.package}.exe`, `${item.package}.cmd`, `${item.package}.bat`];
        const candidates =
          item.installer === "choco" || item.installer === "scoop"
            ? [path.join(prefix, item.package)]
            : exeNames.map((name) => path.join(prefix, name));
        const hit = firstExisting(candidates);
        if (hit) return { ...base, state: "installed", location: hit, locationSource: "default-path" };
        return { ...base, state: "missing", location: prefix, locationSource: "default-path", detail: "默认安装前缀下没有找到" };
      }
    }

    if (item.installer === "gem") {
      const found = await prober.whereExe(item.package);
      if (found) return { ...base, state: "installed", location: found, locationSource: "where" };
      return { ...base, state: "unknown", detail: "gem 安装位置未解析" };
    }

    if (item.installer === "msi") {
      const found = await prober.whereExe(path.basename(item.package, path.extname(item.package)));
      return {
        ...base,
        state: found ? "installed" : "unknown",
        location: found,
        locationSource: found ? "where" : "none",
        uninstall: item.locationHint ? `msiexec /x "${item.locationHint}" /qn /norestart` : null,
        detail: item.locationHint ? `安装包：${item.locationHint}` : null,
      };
    }

    // winget / msi / 其它包装器：走注册表
    const registry = await prober.registryIndex();
    if (registry.length > 0) {
      const found = fromRegistry(item.package, registry);
      if (found && found.score > 0) {
        return {
          ...base,
          state: found.location && exists(found.location) ? "installed" : found.location ? "installed" : "unknown",
          location: found.location,
          locationSource: "registry",
          version: found.entry.version ?? base.version,
          uninstall: found.entry.quietUninstall || found.entry.uninstall || null,
          detail: found.entry.name,
        };
      }
    }

    // 最后兜底：PATH 里有没有同名可执行文件
    const bare = String(item.package).split(/[./\\]/).pop();
    const found = await prober.whereExe(bare);
    if (found) return { ...base, state: "installed", location: found, locationSource: "where" };

    return { ...base, state: "unknown", detail: registry.length > 0 ? "注册表与 PATH 都没有匹配项" : "系统卸载项读取失败" };
  }

  return {
    async locateMany(items, { concurrency = 4 } = {}) {
      const results = {};
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
        for (;;) {
          const index = cursor;
          cursor += 1;
          if (index >= items.length) return;
          const item = items[index];
          try {
            results[item.id] = await locate(item);
          } catch (error) {
            logger?.warn?.(`software-manager: locate ${item.id} failed: ${error?.message ?? error}`);
            results[item.id] = {
              state: "unknown",
              checkedAt: Date.now(),
              location: null,
              locationSource: "none",
              version: item.version ?? null,
              uninstall: null,
              detail: String(error?.message ?? error),
            };
          }
        }
      });
      await Promise.all(workers);
      return results;
    },
    locate,
  };
}
