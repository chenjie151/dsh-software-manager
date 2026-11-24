/**
 * dsh-software-manager —— host 侧。
 *
 * 提供三个同源接口：
 *   POST /api/dsh-software-manager/scan       扫描会话日志，列出 harness 装过的软件
 *   POST /api/dsh-software-manager/locate     对这些条目做系统侧定位（装在哪 / 还在不在）
 *   POST /api/dsh-software-manager/uninstall  按条目 id 生成并执行卸载命令
 *   POST /api/dsh-software-manager/reveal     在资源管理器里打开安装位置
 */

import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { createLocator, explainState, isExpired, RETENTION_DAYS } from "./locate.js";
import { createProber } from "./probe.js";
import { createSessionScanner } from "./scan.js";
import { createStore } from "./store.js";
import { planReinstall, planUninstall, runUninstall } from "./uninstall.js";

export const name = "dsh-software-manager";
export const inject = ["webServer"];

const BRIDGE = "/api/dsh-software-manager";
const MAX_BODY = 1024 * 1024;

function makeLogger(ctx) {
  const base = ctx?.logger;
  if (base && typeof base.warn === "function") return base;
  if (typeof base === "function") {
    try {
      const scoped = base("dsh-software-manager");
      if (scoped && typeof scoped.warn === "function") return scoped;
    } catch {
      /* ignore */
    }
  }
  return {
    debug: (message) => console.debug(message),
    info: (message) => console.info(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
  };
}

function writeJson(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        resolve(undefined);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

function isLocalRequest(req) {
  const host = String(req.headers?.host ?? "");
  if (!/^(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/i.test(host)) return false;
  if (req.headers?.["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers?.origin;
  if (typeof origin === "string" && origin.length > 0) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function authRejection(req, getConnection) {
  let connection;
  try {
    connection = getConnection();
  } catch {
    connection = undefined;
  }
  if (!connection) return undefined;
  try {
    const reject = connection.requestRejection;
    if (typeof reject === "function") return reject.call(connection, req) ?? undefined;
  } catch {
    return 503;
  }
  return undefined;
}

function guard(req, res, getConnection) {
  const rejection = authRejection(req, getConnection);
  if (rejection !== undefined) {
    writeJson(res, rejection, { ok: false, error: "host authentication required" });
    return false;
  }
  if (!isLocalRequest(req)) {
    writeJson(res, 403, { ok: false, error: "requests must come from the local host" });
    return false;
  }
  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method ?? ""}` });
    return false;
  }
  return true;
}

function revealFolder(target) {
  if (!target) return;
  const clean = path.win32.normalize(String(target));
  exec(`explorer.exe "${clean.replace(/"/g, '""')}"`, { windowsHide: false }, () => {
    /* explorer 的退出码不可靠，忽略 */
  });
}

export function apply(ctx, config = {}) {
  const logger = makeLogger(ctx);
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const store = createStore({ home, logger });
  const scanner = createSessionScanner({ home, logger, isIgnored: store.isIgnored });
  const prober = createProber({ logger });
  const locator = createLocator({ prober, logger });

  const itemsById = new Map();
  const locationCache = new Map();
  let lastScan = null;

  ctx.inject(["webServer"], (sctx) => {
    sctx.effect(() => {
      const getConnection = () => sctx.get("connection");
      const register = (route) => sctx.get("webServer").register(route);
      const disposers = [];
      const add = (suffix, handler) => {
        disposers.push(
          register({
            kind: "exact",
            path: `${BRIDGE}/${suffix}`,
            handler,
          }),
        );
      };

      add("scan", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        try {
          const result = scanner.scan({ force: body.force === true });
          itemsById.clear();
          for (const item of result.items) itemsById.set(item.id, item);
          if (body.force === true) locationCache.clear();
          lastScan = result.stats;
          writeJson(res, 200, { ok: true, items: result.items, stats: result.stats });
        } catch (error) {
          logger.warn(`software-manager: scan failed: ${error?.message ?? error}`);
          writeJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      });

      add("locate", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        const ids = Array.isArray(body.ids) ? body.ids.filter((id) => itemsById.has(id)) : [...itemsById.keys()];
        const pending = ids.map((id) => itemsById.get(id)).filter(Boolean);
        if (pending.length === 0) {
          writeJson(res, 200, { ok: true, locations: {}, note: "没有待定位的条目，请先扫描" });
          return;
        }
        try {
          const locations = await locator.locateMany(pending, { concurrency: Number(body.concurrency) || 3 });
          const enriched = {};
          for (const id of ids) {
            const item = itemsById.get(id);
            const value = locations[id];
            if (!item || !value) continue;
            const plan = planUninstall(item, value);
            enriched[id] = {
              ...value,
              expired: isExpired(item),
              retentionDays: RETENTION_DAYS,
              explain: explainState(value, item),
              plan: plan.ok
                ? { command: plan.command, danger: plan.danger === true, note: plan.note ?? null }
                : { reason: plan.reason ?? "无法生成卸载命令", gone: plan.gone === true },
            };
            locationCache.set(id, enriched[id]);
          }
          writeJson(res, 200, { ok: true, locations: enriched });
        } catch (error) {
          logger.warn(`software-manager: locate failed: ${error?.message ?? error}`);
          writeJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      });

      // 彻底删除记录：进忽略清单，之后重扫也不会再出现。
      add("forget", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id) : [];
        if (ids.length === 0) {
          writeJson(res, 400, { ok: false, error: "ids is required" });
          return;
        }
        const removed = store.ignore(ids);
        for (const id of ids) {
          itemsById.delete(id);
          locationCache.delete(id);
        }
        writeJson(res, 200, { ok: true, removed, file: store.file });
      });

      // 撤销删除：把 id 从忽略清单里拿掉，下次扫描重新出现。
      add("restore", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id) : [];
        if (ids.length === 0) {
          writeJson(res, 400, { ok: false, error: "ids is required" });
          return;
        }
        writeJson(res, 200, { ok: true, restored: store.restore(ids) });
      });

      // 彻底删除记录：进忽略清单，之后重扫也不会再出现。
      add("hidden", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        writeJson(res, 200, { ok: true, count: store.count(), file: store.file });
      });

      add("uninstall", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) {
          writeJson(res, 400, { ok: false, error: "ids is required" });
          return;
        }
        const confirmDanger = body.confirmDanger === true;
        const results = [];
        // 串行执行：同时跑多个卸载器容易互相抢文件锁
        for (const id of ids) {
          const item = itemsById.get(id);
          if (!item) {
            results.push({ id, ok: false, reason: "条目已失效，请重新扫描" });
            continue;
          }
          let located = locationCache.get(id);
          if (!located) {
            try {
              located = await locator.locate(item);
              locationCache.set(id, located);
            } catch (error) {
              located = null;
              logger.warn(`software-manager: locate before uninstall failed: ${error?.message ?? error}`);
            }
          }
          const plan = planUninstall(item, located);
          if (!plan.ok) {
            results.push({ id, package: item.package, ok: false, gone: plan.gone === true, reason: plan.reason });
            continue;
          }
          if (plan.danger === true && !confirmDanger) {
            results.push({
              id,
              package: item.package,
              ok: false,
              danger: true,
              reason: "这是删除目录的操作，需要显式确认",
            });
            continue;
          }
          const outcome = await runUninstall(plan.command, { timeout: Number(body.timeout) || 180000 });
          locationCache.delete(id);
          results.push({
            id,
            package: item.package,
            installer: item.installer,
            ok: outcome.ok,
            code: outcome.code,
            command: plan.command,
            note: plan.note ?? null,
            stdout: outcome.stdout,
            stderr: outcome.stderr,
            error: outcome.error,
            durationMs: outcome.durationMs,
          });
        }
        writeJson(res, 200, { ok: true, results });
      });

      // 重新装回：只对"已不存在"的条目生效，按当年安装器的语义重拼安装命令。
      // body.preview === true 时只生成命令不执行，供 UI 先展示再让用户确认。
      add("reinstall", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) {
          writeJson(res, 400, { ok: false, error: "ids is required" });
          return;
        }
        const preview = body.preview === true;
        const confirmDanger = body.confirmDanger === true;
        const results = [];
        for (const id of ids) {
          const item = itemsById.get(id);
          if (!item) {
            results.push({ id, ok: false, reason: "条目已失效，请重新扫描" });
            continue;
          }
          const located = locationCache.get(id) ?? null;
          if (located && located.state === "installed") {
            results.push({ id, package: item.package, ok: false, reason: "这个软件现在还在，不需要重装" });
            continue;
          }
          const plan = planReinstall(item, located);
          if (!plan.ok) {
            results.push({ id, package: item.package, ok: false, reason: plan.reason });
            continue;
          }
          if (preview) {
            results.push({
              id,
              package: item.package,
              installer: item.installer,
              ok: true,
              command: plan.command,
              note: plan.note ?? null,
              danger: plan.danger === true,
              cwd: plan.cwd ?? null,
            });
            continue;
          }
          if (plan.danger === true && !confirmDanger) {
            results.push({ id, package: item.package, ok: false, danger: true, reason: "这一步会执行脚本/写入文件，需要显式确认" });
            continue;
          }
          const outcome = await runUninstall(plan.command, { timeout: Number(body.timeout) || 600000, cwd: plan.cwd || undefined });
          locationCache.delete(id);
          results.push({
            id,
            package: item.package,
            installer: item.installer,
            ok: outcome.ok,
            code: outcome.code,
            command: plan.command,
            note: plan.note ?? null,
            stdout: outcome.stdout,
            stderr: outcome.stderr,
            error: outcome.error,
            durationMs: outcome.durationMs,
          });
        }
        writeJson(res, 200, { ok: true, results });
      });

      add("reveal", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        const target = typeof body.path === "string" ? body.path : null;
        if (!target) {
          writeJson(res, 400, { ok: false, error: "path is required" });
          return;
        }
        revealFolder(target);
        writeJson(res, 200, { ok: true });
      });

      add("status", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        writeJson(res, 200, {
          ok: true,
          home,
          sessionsRoot: scanner.root,
          items: itemsById.size,
          lastScan,
        });
      });

      // 详情：把"谁装的、为什么装、装在哪、现在在不在"一次讲清楚。
      // 只读已缓存的数据，不重复探测系统。
      add("detail", async (req, res) => {
        if (!guard(req, res, getConnection)) return;
        const body = (await readJson(req)) ?? {};
        const id = typeof body.id === "string" ? body.id : null;
        const item = id ? itemsById.get(id) : null;
        if (!item) {
          writeJson(res, 404, { ok: false, error: "条目已失效，请重新扫描" });
          return;
        }
        const located = locationCache.get(id) ?? null;
        writeJson(res, 200, {
          ok: true,
          item,
          located,
          explain: located ? explainState(located, item) : "正在查询系统状态…",
          plan: located ? planUninstall(item, located) : null,
        });
      });

      return () => {
        for (const dispose of disposers) {
          try {
            dispose();
          } catch {
            /* ignore */
          }
        }
      };
    }, "software-manager: bridge routes");
  });

  logger.info?.(`software-manager: ready (sessions: ${scanner.root})`);
}
