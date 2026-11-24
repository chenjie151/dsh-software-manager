window.__ModuleLoader__.load({
  id: "dsh-software-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let jsx = require("react/jsx-runtime");

    const PANEL_ID = "dsh-software-manager";
    const BRIDGE_PATH = "api/dsh-software-manager";
    const api = (endpoint, body) => {
      const url = (() => {
        try {
          return new URL(`${BRIDGE_PATH}/${endpoint}`, document.baseURI).toString();
        } catch {
          return `/${BRIDGE_PATH}/${endpoint}`;
        }
      })();
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }).then(async (response) => {
        // 路由不存在时后端返回 401 而不是 JSON 结果，这里必须当失败处理，
        // 否则 UI 会误以为操作成功、只在本地摘掉条目，重扫后它又回来了。
        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (!response.ok) {
          const message = (payload && (payload.error || payload.message)) || `请求失败（HTTP ${response.status}）`;
          throw new Error(message);
        }
        if (payload && payload.ok === false) throw new Error(payload.error || "操作未完成");
        return payload ?? {};
      });
    };

    function h(type, props) {
      const children = Array.prototype.slice.call(arguments, 2);
      const out = { ...(props || {}) };
      if (children.length === 1) out.children = children[0];
      else if (children.length > 1) out.children = children;
      return jsx.jsx(type, out);
    }

    const INSTALLER_LABEL = {
      winget: "winget",
      choco: "Chocolatey",
      scoop: "Scoop",
      pip: "pip",
      npm: "npm",
      pnpm: "pnpm",
      yarn: "yarn",
      bun: "bun",
      cargo: "cargo",
      uv: "uv",
      gem: "gem",
      dotnet: "dotnet tool",
      msi: "MSI",
      archive: "压缩包",
      git: "git clone",
      script: "安装脚本",
    };

    const SOURCE_LABEL = {
      command: "命令指定",
      "package-index": "包清单",
      registry: "注册表",
      "default-path": "默认路径",
      where: "PATH",
      none: "未定位",
    };

    const CATEGORY_LABEL = {
      python: "Python",
      node: "Node",
      rust: "Rust",
      ruby: "Ruby",
      dotnet: ".NET",
      windows: "Windows",
      source: "源码",
      other: "其它",
    };

    const CSS = `
.swm-page{height:100%;min-height:0;display:flex;flex-direction:column;gap:12px;padding:16px 24px 12px;box-sizing:border-box;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-base,transparent);font-size:13px;overflow:hidden}
.swm-head{display:flex;align-items:flex-start;gap:12px;flex:none}
.swm-title{font-size:17px;font-weight:600;line-height:1.3}
.swm-sub{font-size:12px;font-weight:400;color:var(--dsw-alias-label-tertiary,#8a8f98);margin-left:8px}
.swm-actions{margin-left:auto;display:flex;gap:8px;align-items:center}
.swm-btn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;line-height:1.4}
.swm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.swm-btn:disabled{opacity:.5;cursor:not-allowed}
.swm-btn-primary{background:var(--dsw-alias-button-primary-fill,#3b6fe0);border-color:transparent;color:#fff}
.swm-btn-danger{background:var(--dsw-alias-state-error-primary,#d0342c);border-color:transparent;color:#fff}
.swm-search{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;border-radius:8px;padding:5px 10px;font-size:12px;min-width:200px;outline:none}
.swm-search:focus{border-color:var(--dsw-alias-accent,#3b6fe0)}
.swm-stat{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,#5c6068);flex:none}
.swm-stat b{font-weight:600;color:var(--dsw-alias-label-primary,#1f2328)}
.swm-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:none}
.swm-select{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;border-radius:8px;padding:4px 8px;font-size:12px;outline:none}
.swm-checkLabel{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary,#5c6068);cursor:pointer;user-select:none}
.swm-list{flex:1;min-height:0;overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff)}
.swm-row{display:grid;grid-template-columns:26px minmax(130px,.85fr) minmax(140px,1fr) minmax(140px,1.15fr) minmax(150px,1.3fr) 88px 56px;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));min-width:820px}
.swm-row:last-child{border-bottom:none}
.swm-rowHead{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-2,#f7f8fa);font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-weight:500;text-transform:none}
.swm-rowMain{display:flex;align-items:center;gap:6px;min-width:0}
.swm-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swm-ver{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-variant-numeric:tabular-nums}
.swm-tag{display:inline-block;padding:1px 6px;border-radius:5px;font-size:10.5px;line-height:1.6;border:1px solid transparent;white-space:nowrap}
.swm-tag-installer{background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));color:var(--dsw-alias-label-secondary,#5c6068)}
.swm-purpose{font-size:11.5px;line-height:1.45;color:var(--dsw-alias-label-secondary,#5c6068);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.swm-purpose-unknown{color:var(--dsw-alias-label-tertiary,#9aa0a8)}
.swm-who{display:flex;flex-direction:column;gap:1px;min-width:0}
.swm-whoTitle{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#4a4f57)}
.swm-whoSub{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#9aa0a8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swm-path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#5c6068);direction:rtl;text-align:left}
.swm-pathSrc{font-size:10px;color:var(--dsw-alias-label-tertiary,#9aa0a8);margin-top:1px}
.swm-state{font-size:11.5px;display:inline-flex;align-items:center;gap:4px;cursor:help}
.swm-dot{width:6px;height:6px;border-radius:50%;display:inline-block;flex:none}
.swm-time{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-variant-numeric:tabular-nums;white-space:nowrap}
.swm-op{display:flex;gap:6px;justify-content:flex-end}
.swm-iconBtn{border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;padding:2px 4px;border-radius:5px;font-size:12px;line-height:1}
.swm-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#1f2328)}
.swm-detail{grid-column:1/-1;padding:4px 0 10px 36px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#5c6068);display:flex;flex-direction:column;gap:8px}
.swm-block{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));border-radius:9px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;background:var(--dsw-alias-bg-layer-2,#f8f9fb)}
.swm-blockTitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary,#8a8f98);letter-spacing:.02em}
.swm-quote{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-primary,#2f333a);white-space:pre-wrap;word-break:break-word}
.swm-pre{margin:0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;line-height:1.55;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-secondary,#4a4f57);max-height:180px;overflow:auto}
.swm-kv{display:flex;gap:6px;flex-wrap:wrap}
.swm-kv span{color:var(--dsw-alias-label-tertiary,#8a8f98)}
.swm-foot{flex:none;display:flex;align-items:center;gap:12px;padding:8px 4px 2px;font-size:12px;color:var(--dsw-alias-label-secondary,#5c6068)}
.swm-foot .swm-actions{margin-left:auto}
.swm-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;min-height:220px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:13px}
.swm-mask{position:fixed;inset:0;background:rgba(0,0,0,.34);display:flex;align-items:center;justify-content:center;z-index:60}
.swm-modal{width:min(680px,90vw);max-height:82vh;overflow:auto;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);border-radius:14px;padding:18px 20px;box-shadow:0 18px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:12px}
.swm-modalTitle{font-size:15px;font-weight:600}
.swm-modalText{font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#5c6068)}
.swm-dangerBox{border:1px solid var(--dsw-alias-state-error-primary,#d0342c);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-state-error-primary,#c02a22);background:rgba(208,52,44,.06)}
.swm-modalList{display:flex;flex-direction:column;gap:8px}
.swm-modalItem{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));border-radius:10px;padding:8px 10px}
.swm-modalItemName{font-weight:600;font-size:12.5px;display:flex;gap:6px;align-items:center}
.swm-result{border-radius:10px;padding:8px 10px;font-size:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));display:flex;flex-direction:column;gap:6px}
.swm-result-ok{border-color:var(--dsw-alias-state-success-primary,#1a7f37)}
.swm-result-bad{border-color:var(--dsw-alias-state-error-primary,#d0342c)}
.swm-spin{display:inline-block;width:11px;height:11px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:swm-spin .8s linear infinite;vertical-align:-1px;margin-right:5px}
@keyframes swm-spin{to{transform:rotate(360deg)}}
@media (max-width:1100px){.swm-row{grid-template-columns:26px minmax(130px,1fr) minmax(140px,1.3fr) 92px 92px 52px}.swm-colWho{display:none}}
@media (max-width:860px){.swm-row{grid-template-columns:26px minmax(130px,1fr) 92px 92px 52px}.swm-colPurpose,.swm-colPath{display:none}}
`;

    function ensureStyle() {
      if (typeof document === "undefined") return;
      const tagId = "dsh-software-manager/page.css";
      if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-software-manager";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function fmtTime(ms) {
      if (!ms) return "—";
      try {
        return new Date(ms).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      } catch {
        return "—";
      }
    }

    function middleEllipsis(value, max = 64) {
      const text = String(value || "");
      if (text.length <= max) return text;
      const head = Math.ceil((max - 1) / 2);
      const tail = Math.floor((max - 1) / 2);
      return `${text.slice(0, head)}…${text.slice(-tail)}`;
    }

    function stateMeta(state, locating) {
      if (locating) return { label: "定位中", color: "var(--dsw-alias-label-tertiary,#8a8f98)" };
      switch (state) {
        case "installed":
          return { label: "已安装", color: "var(--dsw-alias-state-success-primary,#1a7f37)" };
        case "missing":
          return { label: "已卸载", color: "var(--dsw-alias-label-tertiary,#9aa0a8)" };
        case "batch":
          return { label: "依赖清单", color: "var(--dsw-alias-label-secondary,#5c6068)" };
        case "script":
          return { label: "安装脚本", color: "var(--dsw-alias-label-secondary,#5c6068)" };
        case "unknown":
          return { label: "待确认", color: "var(--dsw-alias-state-warn-primary,#b26a00)" };
        default:
          return { label: "定位中", color: "var(--dsw-alias-label-tertiary,#8a8f98)" };
      }
    }

    function SoftwareManagerIcon() {
      return jsx.jsx("svg", {
        width: 18,
        height: 18,
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": "true",
        children: [
          jsx.jsx("path", {
            d: "M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2z",
            stroke: "currentColor",
            strokeWidth: 1.6,
            strokeLinejoin: "round",
          }),
          jsx.jsx("path", {
            d: "M4 8.2 12 12.4l8-4.2M12 12.4V20",
            stroke: "currentColor",
            strokeWidth: 1.6,
            strokeLinejoin: "round",
          }),
          jsx.jsx("circle", { cx: 18.6, cy: 5.4, r: 3.1, fill: "currentColor" }),
          jsx.jsx("path", {
            d: "M18.6 4v2.6M17.5 5.5l1.1 1.1 1.1-1.1",
            stroke: "var(--dsw-alias-bg-layer-1,#fff)",
            strokeWidth: 0.95,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
        ],
      });
    }

    function Row(props) {
      const { item, located, selected, onToggle, onReveal, onReinstall, onForget, onSelectSession } = props;
      const [open, setOpen] = react.useState(false);
      const locating = !located;
      const meta = stateMeta(located?.state, locating);
      const plan = located?.plan || null;
      const canUninstall = Boolean(plan && plan.command);
      const location = located?.location || item.locationHint || null;
      const gone = located?.state === "missing" || located?.state === "batch" || located?.state === "script";      const who = item.sessionTitle || item.sessionId || "—";
      const why = item.userAsk || null;

      return h(
        "div",
        { className: "swm-row" },
        h("input", {
          type: "checkbox",
          checked: selected,
          disabled: !canUninstall,
          onChange: () => onToggle(item.id),
          title: canUninstall
            ? "选中以卸载"
            : (plan?.reason || "无法自动卸载"),
        }),
        h(
          "div",
          { className: "swm-rowMain" },
          h("span", { className: "swm-name", title: item.package }, item.package),
          h("span", { className: "swm-tag swm-tag-installer" }, INSTALLER_LABEL[item.installer] || item.installer),
          item.version ? h("span", { className: "swm-ver" }, item.version) : null,
        ),
        h(
          "div",
          {
            className: "swm-colPurpose",
            title: item.purpose ? `${item.purpose}${item.purposeKnown ? "" : "（未收录的包，按安装器归类）"}` : "",
          },
          h(
            "span",
            { className: `swm-purpose${item.purposeKnown ? "" : " swm-purpose-unknown"}` },
            item.purpose || CATEGORY_LABEL[item.category] || "—",
          ),
        ),
        h(
          "div",
          { className: "swm-colWho swm-who", title: `${who}${why ? `\n诉求：${why}` : ""}` },
          h(
            "button",
            {
              className: "swm-whoTitle",
              style: { border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
              title: "打开这个会话",
              onClick: () => onSelectSession && item.sessionId && onSelectSession(item.sessionId),
            },
            who,
          ),
          h("div", { className: "swm-whoSub" }, item.workspace ? item.workspace : item.origin === "subagent" ? "子代理会话" : ""),
        ),
        h(
          "div",
          { className: "swm-colPath", style: { minWidth: 0 } },
          h("div", { className: "swm-path", title: location || "—" }, location ? middleEllipsis(location, 70) : "—"),
          h(
            "div",
            { className: "swm-pathSrc" },
            located
              ? located.state === "batch"
                ? "清单文件"
                : located.state === "script"
                  ? "脚本文件"
                  : SOURCE_LABEL[located.locationSource] || located.locationSource
              : "查询中…",
          ),
        ),
        h(
          "div",
          { className: "swm-state", title: located?.explain || located?.detail || "" },
          h("span", { className: "swm-dot", style: { background: meta.color } }),
          meta.label,
        ),
        h(
          "div",
          { className: "swm-op" },
          located?.state === "missing"
            ? h(
                "button",
                {
                  className: "swm-iconBtn",
                  title: "重新装回来（会重跑当初的安装命令）",
                  onClick: () => onReinstall && onReinstall(item),
                },
                "↺",
              )
            : null,
          location
            ? h(
                "button",
                {
                  className: "swm-iconBtn",
                  title: "在资源管理器中打开",
                  onClick: () => onReveal(location),
                },
                "↗",
              )
            : null,
          located?.state === "missing"
            ? h(
                "button",
                {
                  className: "swm-iconBtn",
                  title: "删除这条记录（彻底移除，重扫也不会回来）",
                  onClick: () => onForget && onForget(item),
                },
                "✕",
              )
            : null,
          h(
            "button",
            { className: "swm-iconBtn", title: "详情", onClick: () => setOpen((value) => !value) },
            open ? "▴" : "▾",
          ),
        ),
        open
          ? h(
              "div",
              { className: "swm-detail" },
              h(
                "div",
                { className: "swm-kv" },
                h("span", null, "最近安装："),
                h("b", null, fmtTime(item.time)),
                h("span", null, " · 出现 "),
                h("b", null, String(item.occurrences ?? 1)),
                h("span", null, " 次"),
                item.firstSeen && item.firstSeen !== item.time ? h("span", null, " · 最早 " + fmtTime(item.firstSeen)) : null,
                item.origin === "subagent" ? h("span", null, " · 子代理" + (item.turn ? ` 第 ${item.turn} 轮` : "")) : item.turn ? h("span", null, ` · 第 ${item.turn} 轮`) : null,
              ),
              h(
                "div",
                { className: "swm-block" },
                h("div", { className: "swm-blockTitle" }, "谁装的"),
                h(
                  "div",
                  { className: "swm-quote", style: { cursor: "pointer", textDecoration: "underline dotted" }, title: "打开这个会话", onClick: () => onSelectSession && item.sessionId && onSelectSession(item.sessionId) },
                  item.sessionTitle || item.sessionId || "—",
                ),
                h(
                  "div",
                  { className: "swm-kv" },
                  h("span", null, "工作区："),
                  item.workspace || "—",
                  item.cwd ? h("span", null, "　目录：" + item.cwd) : null,
                  h("span", null, "　会话 id：" + (item.sessionId || "—")),
                ),
              ),
              why
                ? h(
                    "div",
                    { className: "swm-block" },
                    h("div", { className: "swm-blockTitle" }, "当时的需求"),
                    h("div", { className: "swm-quote" }, why),
                  )
                : null,
              item.agentLead
                ? h(
                    "div",
                    { className: "swm-block" },
                    h("div", { className: "swm-blockTitle" }, "助手当时说要做什么"),
                    h("div", { className: "swm-quote" }, item.agentLead),
                  )
                : null,
              h(
                "div",
                { className: "swm-block" },
                h("div", { className: "swm-blockTitle" }, "用途"),
                h("div", { className: "swm-quote" }, item.purpose || "未收录", item.purposeKnown ? null : h("span", { style: { color: "var(--dsw-alias-label-tertiary,#9aa0a8)" } }, "（这个包不在内置用途表里，按安装器归类）")),
                h(
                  "div",
                  { className: "swm-kv" },
                  h("span", null, "类型："),
                  CATEGORY_LABEL[item.category] || "其它",
                  h("span", null, "　安装器："),
                  INSTALLER_LABEL[item.installer] || item.installer,
                ),
              ),
              h(
                "div",
                { className: "swm-block" },
                h("div", { className: "swm-blockTitle" }, located ? `现在的状态：${meta.label}` : "现在的状态：查询中"),
                h("div", { className: "swm-quote" }, located?.explain || "正在查询系统状态…"),
                location ? h("div", { className: "swm-kv" }, h("span", null, "位置（" + (SOURCE_LABEL[located.locationSource] || "未定位") + "）："), location) : null,
                located?.detail && located.state !== "missing" ? h("div", { className: "swm-kv" }, h("span", null, "备注："), located.detail) : null,
              ),
              h(
                "div",
                { className: "swm-block" },
                h("div", { className: "swm-blockTitle" }, "当初执行的命令"),
                h("pre", { className: "swm-pre" }, item.raw || "—"),
              ),
              h(
                "div",
                { className: "swm-block" },
                h("div", { className: "swm-blockTitle" }, "卸载方式"),
                h(
                  "div",
                  { className: "swm-quote" },
                  plan && plan.command
                    ? "将执行："
                    : plan && plan.reason
                      ? plan.reason
                      : "定位中…",
                ),
                plan && plan.command ? h("pre", { className: "swm-pre" }, plan.command) : null,
                gone
                  ? h(
                      "div",
                      { className: "swm-kv", style: { color: "var(--dsw-alias-label-tertiary,#9aa0a8)" } },
                      located?.state === "missing"
                        ? "这条是保留的卸载记录：命令当年装过它，现在系统里已经没有了，等于已卸载。想装回来可以点 ↺。"
                        : located?.state === "batch"
                          ? "这是一份依赖清单，不是单个软件。要看清单里的包装了没有，请按包名逐个查，不能整份卸载。"
                          : "这是一个安装脚本，装了什么由脚本自己决定，本插件看不到细节，只能手动处理。",
                    )
                  : null,
                h("div", { className: "swm-quote" }, located?.explain ?? ""),
              ),
            )
          : null,
      );
    }

    // apply 时注入的 ctx：面板组件里要用它调 uiWorkspace / layout。
    let surface = null;

    function Page() {
      ensureStyle();
      const [items, setItems] = react.useState([]);
      const [locations, setLocations] = react.useState({});
      const [stats, setStats] = react.useState(null);
      const [loading, setLoading] = react.useState(false);
      const [locating, setLocating] = react.useState(false);
      const [error, setError] = react.useState(null);
      const [query, setQuery] = react.useState("");
      const [installerFilter, setInstallerFilter] = react.useState("");
      const [stateFilter, setStateFilter] = react.useState("");
      const [selected, setSelected] = react.useState(() => new Set());
      const [confirm, setConfirm] = react.useState(null);
      const [reinstall, setReinstall] = react.useState(null);
      const [forget, setForget] = react.useState(null);
      const [dangerOk, setDangerOk] = react.useState(false);
      const [running, setRunning] = react.useState(false);
      const [results, setResults] = react.useState(null);
      const alive = react.useRef(true);

      react.useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      const locateAll = react.useCallback(async (list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        setLocating(true);
        const chunkSize = 8;
        try {
          for (let index = 0; index < list.length; index += chunkSize) {
            if (!alive.current) return;
            const ids = list.slice(index, index + chunkSize).map((item) => item.id);
            const response = await api("locate", { ids, concurrency: 3 });
            if (!alive.current) return;
            if (response?.ok && response.locations) {
              setLocations((previous) => ({ ...previous, ...response.locations }));
            }
          }
        } catch (cause) {
          if (alive.current) setError(String(cause?.message || cause));
        } finally {
          if (alive.current) setLocating(false);
        }
      }, []);

      const scan = react.useCallback(
        async (force) => {
          setLoading(true);
          setError(null);
          setResults(null);
          setSelected(new Set());
          setLocations({});
          try {
            const response = await api("scan", { force: force === true });
            if (!alive.current) return;
            if (!response?.ok) {
              setError(response?.error || "扫描失败");
              return;
            }
            const list = Array.isArray(response.items) ? response.items : [];
            setItems(list);
            setStats(response.stats ?? null);
            if (list.length > 0) locateAll(list);
          } catch (cause) {
            if (alive.current) setError(String(cause?.message || cause));
          } finally {
            if (alive.current) setLoading(false);
          }
        },
        [locateAll],
      );

      react.useEffect(() => {
        scan(false);
      }, [scan]);

      // 「已卸载」记录只保留 7 天，过期的不再算进任何地方（列表、统计都一样）。
      const isRowHidden = react.useCallback(
        (item) => {
          const located = locations[item.id];
          return located?.state === "missing" && located.expired === true;
        },
        [locations],
      );

      const filtered = react.useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return items.filter((item) => {
          if (installerFilter && item.installer !== installerFilter) return false;
          if (isRowHidden(item)) return false;
          if (stateFilter) {
            const state = locations[item.id]?.state ?? "pending";
            if (stateFilter === "pending" ? state !== "pending" : state !== stateFilter) return false;
          }
          if (!keyword) return true;
          const haystack = [
            item.package,
            item.purpose,
            item.sessionTitle,
            item.sessionId,
            item.workspace,
            item.userAsk,
            item.agentLead,
            item.raw,
            item.locationHint,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(keyword);
        });
      }, [items, query, installerFilter, stateFilter, locations, isRowHidden]);

      const counts = react.useMemo(() => {
        let installed = 0;
        let missing = 0;
        let batch = 0;
        let script = 0;
        let unknown = 0;
        let pending = 0;
        let total = 0;
        for (const item of items) {
          if (isRowHidden(item)) continue;
          total += 1;
          const located = locations[item.id];
          if (!located) pending += 1;
          else if (located.state === "installed") installed += 1;
          else if (located.state === "missing") missing += 1;
          else if (located.state === "batch") batch += 1;
          else if (located.state === "script") script += 1;
          else unknown += 1;
        }
        return { total, installed, missing, batch, script, unknown, pending };
      }, [items, locations, isRowHidden]);

      const selectable = (item) => {
        const located = locations[item.id];
        return Boolean(located?.plan?.command);
      };

      const selectedItems = react.useMemo(
        () => items.filter((item) => selected.has(item.id) && selectable(item)),
        [items, selected, locations],
      );

      const toggle = (id) => {
        setSelected((previous) => {
          const next = new Set(previous);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      };

      const toggleAll = () => {
        const candidates = filtered.filter(selectable);
        const allSelected = candidates.length > 0 && candidates.every((item) => selected.has(item.id));
        setSelected(() => (allSelected ? new Set() : new Set(candidates.map((item) => item.id))));
      };

      const openConfirm = () => {
        if (selectedItems.length === 0) return;
        setDangerOk(false);
        setConfirm(selectedItems.map((item) => item.id));
      };

      // 点"删除记录"：只对「已卸载」条目开放，确认后从列表里彻底移除。
      const openForget = (item) => {
        if (!item) return;
        setForget([item.id]);
      };

      // 点"重新装回来"：先向后端要一份命令预览，确认后再真正执行。
      const openReinstall = async (item) => {
        if (!item) return;
        setError(null);
        try {
          const response = await api("reinstall", { ids: [item.id], preview: true });
          const first = Array.isArray(response?.results) ? response.results[0] : null;
          if (!first) {
            setError("没有拿到重装命令");
            return;
          }
          if (!first.ok) {
            setError(`${item.package}：${first.reason || "无法重装"}`);
            return;
          }
          setReinstall({ item, command: first.command, note: first.note ?? null, danger: first.danger === true });
        } catch (cause) {
          setError(String(cause?.message || cause));
        }
      };

      const hasDanger = react.useMemo(
        () => (confirm || []).some((id) => locations[id]?.plan?.danger === true),
        [confirm, locations],
      );

      const doUninstall = async () => {
        if (!confirm || confirm.length === 0) return;
        setRunning(true);
        setResults(null);
        try {
          const response = await api("uninstall", { ids: confirm, confirmDanger: dangerOk });
          if (!alive.current) return;
          setResults(Array.isArray(response?.results) ? response.results : []);
          setConfirm(null);
          // 卸载后重扫一遍，让状态反映真实系统
          await scan(false);
        } catch (cause) {
          if (alive.current) setError(String(cause?.message || cause));
        } finally {
          if (alive.current) setRunning(false);
        }
      };

      const doReinstall = async () => {
        if (!reinstall || reinstall.length === 0) return;
        setRunning(true);
        setResults(null);
        try {
          const response = await api("reinstall", { ids: reinstall, confirmDanger: true, timeout: 600000 });
          if (!alive.current) return;
          setResults(Array.isArray(response?.results) ? response.results : []);
          setReinstall(null);
          await scan(true);
        } catch (cause) {
          if (alive.current) setError(String(cause?.message || cause));
        } finally {
          if (alive.current) setRunning(false);
        }
      };

      const doForget = async () => {
        if (!forget || forget.length === 0) return;
        setRunning(true);
        try {
          await api("forget", { ids: forget });
          if (!alive.current) return;
          // 本地先摘掉，不用等重扫：这些条目再怎么扫也扫不回来了
          setItems((previous) => previous.filter((item) => !forget.includes(item.id)));
          setSelected((previous) => {
            const next = new Set(previous);
            for (const id of forget) next.delete(id);
            return next;
          });
          setForget(null);
        } catch (cause) {
          if (alive.current) setError(String(cause?.message || cause));
        } finally {
          if (alive.current) setRunning(false);
        }
      };

      const reveal = (target) => {
        api("reveal", { path: target }).catch(() => {});
      };

      // 点"谁装的"直接跳到那个会话：uiWorkspace 是可选服务，没有就退化成什么都不做。
      const selectSession = (sessionId) => {
        if (!sessionId) return;
        const ctx = surface;
        try {
          const uiWorkspace = ctx?.get?.("uiWorkspace");
          if (uiWorkspace && typeof uiWorkspace.openSession === "function") {
            uiWorkspace.openSession(sessionId);
            return;
          }
        } catch {
          /* 服务不可用就忽略 */
        }
        try {
          ctx?.get?.("layout")?.selectPanel?.("conversation");
        } catch {
          /* ignore */
        }
      };

      const installerOptions = react.useMemo(() => {
        const set = new Set(items.map((item) => item.installer));
        return [...set].sort();
      }, [items]);

      return h(
        "div",
        { className: "swm-page" },
        h(
          "div",
          { className: "swm-head" },
          h(
            "div",
            null,
            h("div", { className: "swm-title" }, "软件管理"),
            h("div", { className: "swm-sub" }, "harness 在会话中安装过的软件、位置与卸载"),
          ),
          h(
            "div",
            { className: "swm-actions" },
            h(
              "input",
              {
                className: "swm-search",
                placeholder: "搜索软件、会话或命令…",
                value: query,
                onChange: (event) => setQuery(event.target.value),
              },
            ),
            h(
              "button",
              { className: "swm-btn", onClick: () => scan(true), disabled: loading || running },
              loading ? h("span", { className: "swm-spin" }) : null,
              "重新扫描",
            ),
          ),
        ),
        h(
          "div",
          { className: "swm-stat" },
          h("span", null, "共 ", h("b", null, String(counts.total)), " 项"),
          h("span", null, "已安装 ", h("b", null, String(counts.installed))),
          h(
            "span",
            { title: "这一项当年被命令装过，现在系统里已经查不到；它已经被卸载/删除了，记录保留备查（最多 7 天）" },
            "已卸载 ",
            h("b", null, String(counts.missing)),
          ),
          counts.batch > 0 ? h("span", { title: "依赖清单（如 requirements.txt）：不是单个软件，不能整份卸载" }, "依赖清单 ", h("b", null, String(counts.batch))) : null,
          counts.script > 0 ? h("span", { title: "安装脚本（如 install.bat）：装了什么由脚本决定，本插件看不到细节" }, "安装脚本 ", h("b", null, String(counts.script))) : null,
          h("span", null, "待确认 ", h("b", null, String(counts.unknown))),
          counts.pending > 0 ? h("span", null, h("span", { className: "swm-spin" }), "定位中 ", h("b", null, String(counts.pending))) : null,
          stats ? h("span", null, `${stats.sessions} 个会话 · ${stats.durationMs}ms`) : null,
        ),
        h(
          "div",
          { className: "swm-filters" },
          h(
            "select",
            { className: "swm-select", value: installerFilter, onChange: (event) => setInstallerFilter(event.target.value) },
            h("option", { value: "" }, "全部安装器"),
            installerOptions.map((name) => h("option", { key: name, value: name }, INSTALLER_LABEL[name] || name)),
          ),
          h(
            "select",
            { className: "swm-select", value: stateFilter, onChange: (event) => setStateFilter(event.target.value) },
            h("option", { value: "" }, "全部状态"),
            h("option", { value: "installed" }, "已安装（可卸载）"),
            h("option", { value: "missing" }, "已卸载（记录保留）"),
            h("option", { value: "batch" }, "依赖清单"),
            h("option", { value: "script" }, "安装脚本"),
            h("option", { value: "unknown" }, "待确认"),
            h("option", { value: "pending" }, "定位中"),
          ),
          h(
            "label",
            { className: "swm-checkLabel" },
            h("input", { type: "checkbox", onChange: toggleAll, checked: filtered.length > 0 && filtered.filter(selectable).every((item) => selected.has(item.id)) }),
            "全选可卸载项",
          ),
          error ? h("span", { style: { color: "var(--dsw-alias-state-error-primary,#d0342c)", fontSize: "12px" } }, error) : null,
        ),
        h(
          "div",
          { className: "swm-list" },
          h(
            "div",
            { className: "swm-row swm-rowHead" },
            h("span", null),
            h("span", null, "软件"),
            h("span", { className: "swm-colPurpose" }, "用途"),
            h("span", { className: "swm-colWho" }, "谁装的"),
            h("span", { className: "swm-colPath" }, "安装位置"),
            h("span", null, "状态"),
            h("span", null),
          ),
          items.length === 0
            ? h(
                "div",
                { className: "swm-empty" },
                loading ? h("span", null, h("span", { className: "swm-spin" }), "正在扫描会话日志…") : "还没有发现 harness 安装过软件",
                !loading ? h("span", { style: { fontSize: "11.5px" } }, "扫描范围：~/.dsh/sessions 下所有会话的 shell 命令") : null,
              )
            : filtered.map((item) =>
                h(Row, {
                  key: item.id,
                  item,
                  located: locations[item.id] || null,
                  selected: selected.has(item.id),
                  onToggle: toggle,
                  onReveal: reveal,
                  onReinstall: openReinstall,
                  onForget: openForget,
                  onSelectSession: selectSession,
                }),
              ),
        ),
        h(
          "div",
          { className: "swm-foot" },
          h("span", null, "已选 ", h("b", null, String(selectedItems.length)), " 项"),
          locating ? h("span", null, h("span", { className: "swm-spin" }), "正在定位安装位置…") : null,
          h(
            "div",
            { className: "swm-actions" },
            h(
              "button",
              { className: "swm-btn swm-btn-danger", disabled: selectedItems.length === 0 || running, onClick: openConfirm },
              "卸载选中",
            ),
          ),
        ),
        results && results.length > 0
          ? h(
              "div",
              { className: "swm-mask", onClick: () => setResults(null) },
              h(
                "div",
                { className: "swm-modal", onClick: (event) => event.stopPropagation() },
                h("div", { className: "swm-modalTitle" }, "卸载结果"),
                h(
                  "div",
                  { className: "swm-modalList" },
                  results.map((result) =>
                    h(
                      "div",
                      { key: result.id, className: `swm-result ${result.ok ? "swm-result-ok" : "swm-result-bad"}` },
                      h(
                        "div",
                        { className: "swm-modalItemName" },
                        result.ok ? "✓ " : "✕ ",
                        result.package || result.id,
                        h("span", { className: "swm-tag swm-tag-installer" }, result.ok ? `${result.durationMs ?? 0}ms` : "失败"),
                      ),
                      result.command ? h("pre", { className: "swm-pre" }, result.command) : null,
                      result.reason ? h("div", null, result.reason) : null,
                      result.stdout ? h("pre", { className: "swm-pre" }, result.stdout) : null,
                      result.stderr ? h("pre", { className: "swm-pre" }, result.stderr) : null,
                      result.error ? h("div", null, result.error) : null,
                    ),
                  ),
                ),
                h("div", { style: { display: "flex", justifyContent: "flex-end" } }, h("button", { className: "swm-btn", onClick: () => setResults(null) }, "关闭")),
              ),
            )
          : null,
        reinstall
          ? h(
              "div",
              { className: "swm-mask", onClick: () => (running ? null : setReinstall(null)) },
              h(
                "div",
                { className: "swm-modal", onClick: (event) => event.stopPropagation() },
                h("div", { className: "swm-modalTitle" }, `重新装回 ${reinstall.item.package}？`),
                h(
                  "div",
                  { className: "swm-modalText" },
                  "按当初那次的安装器重跑安装命令。装好后需要点「重新扫描」才能更新状态。",
                ),
                h("pre", { className: "swm-pre" }, reinstall.command),
                reinstall.note ? h("div", { className: "swm-pathSrc" }, reinstall.note) : null,
                h(
                  "div",
                  { style: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "10px" } },
                  h("button", { className: "swm-btn", onClick: () => setReinstall(null), disabled: running }, "取消"),
                  h(
                    "button",
                    { className: "swm-btn", onClick: doReinstall, disabled: running },
                    running ? h("span", { className: "swm-spin" }) : null,
                    running ? "执行中…" : "执行安装",
                  ),
                ),
              ),
            )
          : null,
        forget && forget.length > 0
          ? h(
              "div",
              { className: "swm-mask", onClick: () => (running ? null : setForget(null)) },
              h(
                "div",
                { className: "swm-modal", onClick: (event) => event.stopPropagation() },
                h("div", { className: "swm-modalTitle" }, "删除这条记录？"),
                h(
                  "div",
                  { className: "swm-modalText" },
                  "只会从这份列表里永久移除这条「已卸载」记录，不会动系统里的任何文件。重扫也找不回来。",
                ),
                h(
                  "div",
                  { style: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "10px" } },
                  h("button", { className: "swm-btn", onClick: () => setForget(null), disabled: running }, "取消"),
                  h(
                    "button",
                    { className: "swm-btn", onClick: doForget, disabled: running },
                    running ? h("span", { className: "swm-spin" }) : null,
                    running ? "正在删除…" : "删除记录",
                  ),
                ),
              ),
            )
          : null,
        confirm && confirm.length > 0
          ? h(
              "div",
              { className: "swm-mask", onClick: () => (running ? null : setConfirm(null)) },
              h(
                "div",
                { className: "swm-modal", onClick: (event) => event.stopPropagation() },
                h("div", { className: "swm-modalTitle" }, `确认卸载 ${confirm.length} 项软件？`),
                h("div", { className: "swm-modalText" }, "卸载会调用各安装器自身的卸载程序，执行后不可撤销。下面是将要执行的命令："),
                hasDanger
                  ? h(
                      "div",
                      { className: "swm-dangerBox" },
                      "其中包含直接删除安装目录的操作，删除后无法恢复。",
                      h(
                        "label",
                        { className: "swm-checkLabel", style: { marginTop: "6px", color: "inherit" } },
                        h("input", { type: "checkbox", checked: dangerOk, onChange: (event) => setDangerOk(event.target.checked) }),
                        "我确认删除这些目录",
                      ),
                    )
                  : null,
                h(
                  "div",
                  { className: "swm-modalList" },
                  confirm.map((id) => {
                    const item = items.find((candidate) => candidate.id === id);
                    const located = locations[id];
                    return h(
                      "div",
                      { key: id, className: "swm-modalItem" },
                      h(
                        "div",
                        { className: "swm-modalItemName" },
                        item?.package || id,
                        h("span", { className: "swm-tag swm-tag-installer" }, INSTALLER_LABEL[item?.installer] || item?.installer || ""),
                        located?.location ? h("span", { className: "swm-pathSrc" }, middleEllipsis(located.location, 56)) : null,
                      ),
                      h("pre", { className: "swm-pre" }, located?.plan?.command || "—"),
                    );
                  }),
                ),
                h(
                  "div",
                  { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
                  h("button", { className: "swm-btn", onClick: () => setConfirm(null), disabled: running }, "取消"),
                  h(
                    "button",
                    {
                      className: "swm-btn swm-btn-danger",
                      onClick: doUninstall,
                      disabled: running || (hasDanger && !dangerOk),
                    },
                    running ? h("span", { className: "swm-spin" }) : null,
                    running ? "执行中…" : "确认卸载",
                  ),
                ),
              ),
            )
          : null,
      );
    }

    function apply(ctx) {
      surface = ctx;
      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 40,
            label: () => "软件管理",
          },
          SoftwareManagerIcon,
        ),
      );
      ctx.slots.inject("main", () =>
        ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
          },
          Page,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
