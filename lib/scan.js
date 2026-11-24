/**
 * 扫描 DSH 会话日志，找出 harness 执行过的安装命令，并还原"谁装的、为什么装"。
 *
 * 每个会话是一个多帧 zstd 压缩的 JSONL（追加写，每帧一条或几条记录）。
 * Node 的 zstdDecompressSync 只解第一帧，所以这里按 zstd magic 切帧逐帧解压。
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { detectInstalls } from "./detect.js";
import { readConversation } from "./context.js";
import { describePackage } from "./meta.js";
import { workspaceLabel } from "./workspace.js";

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const SHELL_TOOLS = new Set(["pwsh", "powershell", "bash", "sh", "shell", "terminal", "cmd", "exec", "process", "run"]);
const SESSION_FILE = "session.v4.jsonl.zstd";

function debug(logger, message) {
  try {
    logger?.debug?.(`software-manager: ${message}`);
  } catch {
    /* logger 不可用就静默 */
  }
}

/** 把多帧 zstd 文件解成 UTF-8 文本。坏帧跳过，不整体失败。 */
export function decompressSessionBuffer(buffer, logger) {
  const starts = [];
  let at = 0;
  while (at < buffer.length) {
    const found = buffer.indexOf(ZSTD_MAGIC, at);
    if (found === -1) break;
    starts.push(found);
    at = found + ZSTD_MAGIC.length;
  }
  if (starts.length === 0) {
    // 有些版本可能整体可解，兜底试一次
    try {
      return zlib.zstdDecompressSync(buffer).toString("utf8");
    } catch (error) {
      debug(logger, `zstd fallback failed: ${error?.message ?? error}`);
      return "";
    }
  }
  const chunks = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      chunks.push(zlib.zstdDecompressSync(buffer.subarray(start, end)).toString("utf8"));
    } catch (error) {
      debug(logger, `frame ${index} failed: ${error?.message ?? error}`);
    }
  }
  return chunks.join("\n");
}

function shellCommandOf(data) {
  let args = data?.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return "";
    }
  }
  if (!args || typeof args !== "object") return "";
  const candidate = args.command ?? args.cmd ?? args.script ?? args.input ?? args.code;
  if (typeof candidate === "string") return candidate;
  if (Array.isArray(candidate)) return candidate.filter((part) => typeof part === "string").join(" ");
  return "";
}

function parseSessionFile(file, meta, logger) {
  let text;
  try {
    text = decompressSessionBuffer(fs.readFileSync(file), logger);
  } catch (error) {
    debug(logger, `read ${file} failed: ${error?.message ?? error}`);
    return { entries: [], sessionTitle: null, session: null, events: 0, conversation: null };
  }

  const lines = text.split("\n");
  let session = null;
  const events = [];
  const calls = [];
  const results = new Map();

  for (const line of lines) {
    if (!line || line.charCodeAt(0) !== 123 /* { */) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    events.push(event);
    if (event.type === "session") {
      session = event;
      continue;
    }
    if (event.type === "tool/result") {
      const callId = event.data?.message?.toolCallId ?? event.data?.callId;
      if (typeof callId === "string") {
        const textContent = Array.isArray(event.data?.message?.content)
          ? event.data.message.content.filter((block) => block?.type === "text").map((block) => block.text).join("\n")
          : "";
        results.set(callId, {
          isError: event.data?.message?.isError === true || event.data?.isError === true,
          text: textContent,
        });
      }
      continue;
    }
    if (event.type !== "tool/call") continue;
    const data = event.data;
    const tool = String(data?.name ?? "").toLowerCase();
    if (!SHELL_TOOLS.has(tool)) continue;
    const command = shellCommandOf(data);
    if (!command || !/install|setup|winget|choco|scoop|pip |npm |pnpm |cargo |uv |gem |msiexec|expand-archive|git clone/i.test(command)) {
      continue;
    }
    calls.push({ event, data, tool, command });
  }

  // 会话标题、这一轮用户要什么、助手动手前怎么说的
  const conversation = readConversation(events);
  const cwd = session?.cwd ?? meta.cwd ?? null;
  const workspace = workspaceLabel(meta.workspaceSlug, cwd);

  const entries = [];
  for (const call of calls) {
    const inst = detectInstalls(call.command, { cwd });
    const turn = Number(call.data?.turn);
    const ask = Number.isFinite(turn) ? conversation.asks.get(turn) ?? "" : "";
    const lead = Number.isFinite(turn) ? conversation.leads.get(turn) ?? "" : "";
    for (const item of inst) {
      const purpose = describePackage(item.installer, item.package, item.kind);
      entries.push({
        ...item,
        purpose: purpose.text,
        purposeKnown: purpose.known,
        category: purpose.category,
        sessionId: session?.id ?? meta.sessionId,
        sessionTitle: conversation.title || null,
        workspace,
        cwd: item.cwd ?? cwd,
        turn: Number.isFinite(turn) ? turn : null,
        userAsk: ask,
        agentLead: lead,
        origin: session?.delegationDepth > 0 ? "subagent" : "user",
        time: typeof call.event.time === "number" ? call.event.time : null,
        callId: call.data?.callId ?? null,
        tool: call.tool,
      });
    }
  }

  return {
    entries,
    sessionTitle: conversation.title || null,
    session,
    events: events.length,
    conversation,
  };
}

