/**
 * 会话工作区 slug 的反解。
 *
 * DSH 把 `D:\dsh-workspace` 这样的路径压成一个目录名，例如
 * `--D-dsh-workspace--`：分隔符换成 `-`，首尾各补 `--`。
 * 这里在扫描时顺带从 session 事件的 cwd 里读到真实路径，
 * 只有读不到时才退回 slug，避免猜错。
 */

export function slugToPathGuess(slug) {
  const text = String(slug || "");
  if (!text.startsWith("--") || !text.endsWith("--")) return null;
  const middle = text.slice(2, -2);
  if (!middle) return null;
  const segments = middle.split("-");
  if (segments.length === 0) return null;
  // `D:\dsh-workspace` → segments 里首段是盘符
  const drive = segments[0];
  if (segments.length >= 2 && /^[A-Za-z]$/.test(drive)) {
    return `${drive}:\\${segments.slice(1).join("\\")}`;
  }
  return `\\${segments.join("\\")}`;
}

export function workspaceLabel(slug, cwd) {
  const value = String(cwd || "").trim();
  if (value) {
    const parts = value.split(/[/\\]/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
    return value;
  }
  const guess = slugToPathGuess(slug);
  if (guess) {
    const parts = guess.split(/[/\\]/).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
    return guess;
  }
  return String(slug || "").replace(/^-+|-+$/g, "") || "—";
}
