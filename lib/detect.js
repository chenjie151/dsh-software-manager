/**
 * 从 harness 执行过的 shell 命令里识别"安装软件"的动作。
 *
 * 设计原则：
 *  - 只认命令行里能确定的安装器语法，宁可漏报也不要把 `pip list`、`winget --version`
 *    这类命令当成安装。
 *  - 每条结果都带 confidence，低置信度的条目在 UI 上仍然展示，但不会默认勾选。
 *  - 只做纯字符串解析，不访问文件系统，方便单独测试。
 */

import path from "node:path";

/** 安装器元信息：UI 徽章与卸载策略都从这里取。 */
export const INSTALLERS = {
  winget: { label: "winget", kind: "package" },
  choco: { label: "Chocolatey", kind: "package" },
  scoop: { label: "Scoop", kind: "package" },
  pip: { label: "pip", kind: "package" },
  npm: { label: "npm", kind: "package" },
  pnpm: { label: "pnpm", kind: "package" },
  yarn: { label: "yarn", kind: "package" },
  bun: { label: "bun", kind: "package" },
  cargo: { label: "cargo", kind: "package" },
  uv: { label: "uv", kind: "package" },
  gem: { label: "gem", kind: "package" },
  dotnet: { label: "dotnet tool", kind: "package" },
  msi: { label: "MSI", kind: "msi" },
  archive: { label: "压缩包", kind: "directory" },
  git: { label: "git clone", kind: "directory" },
  script: { label: "安装脚本", kind: "script" },
};

const OPTIONS_WITH_VALUE = {
  winget: [
    "--id", "-i", "--name", "-n", "--version", "-v", "--location", "-l",
    "--source", "-s", "--scope", "--type", "-t", "--locale", "--manifest",
    "--override", "-o", "--installer-type", "--architecture", "--log",
  ],
  choco: [
    "--version", "--source", "-s", "--install-arguments", "--package-parameters",
    "--params", "--cache", "--download-directory", "--limit-output", "--execution-timeout",
    "--package-parameters-sensitive", "--install-directory", "--dir",
  ],
  pip: [
    "-r", "--requirement", "-c", "--constraint", "-t", "--target", "--prefix",
    "--root", "--src", "-e", "--editable", "--index-url", "-i", "--extra-index-url",
    "--trusted-host", "--platform", "--python-version", "--implementation", "--abi",
    "--upgrade-strategy", "--cache-dir", "--log", "--progress-bar", "--report",
    "--config-settings", "-C", "--global-option", "--install-option", "--no-binary",
    "--only-binary", "--find-links", "-f", "--python", "-p",
  ],
  npm: ["--prefix", "--registry", "--tag", "--cache", "--userconfig", "--otp"],
  cargo: ["--version", "--root", "--git", "--branch", "--tag", "--rev", "--path", "--features", "-F", "--target", "--profile", "--registry", "--index", "--config", "-Z"],
  uv: ["--index", "--python", "-p", "--directory", "--project", "--cache-dir"],
  gem: ["-v", "--version", "--install-dir", "-i", "--bindir", "-n", "--source", "-s", "--platform", "--build-root"],
  dotnet: ["--version", "-v", "--tool-path", "--add-source", "--configfile"],
  scoop: ["--bucket", "-b", "--arch"],
  archive: ["-path", "-literalpath", "-destinationpath", "-c", "--directory", "-d", "--to"],
};

