/**
 * 系统侧探测：把"命令里装了什么"落成"现在装在哪、还在不在"。
 *
 * 所有外部命令都带超时；结果按 key 缓存，避免每次刷新都重启 PowerShell。
 */

import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_TTL = 5 * 60 * 1000;

function run(command, { timeout = 25000, maxBuffer = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    exec(
      `chcp 65001>nul & ${command}`,
      { timeout, maxBuffer, windowsHide: true, encoding: "utf8" },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          error: error ? String(error.message ?? error) : null,
        });
      },
    );
  });
}

function encodedPowerShell(script) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** 把 "D:\Program Files\Foo\" 这类值清成可比较的路径。 */
function cleanPath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^"+|"+$/g, "");
  if (!trimmed) return null;
  return path.win32.normalize(trimmed);
}

export function createProber({ logger } = {}) {
  const cache = new Map();

  function get(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      cache.delete(key);
      return null;
    }
    return hit.value;
  }

  function set(key, value, ttl = DEFAULT_TTL) {
    cache.set(key, { value, expiresAt: Date.now() + ttl });
    return value;
  }

  async function registryIndex() {
    const cached = get("registry");
    if (cached) return cached;
    const script = [
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
      "$ErrorActionPreference='SilentlyContinue'",
      "$paths=@(",
      " 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      " 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      " 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
      ")",
      "$items = Get-ItemProperty $paths | Where-Object { $_.DisplayName } | ForEach-Object {",
      "  [pscustomobject]@{",
      "    name = $_.DisplayName",
      "    version = $_.DisplayVersion",
      "    location = $_.InstallLocation",
      "    uninstall = $_.UninstallString",
      "    quietUninstall = $_.QuietUninstallString",
      "    key = $_.PSChildName",
      "    publisher = $_.Publisher",
      "  }",
      "}",
      "ConvertTo-Json -InputObject @($items) -Compress -Depth 3",
    ].join("\n");

    const result = await run(encodedPowerShell(script), { timeout: 30000 });
    let list = [];
    if (result.stdout.trim()) {
      try {
        const parsed = JSON.parse(result.stdout.trim());
        list = Array.isArray(parsed) ? parsed : [parsed];
      } catch (error) {
        logger?.warn?.(`software-manager: registry index unparsable (${error?.message ?? error})`);
      }
    }
    const entries = list
      .filter((item) => item && typeof item.name === "string")
      .map((item) => ({
        name: item.name,
        version: item.version ?? null,
        location: cleanPath(item.location),
        uninstall: item.uninstall ?? null,
        quietUninstall: item.quietUninstall ?? null,
        key: item.key ?? null,
        publisher: item.publisher ?? null,
        normalized: normalizeName(item.name),
      }));
    return set("registry", entries, 3 * 60 * 1000);
  }

  async function pythonPackages(interpreter, cwd) {
    const exe = resolveInterpreter(interpreter, cwd);
    if (!exe) return { available: false, reason: "no interpreter", purelib: null, packages: new Map() };
    const key = `python:${exe.toLowerCase()}`;
    const cached = get(key);
    if (cached) return cached;

    const script = [
      "import json, sysconfig, importlib.metadata as md",
      "out = {'purelib': sysconfig.get_paths().get('purelib'), 'packages': {}}",
      "for dist in md.distributions():",
      "    try:",
      "        name = dist.metadata['Name']",
      "        if not name:",
      "            continue",
      "        out['packages'][name] = [dist.version, str(dist.locate_file(''))]",
      "    except Exception:",
      "        pass",
      "print(json.dumps(out))",
    ].join("\n");
    const b64 = Buffer.from(script, "utf8").toString("base64");
    const result = await run(
      `"${exe}" -c "import base64;exec(base64.b64decode('${b64}').decode('utf8'))"`,
      { timeout: 30000 },
    );
    if (!result.ok || !result.stdout.trim()) {
      const value = { available: false, reason: (result.stderr || result.error || "python failed").slice(0, 400), purelib: null, packages: new Map() };
      return set(key, value, 60 * 1000);
    }
    let payload;
    try {
      payload = JSON.parse(result.stdout.trim().split("\n").pop() ?? "{}");
    } catch (error) {
      const value = { available: false, reason: `unparsable output (${error?.message ?? error})`, purelib: null, packages: new Map() };
      return set(key, value, 60 * 1000);
    }
    const packages = new Map();
    for (const [name, info] of Object.entries(payload.packages ?? {})) {
      packages.set(normalizeName(name), { name, version: info?.[0] ?? null, path: info?.[1] ?? null });
    }
    return set(key, { available: true, purelib: payload.purelib ?? null, packages, reason: null });
  }

  async function npmGlobal() {
    const cached = get("npm");
    if (cached) return cached;
    const root = await run("npm root -g", { timeout: 20000 });
    const listing = await run("npm ls -g --depth=0 --json", { timeout: 25000 });
    const packages = new Map();
    let rootPath = null;
    if (root.ok) {
      const line = root.stdout.trim().split("\n").filter(Boolean).pop();
      if (line) rootPath = cleanPath(line);
    }
    if (listing.ok && listing.stdout.trim()) {
      try {
        const parsed = JSON.parse(listing.stdout.trim());
        for (const [name, info] of Object.entries(parsed.dependencies ?? {})) {
          packages.set(name.toLowerCase(), { name, version: info?.version ?? null });
        }
      } catch {
        /* npm 有时会先打印警告，解析失败就只留 root */
      }
    }
    return set("npm", { available: Boolean(rootPath), root: rootPath, packages, error: root.ok ? null : (root.stderr || root.error) }, 3 * 60 * 1000);
  }

  async function whereExe(name) {
    if (!name) return null;
    const key = `where:${String(name).toLowerCase()}`;
    const cached = get(key);
    if (cached !== null) return cached;
    const result = await run(`where.exe "${String(name).replace(/"/g, "")}"`, { timeout: 10000 });
    if (!result.ok) return set(key, null, 60 * 1000);
    const line = result.stdout.trim().split(/\r?\n/).filter(Boolean)[0];
    return set(key, line ? cleanPath(line) : null, 3 * 60 * 1000);
  }

  function resolveInterpreter(interpreter, cwd) {
    if (!interpreter) return "python";
    const raw = String(interpreter).replace(/^["']|["']$/g, "");
    if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
      return fs.existsSync(raw) ? raw : raw;
    }
    if (/[\\/]/.test(raw)) {
      const resolved = cwd ? path.win32.resolve(cwd, raw) : null;
      return resolved ?? raw;
    }
    return raw;
  }

  return {
    registryIndex,
    pythonPackages,
    npmGlobal,
    whereExe,
    resolveInterpreter,
    reset() {
      cache.clear();
    },
  };
}
