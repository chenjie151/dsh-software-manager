/**
 * 生成并执行卸载命令。
 *
 * 只有本模块能拼命令：HTTP 路由只传条目 id，绝不接受前端传来的命令行，
 * 避免把管理面板变成任意命令执行入口。
 */

import { exec } from "node:child_process";
import path from "node:path";

const OUTPUT_LIMIT = 12000;

function tail(text) {
  const value = String(text || "").trim();
  if (value.length <= OUTPUT_LIMIT) return value;
  return `…（前 ${value.length - OUTPUT_LIMIT} 字符已省略）\n${value.slice(-OUTPUT_LIMIT)}`;
}

function quote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function looksLikeWingetId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*\.[A-Za-z0-9._+-]+$/.test(String(value || ""));
}

export function resolvePython(item) {
  const raw = item.interpreter;
  if (!raw) return { exe: "python", kind: "python" };
  if (/^uv$/i.test(String(raw))) return { exe: null, kind: "uv" };
  const clean = String(raw).replace(/^["']|["']$/g, "");
  if (/^[A-Za-z]:[\\/]/.test(clean) || clean.startsWith("\\\\")) return { exe: clean, kind: "python" };
  if (/[\\/]/.test(clean)) {
    return { exe: item.cwd ? path.win32.resolve(item.cwd, clean) : clean, kind: "python" };
  }
  return { exe: clean, kind: "python" };
}

/**
 * @returns {{ ok: boolean, command?: string, danger?: boolean, note?: string, reason?: string }}
 */
export function planUninstall(item, located) {
  if (!item) return { ok: false, reason: "条目不存在" };
  // 系统里已经查不到的包：没有任何东西可卸，禁止下发命令。
  // 这一层是硬闸门——UI 只是把它显示成不可选，真正拦截在这里。
  if (located && located.state === "missing") {
    return {
      ok: false,
      reason: "这个软件在当前系统里已经不存在了，没有可卸载的内容",
      gone: true,
    };
  }
  if (item.kind === "requirements") {
    return {
      ok: false,
      reason: "这是一份依赖清单，不是单个软件；要卸载请按清单里的包名逐个处理",
    };
  }

  const pkg = String(item.package || "");
  if (!pkg) return { ok: false, reason: "没有可卸载的包名" };

  switch (item.installer) {
    case "winget":
      return {
        ok: true,
        command: looksLikeWingetId(pkg)
          ? `winget uninstall --id ${quote(pkg)} --exact --silent --accept-source-agreements --disable-interactivity`
          : `winget uninstall --name ${quote(pkg)} --silent --accept-source-agreements --disable-interactivity`,
        note: "winget 会调用包自身的卸载程序",
      };
    case "choco":
      return { ok: true, command: `choco uninstall ${quote(pkg)} -y --no-progress` };
    case "scoop":
      return { ok: true, command: `scoop uninstall ${quote(pkg)}` };
    case "pip": {
      const python = resolvePython(item);
      if (python.kind === "uv") return { ok: true, command: `uv pip uninstall ${quote(pkg)}` };
      return { ok: true, command: `${quote(python.exe)} -m pip uninstall -y ${quote(pkg)}` };
    }
    case "npm":
      return { ok: true, command: `npm uninstall -g ${quote(pkg)}` };
    case "pnpm":
      return { ok: true, command: `pnpm remove -g ${quote(pkg)}` };
    case "yarn":
      return { ok: true, command: `yarn global remove ${quote(pkg)}` };
    case "bun":
      return { ok: true, command: `bun remove -g ${quote(pkg)}` };
    case "cargo":
      return { ok: true, command: `cargo uninstall ${quote(pkg)}` };
    case "uv":
      return { ok: true, command: `uv tool uninstall ${quote(pkg)}` };
    case "gem":
      return { ok: true, command: `gem uninstall ${quote(pkg)} -x --force` };
    case "dotnet":
      return { ok: true, command: `dotnet tool uninstall -g ${quote(pkg)}` };
    case "msi": {
      if (located?.uninstall) {
        return {
          ok: true,
          command: String(located.uninstall).trim(),
          danger: false,
          note: "来自注册表 UninstallString",
        };
      }
      if (item.locationHint) {
        return {
          ok: true,
          command: `msiexec /x ${quote(item.locationHint)} /qn /norestart`,
          note: "安装包可能已被删除，失败时请手动卸载",
        };
      }
      return { ok: false, reason: "没有找到 MSI 的卸载入口" };
    }
    case "archive":
    case "git": {
      const target = located?.location || item.locationHint;
      if (!target) return { ok: false, reason: "没有记录安装目录" };
      return {
        ok: true,
        command: `powershell.exe -NoProfile -NonInteractive -Command "Remove-Item -LiteralPath ${quote(target)} -Recurse -Force -ErrorAction Stop"`,
        danger: true,
        note: "直接删除目录，不可恢复",
      };
    }
    case "script":
      return { ok: false, reason: "安装脚本没有可追踪的包记录，只能手动卸载" };
    case "requirements":
      return { ok: false, reason: "依赖清单不是单个软件，请按清单里的包名逐个卸载" };
    default:
      return { ok: false, reason: `不支持的安装器：${item.installer}` };
  }
}

export function describeDanger(item) {
  return item.kind === "directory" || item.kind === "script";
}

/**
 * 把当年那条安装命令重新拼出来，用于"重新装回来"。
 *
 * 只在本插件解析出的条目上做，不接收前端传来的命令行；原始命令来自会话日志里
 * 已经解析过的 raw 字段，仍要过一遍安全网：只允许本插件认识的安装器 + 非空包名。
 *
 * @returns {{ ok: boolean, command?: string, cwd?: string|null, reason?: string }}
 */
export function planReinstall(item, located) {
  if (!item) return { ok: false, reason: "条目不存在" };
  if (!String(item.package || "").trim()) return { ok: false, reason: "没有可重新安装的包名" };
  if (item.kind === "requirements") {
    return { ok: false, reason: "这是一份依赖清单，重新安装请按清单执行 pip install -r" };
  }
  if (item.installer === "script") {
    const file = located?.location || item.locationHint || (item.cwd && item.package ? path.win32.join(item.cwd, item.package) : null);
    if (!file) return { ok: false, reason: "找不到脚本文件路径" };
    return {
      ok: true,
      command: `cmd /c ${quote(file)} silent`,
      cwd: item.cwd || null,
      note: "重跑当初的安装脚本；它会按脚本自己的逻辑安装",
      danger: true,
    };
  }
  if (item.installer === "archive" || item.installer === "git") {
    const raw = String(item.raw || "").trim();
    if (!raw) return { ok: false, reason: "没有记录原始下载命令" };
    return {
      ok: true,
      command: raw,
      cwd: item.cwd || null,
      note: "重跑当初的解压/克隆命令；目标目录若已存在可能报错",
      danger: false,
    };
  }
  if (item.installer === "msi") {
    if (!item.locationHint) return { ok: false, reason: "没有记录安装包路径" };
    return { ok: true, command: `msiexec /i ${quote(item.locationHint)} /qn /norestart`, danger: false };
  }
  const install = planInstall(item);
  if (!install.ok) return install;
  return { ...install, cwd: item.cwd || null };
}

/** 按安装器拼安装命令（只认包名，不认原始命令行）。 */
function planInstall(item) {
  const pkg = String(item.package || "");
  const version = String(item.version || "").trim();
  const spec = version ? `${pkg}==${version}` : pkg;
  switch (item.installer) {
    case "winget":
      return {
        ok: true,
        command: looksLikeWingetId(pkg)
          ? `winget install --id ${quote(pkg)}${version ? ` --version ${quote(version)}` : ""} --exact --silent --accept-source-agreements --accept-package-agreements`
          : `winget install --name ${quote(pkg)}${version ? ` --version ${quote(version)}` : ""} --silent --accept-source-agreements --accept-package-agreements`,
      };
    case "choco":
      return { ok: true, command: `choco install ${quote(pkg)} -y --no-progress` };
    case "scoop":
      return { ok: true, command: `scoop install ${quote(pkg)}` };
    case "pip": {
      const python = resolvePython(item);
      if (python.kind === "uv") return { ok: true, command: `uv pip install ${quote(pkg)}${version ? `==${version}` : ""}` };
      return { ok: true, command: `${quote(python.exe)} -m pip install ${quote(spec)}` };
    }
    case "npm":
      return { ok: true, command: `npm install -g ${quote(spec)}` };
    case "pnpm":
      return { ok: true, command: `pnpm add -g ${quote(spec)}` };
    case "yarn":
      return { ok: true, command: `yarn global add ${quote(spec)}` };
    case "bun":
      return { ok: true, command: `bun add -g ${quote(spec)}` };
    case "cargo":
      return { ok: true, command: version ? `cargo install ${quote(pkg)} --version ${quote(version)}` : `cargo install ${quote(pkg)}` };
    case "uv":
      return { ok: true, command: `uv tool install ${quote(spec)}` };
    case "gem":
      return { ok: true, command: `gem install ${quote(pkg)}${version ? ` -v ${quote(version)}` : ""}` };
    case "dotnet":
      return { ok: true, command: `dotnet tool install -g ${quote(pkg)}${version ? ` --version ${quote(version)}` : ""}` };
    default:
      return { ok: false, reason: `不支持的安装器：${item.installer}` };
  }
}

/** 执行一条命令，返回可读输出。 */
export async function runUninstall(command, { timeout = 180000, cwd } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    exec(
      `chcp 65001>nul & ${command}`,
      { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true, encoding: "utf8", cwd: cwd || undefined },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          command,
          stdout: tail(stdout),
          stderr: tail(stderr),
          error: error ? String(error.message ?? error) : null,
          durationMs: Date.now() - started,
        });
      },
    );
  });
}