function baseName(token) {
  const cleaned = String(token || "").replace(/^["']|["']$/g, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned;
}

function stripExe(name) {
  return String(name || "").replace(/\.(exe|cmd|bat|ps1)$/i, "");
}

/** 按 ; && || | 与换行拆语句，尊重引号。单管道也拆：右侧通常是 Select-Object 之类的格式化命令。 */
export function splitStatements(command) {
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === ";" || ch === "\n" || ch === "\r") {
      out.push(cur);
      cur = "";
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (ch === "|") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * 去掉 heredoc（@'…'@ / @"…"@）里的内容：那通常是"要写进文件的脚本"，
 * 不是当前会话真正执行的命令，留着会产生大量误报。
 */
function stripHeredocs(command) {
  return command.replace(/@'[\s\S]*?'@/g, " ").replace(/@"[\s\S]*?"@/g, " ");
}

/** 去掉 2>&1 / 2>$null / > file 这类重定向，避免把 "2" "&1" 当成包名。 */
function stripRedirections(statement) {
  return statement
    .replace(/(\s|^)\d?>&\d/g, "$1")
    .replace(/(\s|^)\d?>>?\s*\$null/gi, "$1")
    .replace(/(\s|^)\d?>>?\s*("[^"]*"|'[^']*'|[^\s|;]+)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** 拆分一行命令为参数 token，去掉引号但保留空格。 */
export function tokenize(statement) {
  const out = [];
  let cur = "";
  let quote = null;
  let started = false;
  for (let i = 0; i < statement.length; i += 1) {
    const ch = statement[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(cur);
        cur = "";
        started = false;
      }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

function optionSet(installer) {
  const list = OPTIONS_WITH_VALUE[installer] || [];
  return new Set(list);
}

/**
 * 从参数数组里抽出"不重复的值参数"和"位置参数"。
 * pairMap 记录 --opt=value 形式。
 */
function splitArgs(args, installer) {
  const withValue = optionSet(installer);
  const values = new Map();
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) continue;
    if (token.startsWith("--") && token.includes("=")) {
      const eq = token.indexOf("=");
      const key = token.slice(0, eq).toLowerCase();
      values.set(key, token.slice(eq + 1));
      continue;
    }
    if (/^-[A-Za-z]/.test(token) && token.length > 2 && !token.startsWith("--")) {
      // 组合短选项（如 -yq、-gS）按字符拆；带值的短选项单独处理。
      const head = token.slice(0, 2).toLowerCase();
      if (withValue.has(head)) {
        values.set(head, token.slice(2));
      } else {
        for (const ch of token.slice(1)) values.set(`-${ch}`, true);
      }
      continue;
    }
    if (token.startsWith("-")) {
      const key = token.toLowerCase();
      if (withValue.has(key) && i + 1 < args.length) {
        values.set(key, args[i + 1]);
        i += 1;
      } else {
        values.set(key, true);
      }
      continue;
    }
    positional.push(token);
  }
  return { values, positional };
}

function pick(values, keys) {
  for (const key of keys) {
    const v = values.get(key);
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function has(values, keys) {
  return keys.some((key) => values.has(key));
}

function resolveMaybe(cwd, value) {
  if (typeof value !== "string" || !value) return null;
  const clean = value.replace(/^["']|["']$/g, "");
  if (/^[A-Za-z]:[\\/]/.test(clean) || clean.startsWith("\\\\")) return path.win32.normalize(clean);
  if (clean.startsWith("~")) return clean;
  if (!cwd) return null;
  return path.win32.resolve(cwd, clean);
}

function specNameVersion(spec) {
  const clean = String(spec || "").trim();
  if (!clean || clean.startsWith("-")) return null;
  if (/^(https?:|git\+|file:|\.{1,2}[\\/])/i.test(clean)) return null;
  if (clean === "." || clean === "..") return null;
  const match = clean.match(/^([A-Za-z0-9._@/+~-]+?)(?:\[[^\]]*\])?(?:(==|>=|<=|~=|!=|>|<)\s*([^\s,;]+))?$/);
  if (!match) return null;
  return { name: match[1], version: match[3] || null };
}

function make(entry) {
  return {
    installer: entry.installer,
    package: entry.package,
    version: entry.version || null,
    locationHint: entry.locationHint || null,
    interpreter: entry.interpreter || null,
    kind: entry.kind || INSTALLERS[entry.installer]?.kind || "package",
    scope: entry.scope || "global",
    confidence: entry.confidence || "high",
    raw: entry.raw,
  };
}

// ---------------------------------------------------------------- winget

function parseWinget(tokens, raw, cwd) {
  if (!/^(install|add)$/i.test(tokens[1] || "")) return null;
  const { values, positional } = splitArgs(tokens.slice(2), "winget");
  const id = pick(values, ["--id", "-i"]);
  const name = pick(values, ["--name", "-n"]);
  const manifest = pick(values, ["--manifest"]);
  const packageName = id || name || manifest || positional[0] || null;
  if (!packageName) return null;
  return [
    make({
      installer: "winget",
      package: packageName,
      version: pick(values, ["--version", "-v"]),
      locationHint: resolveMaybe(cwd, pick(values, ["--location", "-l"])),
      scope: pick(values, ["--scope"]) === "user" ? "user" : "global",
      confidence: id ? "high" : "medium",
      raw,
    }),
  ];
}

// ---------------------------------------------------------------- choco

function parseChoco(tokens, raw) {
  const sub = tokens[1];
  if (!/^(install|upgrade|add)$/i.test(sub || "")) return null;
  const { values, positional } = splitArgs(tokens.slice(2), "choco");
  if (positional.length === 0) return null;
  return positional
    .filter((name) => !name.startsWith("."))
    .map((name) =>
      make({
        installer: "choco",
        package: name,
        version: pick(values, ["--version"]),
        locationHint: pick(values, ["--install-directory", "--dir"]),
        confidence: "high",
        raw,
      }),
    );
}

// ---------------------------------------------------------------- scoop

function parseScoop(tokens, raw) {
  if (!/^install$/i.test(tokens[1] || "")) return null;
  const { positional } = splitArgs(tokens.slice(2), "scoop");
  return positional
    .filter((name) => !name.startsWith("-"))
    .map((name) =>
      make({
        installer: "scoop",
        package: name,
        confidence: "high",
        raw,
      }),
    );
}

// ---------------------------------------------------------------- pip

function parsePip(tokens, raw, cwd) {
  const head = stripExe(baseName(tokens[0])).toLowerCase();
  let pipIndex = -1;
  let interpreter = null;
  const mIndex = tokens.findIndex((token, i) => token === "-m" && /^pip[\d.]*$/i.test(tokens[i + 1] || ""));
  if (mIndex !== -1) {
    pipIndex = mIndex + 1;
    interpreter = mIndex >= 1 ? tokens[mIndex - 1] : null;
  } else if (/^pip[\d.]*$/.test(head)) {
    pipIndex = 0;
    interpreter = null;
  } else {
    return null;
  }
  if (!/^install$/i.test(tokens[pipIndex + 1] || "")) return null;

  const args = tokens.slice(pipIndex + 2);
  const { values, positional } = splitArgs(args, "pip");
  const requirements = pick(values, ["-r", "--requirement"]);
  const editable = pick(values, ["-e", "--editable"]);
  const target = pick(values, ["-t", "--target"]) || pick(values, ["--prefix"]) || pick(values, ["--root"]);

  if (!requirements && !editable && positional.length === 0) {
    // `pip install -U pip` 这类仍然算安装，但上面已经拿到 positional 了
    return null;
  }
  if (requirements) {
    return [
      make({
        installer: "pip",
        package: baseName(requirements.replace(/["']/g, "")),
        interpreter,
        kind: "requirements",
        locationHint: resolveMaybe(cwd, target),
        confidence: "low",
        raw,
      }),
    ];
  }
  if (editable) {
    return [
      make({
        installer: "pip",
        package: baseName(editable.replace(/["']/g, "")) || editable,
        interpreter,
        kind: "directory",
        locationHint: resolveMaybe(cwd, editable),
        confidence: "medium",
        raw,
      }),
    ];
  }

  const out = [];
  for (const spec of positional) {
    const parsed = specNameVersion(spec);
    if (!parsed) continue;
    out.push(
      make({
        installer: "pip",
        package: parsed.name,
        version: parsed.version,
        interpreter,
        kind: "package",
        locationHint: resolveMaybe(cwd, target),
        scope: has(values, ["--user"]) ? "user" : "global",
        confidence: "high",
        raw,
      }),
    );
  }
  return out.length > 0 ? out : null;
}

// ---------------------------------------------------------------- npm / pnpm / yarn / bun

function parseNodePackage(tokens, raw) {
  const head = stripExe(baseName(tokens[0])).toLowerCase();
  if (!["npm", "pnpm", "yarn", "cnpm", "bun"].includes(head)) return null;
  let installer = head === "cnpm" ? "npm" : head;
  let index = -1;
  let isGlobal = false;

  if (head === "yarn" && /^global$/i.test(tokens[1] || "") && /^add$/i.test(tokens[2] || "")) {
    index = 3;
    isGlobal = true;
    installer = "yarn";
  } else {
    const sub = tokens.findIndex((token) => /^(install|i|add)$/i.test(token));
    if (sub === -1) return null;
    index = sub + 1;
    const rest = tokens.slice(2);
    isGlobal =
      tokens.includes("-g") ||
      tokens.includes("--global") ||
      rest.includes("-g") ||
      rest.includes("--global") ||
      (head === "bun" && tokens.includes("-g"));
    if (!isGlobal && head !== "bun") return null;
  }

  const { values, positional } = splitArgs(tokens.slice(index), "npm");
  if (positional.length === 0) return null;
  const prefix = pick(values, ["--prefix"]);
  return positional
    .filter((name) => !name.startsWith("-"))
    .map((spec) => {
      const at = spec.lastIndexOf("@");
      const scoped = spec.startsWith("@");
      const hasVersion = at > 0 || (scoped && at > spec.indexOf("/"));
      return make({
        installer,
        package: hasVersion ? spec.slice(0, at) : spec,
        version: hasVersion ? spec.slice(at + 1) || null : null,
        locationHint: prefix ? path.win32.join(prefix, "node_modules") : null,
        confidence: "high",
        raw,
      });
    });
}

// ---------------------------------------------------------------- cargo / uv / gem / dotnet

function parseCargo(tokens, raw, cwd) {
  if (stripExe(baseName(tokens[0])).toLowerCase() !== "cargo") return null;
  if (!/^install$/i.test(tokens[1] || "")) return null;
  const { values, positional } = splitArgs(tokens.slice(2), "cargo");
  if (positional.length === 0) return null;
  return [
    make({
      installer: "cargo",
      package: positional[0],
      version: pick(values, ["--version"]),
      locationHint: resolveMaybe(cwd, pick(values, ["--root"])),
      confidence: "high",
      raw,
    }),
  ];
}

function parseUv(tokens, raw, cwd) {
  if (stripExe(baseName(tokens[0])).toLowerCase() !== "uv") return null;
  if (/^pip$/i.test(tokens[1] || "") && /^install$/i.test(tokens[2] || "")) {
    const { values, positional } = splitArgs(tokens.slice(3), "uv");
    const out = [];
    for (const spec of positional) {
      const parsed = specNameVersion(spec);
      if (!parsed) continue;
      out.push(
        make({
          installer: "pip",
          package: parsed.name,
          version: parsed.version,
          interpreter: "uv",
          locationHint: resolveMaybe(cwd, pick(values, ["--target"])),
          confidence: "low",
          raw,
        }),
      );
    }
    return out.length > 0 ? out : null;
  }
  if (!/^tool$/i.test(tokens[1] || "") || !/^install$/i.test(tokens[2] || "")) return null;
  const { values, positional } = splitArgs(tokens.slice(3), "uv");
  if (positional.length === 0) return null;
  return [
    make({
      installer: "uv",
      package: positional[0],
      version: pick(values, ["--version"]),
      confidence: "high",
      raw,
    }),
  ];
}

function parseGem(tokens, raw, cwd) {
  if (stripExe(baseName(tokens[0])).toLowerCase() !== "gem") return null;
  if (!/^install$/i.test(tokens[1] || "")) return null;
  const { values, positional } = splitArgs(tokens.slice(2), "gem");
  if (positional.length === 0) return null;
  return [
    make({
      installer: "gem",
      package: positional[0],
      version: pick(values, ["-v", "--version"]),
      locationHint: resolveMaybe(cwd, pick(values, ["--install-dir", "-i"])),
      confidence: "high",
      raw,
    }),
  ];
}

function parseDotnet(tokens, raw) {
  if (stripExe(baseName(tokens[0])).toLowerCase() !== "dotnet") return null;
  if (!/^tool$/i.test(tokens[1] || "") || !/^install$/i.test(tokens[2] || "")) return null;
  const { values, positional } = splitArgs(tokens.slice(3), "dotnet");
  if (positional.length === 0) return null;
  return [
    make({
      installer: "dotnet",
      package: positional[0],
      version: pick(values, ["--version", "-v"]),
      locationHint: pick(values, ["--tool-path"]),
      confidence: "high",
      raw,
    }),
  ];
}

// ---------------------------------------------------------------- MSI

function parseMsi(tokens, raw, cwd) {
  const head = stripExe(baseName(tokens[0])).toLowerCase();
  if (head !== "msiexec") return null;
  const installFlag = tokens.findIndex((token) => /^(\/i|\/package|-i)$/i.test(token));
  if (installFlag === -1) return null;
  const file = tokens[installFlag + 1];
  if (!file || file.startsWith("/")) return null;
  const msiPath = resolveMaybe(cwd, file);
  return [
    make({
      installer: "msi",
      package: baseName(file),
      locationHint: msiPath,
      kind: "msi",
      confidence: "high",
      raw,
    }),
  ];
}

// ---------------------------------------------------------------- 压缩包 / git clone / 安装脚本

function parseArchive(tokens, raw, cwd) {
  const head = stripExe(baseName(tokens[0])).toLowerCase();
  const args = tokens.slice(1);
  const { values, positional } = splitArgs(args, "archive");

  if (head === "expand-archive") {
    const src = pick(values, ["-path", "-literalpath"]) || positional[0];
    const dest = pick(values, ["-destinationpath"]) || positional[1];
    if (!src) return null;
    return [
      make({
        installer: "archive",
        package: baseName(src),
        locationHint: resolveMaybe(cwd, dest) || (dest ? dest : null),
        kind: "directory",
        confidence: "medium",
        raw,
      }),
    ];
  }

  if (head === "tar") {
    if (!args.some((token) => /^-[a-z]*x/i.test(token) || token === "--extract")) return null;
    const file = positional.find((token) => /\.(zip|tar|gz|tgz|bz2|xz|zst)$/i.test(token));
    const dest = pick(values, ["-c", "--directory"]);
    if (!file && !dest) return null;
    return [
      make({
        installer: "archive",
        package: file ? baseName(file) : "tar archive",
        locationHint: resolveMaybe(cwd, dest),
        kind: "directory",
        confidence: "medium",
        raw,
      }),
    ];
  }

  if (head === "7z" || head === "7za") {
    if (!/^x$/i.test(args[0] || "")) return null;
    const file = args.slice(1).find((token) => !token.startsWith("-"));
    const outDir = args.find((token) => /^-o.+/i.test(token));
    return [
      make({
        installer: "archive",
        package: file ? baseName(file) : "7z archive",
        locationHint: outDir ? resolveMaybe(cwd, outDir.slice(2)) : null,
        kind: "directory",
        confidence: "medium",
        raw,
      }),
    ];
  }
  return null;
}

function parseGitClone(tokens, raw, cwd) {
  if (stripExe(baseName(tokens[0])).toLowerCase() !== "git") return null;
  if (!/^clone$/i.test(tokens[1] || "")) return null;
  const url = tokens.slice(2).find((token) => !token.startsWith("-"));
  if (!url) return null;
  const repo = baseName(url).replace(/\.git$/i, "");
  const index = tokens.indexOf(url);
  const dir = tokens.slice(index + 1).find((token) => !token.startsWith("-"));
  return [
    make({
      installer: "git",
      package: repo,
      locationHint: resolveMaybe(cwd, dir) || null,
      kind: "directory",
      confidence: "high",
      raw,
    }),
  ];
}

function parseInstallScript(tokens, raw, cwd) {
  const first = baseName(tokens[0]);
  const isBat = /\.(bat|cmd)$/i.test(first);
  const isPs1 = /\.ps1$/i.test(first);
  if (!isBat && !isPs1) return null;
  if (!/install|setup|deploy/i.test(first)) return null;
  return [
    make({
      installer: "script",
      package: first,
      locationHint: cwd || null,
      kind: "script",
      locationNote: "安装脚本所在目录",
      confidence: "low",
      raw,
    }),
  ];
}

// ---------------------------------------------------------------- 入口

function parseStatement(tokens, raw, cwd) {
  let list = tokens;
  if (list[0] === "&") list = list.slice(1);
  if (list.length === 0) return null;

  const head = stripExe(baseName(list[0])).toLowerCase();

  // cmd /c "..."：把内部命令再拆一次
  if (head === "cmd" && /^\/[cs]$/i.test(list[1] || "")) {
    const inner = list.slice(2).join(" ");
    const out = [];
    for (const part of splitStatements(inner)) {
      const nested = parseStatement(tokenize(part), part, cwd);
      if (nested) out.push(...nested);
    }
    return out.length > 0 ? out : null;
  }

  let result = null;
  if (head === "winget") result = parseWinget(list, raw, cwd);
  else if (head === "choco" || head === "chocolatey") result = parseChoco(list, raw);
  else if (head === "scoop") result = parseScoop(list, raw);
  else if (head === "pip" || head === "pip3" || /^python[\d.]*$/.test(head) || head === "py" || head === "python") {
    result = parsePip(list, raw, cwd);
  }
  if (!result) result = parseNodePackage(list, raw);
  if (!result) result = parseCargo(list, raw, cwd);
  if (!result) result = parseUv(list, raw, cwd);
  if (!result) result = parseGem(list, raw, cwd);
  if (!result) result = parseDotnet(list, raw);
  if (!result) result = parseMsi(list, raw, cwd);
  if (!result) result = parseArchive(list, raw, cwd);
  if (!result) result = parseGitClone(list, raw, cwd);
  if (!result) result = parseInstallScript(list, raw, cwd);
  return result;
}

/**
 * 扫描一段 shell 命令，返回全部安装动作。
 * @param {string} command
 * @param {{ cwd?: string|null }} [context]
 */
export function detectInstalls(command, context = {}) {
  if (typeof command !== "string" || !command.trim()) return [];
  const results = [];
  let cwd = context.cwd || null;

  for (const rawStatement of splitStatements(stripHeredocs(command))) {
    const statement = stripRedirections(rawStatement);
    if (!statement) continue;
    const tokens = tokenize(statement);
    if (tokens.length === 0) continue;
    const head = stripExe(baseName(tokens[0])).toLowerCase();

    // 跟踪 cd / Set-Location，后续相对路径才有意义
    if (head === "cd" || head === "chdir" || head === "set-location" || head === "pushd") {
      const target = tokens[1] || "";
      if (/^[A-Za-z]:[\\/]/.test(target)) cwd = path.win32.normalize(target.replace(/["']/g, ""));
      else if (cwd && target) cwd = path.win32.resolve(cwd, target.replace(/["']/g, ""));
      continue;
    }
    if (/^popd$/i.test(head)) continue;

    const hit = parseStatement(tokens, statement, cwd);
    if (hit) results.push(...hit.map((entry) => ({ ...entry, cwd })));
  }
  return results;
}