function walkSessionFiles(sessionsRoot) {
  const files = [];
  let workspaces = [];
  try {
    workspaces = fs.readdirSync(sessionsRoot, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const workspace of workspaces) {
    const workspacePath = path.join(sessionsRoot, workspace.name);
    if (!workspace.isDirectory()) {
      if (workspace.isFile() && workspace.name.endsWith(".jsonl.zstd")) {
        files.push({ file: workspacePath, workspace: "", sessionDir: workspace.name, mtimeMs: 0, size: 0 });
      }
      continue;
    }
    let sessions = [];
    try {
      sessions = fs.readdirSync(workspacePath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const file = path.join(workspacePath, session.name, SESSION_FILE);
      try {
        const stat = fs.statSync(file);
        files.push({
          file,
          workspace: workspace.name,
          sessionDir: session.name,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      } catch {
        /* 目录里没有会话文件 */
      }
    }
  }
  return files;
}

function shortId(value) {
  return String(value || "")
    .replace(/^session-/, "")
    .slice(0, 8);
}

function itemKey(entry) {
  const pkg = String(entry.package || "").toLowerCase();
  return `${entry.installer}|${pkg}|${entry.kind}`;
}

/** 同一安装器 + 同一个包只留一条，保留最近一次的上下文与全部出现次数。 */
function aggregate(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = itemKey(entry);
    const existing = map.get(key);
    const time = entry.time ?? 0;
    if (!existing) {
      map.set(key, {
        ...entry,
        occurrences: 1,
        sessions: entry.sessionId ? [entry.sessionId] : [],
        firstSeen: time || null,
        lastSeen: time || null,
      });
      continue;
    }
    existing.occurrences += 1;
    if (entry.sessionId && !existing.sessions.includes(entry.sessionId)) existing.sessions.push(entry.sessionId);
    if (!existing.firstSeen || (time && time < existing.firstSeen)) existing.firstSeen = time;
    if (time >= (existing.lastSeen ?? 0)) {
      existing.lastSeen = time;
      // 保留最近一次的命令原文与上下文
      existing.raw = entry.raw;
      existing.cwd = entry.cwd;
      existing.sessionId = entry.sessionId;
      existing.sessionTitle = entry.sessionTitle;
      existing.workspace = entry.workspace;
      existing.userAsk = entry.userAsk;
      existing.agentLead = entry.agentLead;
      existing.origin = entry.origin;
      existing.callId = entry.callId;
      existing.interpreter = entry.interpreter ?? existing.interpreter;
      existing.locationHint = entry.locationHint ?? existing.locationHint;
      existing.version = entry.version ?? existing.version;
      existing.confidence = entry.confidence;
    }
  }
  return [...map.values()].map((item) => ({
    id: `${item.installer}:${String(item.package).toLowerCase()}:${shortId(item.sessionId)}`,
    installer: item.installer,
    package: item.package,
    version: item.version ?? null,
    purpose: item.purpose ?? null,
    purposeKnown: item.purposeKnown === true,
    category: item.category ?? "other",
    locationHint: item.locationHint ?? null,
    interpreter: item.interpreter ?? null,
    kind: item.kind,
    scope: item.scope ?? "global",
    confidence: item.confidence,
    raw: item.raw,
    cwd: item.cwd ?? null,
    workspace: item.workspace ?? null,
    time: item.lastSeen ?? item.time ?? null,
    firstSeen: item.firstSeen ?? null,
    sessionId: item.sessionId ?? null,
    sessionTitle: item.sessionTitle ?? null,
    userAsk: item.userAsk ?? null,
    agentLead: item.agentLead ?? null,
    origin: item.origin ?? "user",
    turn: item.turn ?? null,
    occurrences: item.occurrences,
    sessions: (item.sessions ?? []).map((id) => ({ id, short: shortId(id) })),
  }));
}

/**
 * @param {{ home: string, logger?: any, isIgnored?: (id: string) => boolean }} options
 */
export function createSessionScanner({ home, logger, isIgnored }) {
  const sessionsRoot = path.join(home, "sessions");
  const cache = new Map();

  return {
    root: sessionsRoot,
    scan({ force = false } = {}) {
      const started = Date.now();
      const files = walkSessionFiles(sessionsRoot);
      const collected = [];
      let parsedFiles = 0;
      let cachedFiles = 0;
      let events = 0;
      const seen = new Set();

      for (const item of files) {
        seen.add(item.file);
        const cached = cache.get(item.file);
        if (!force && cached && cached.mtimeMs === item.mtimeMs && cached.size === item.size) {
          collected.push(...cached.entries);
          events += cached.events;
          cachedFiles += 1;
          continue;
        }
        const meta = {
          sessionId: item.sessionDir,
          cwd: null,
          workspaceSlug: item.workspace,
        };
        const result = parseSessionFile(item.file, meta, logger);
        const entries = result.entries.map((entry) => ({
          ...entry,
          sessionId: entry.sessionId ?? item.sessionDir,
          sessionTitle: entry.sessionTitle ?? null,
        }));
        cache.set(item.file, { mtimeMs: item.mtimeMs, size: item.size, entries, events: result.events });
        collected.push(...entries);
        events += result.events;
        parsedFiles += 1;
      }

      // 清理已删除会话的缓存
      for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);

      // 被用户"删除"（彻底移除）的条目直接不进列表；其余按时间排序返回。
      // 「已卸载」保留 7 天是在拿到系统状态之后才算得出来，由上层按 state 处理。
      const all = aggregate(collected).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
      const items = all.filter((item) => !(typeof isIgnored === "function" && isIgnored(item.id)));
      return {
        items,
        stats: {
          sessions: files.length,
          parsedFiles,
          cachedFiles,
          events,
          matches: collected.length,
          durationMs: Date.now() - started,
          scannedAt: Date.now(),
        },
      };
    },
  };
}
