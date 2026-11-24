# dsh-software-manager

A plugin for [DSH] (DeepSeek Harness) that answers one question: **what did the agent install on my machine, and where did it go?** It reads your DSH session logs, finds every install command the agent ran, resolves each package to its real location, and uninstalls it in one click.

[DSH] 插件：**agent 在会话里到底往这台机器装了什么、装到哪去了？** 它读你的 DSH 会话日志，找出 agent 执行过的每一条安装命令，定位到真实安装位置，并支持一键卸载。

## What it shows / 显示什么

- **Package and version** — parsed from the original command (`pip install faster-whisper`, `npm i -g pnpm@9`, `winget install --id Git.Git`, …).
- **Purpose** — a built-in Chinese dictionary of ~180 packages (`faster-whisper` → 语音转文字, `pypdf` → PDF 读取与合并拆分), falling back to a per-installer generic description.
- **Who installed it** — the session title, the session id, and the exact ask you gave the agent in that turn. Clicking it opens that session.
- **Real location** — resolved per installer: the Windows `Uninstall` registry keys for winget/MSI, `importlib.metadata` + `sysconfig` for Python (using the interpreter from the command, so a venv stays a venv), `npm root -g` for Node, `where.exe` and the default prefixes for the rest.
- **Status** — installed / uninstalled / dependency list / install script, each with a one-line explanation of what it means.
- **Original command** — the exact shell line, its working directory, and how many times it ran.

## Supported installers / 支持的安装器

`winget` · `choco` · `scoop` · `pip` · `uv` · `npm` · `pnpm` · `yarn` · `bun` · `cargo` · `gem` · `dotnet` · `msiexec` · archive extraction (`Expand-Archive`, `tar -x`, `7z x`) · `git clone` · install scripts (`install.bat`)

## Install / 安装

Straight from this repository / 直接从仓库安装（）：

```sh
dsh plugin add github:chenjie151/dsh-software-manager
```

Or from a local checkout / 或从本地源码目录安装：

```sh
dsh plugin add ./path/to/dsh-software-manager
```

In the desktop client, enable it under **Settings → Plugins** and press `Ctrl+R` to reload the window. The entry shows up in the left sidebar as **软件管理 / Software Manager**.

桌面版：在 **设置 → 插件** 里启用后按 `Ctrl+R` 刷新窗口，左侧栏就会出现「软件管理」。上架插件目录后也可以在插件市场里一键安装。

## Usage / 使用

1. Click **软件管理** in the left sidebar. The panel scans every session on open and lists what it found.
2. Filter by installer or status, or search across package, purpose, session title and the original command.
3. Tick the rows you want and press **卸载选中** — the confirm dialog shows the exact command per item before anything runs.
4. For a package that is no longer on disk, **↺** replays the original install command.

## Safety / 安全

- Uninstall **executes real commands** with your permissions: `pip uninstall -y`, `winget uninstall`, `npm uninstall -g`, and for portable folders a `Remove-Item` of the install directory. Nothing runs until you confirm, and directory removal needs a second checkbox.
- Uninstalling a dependency list (`requirements.txt`) or an install script (`install.bat`) is refused: the plugin cannot know what those produced.
- The bridge only accepts same-origin `POST` requests from loopback, and the uninstall endpoint takes item ids — never a command from the browser.
- State lives in your DSH home (`~/.dsh/software-manager/forgotten.json`) and holds only the ids of records you deleted.

## Limitations / 限制

- Only installs that went through a **shell command in a DSH session** are found. Anything you installed yourself in another terminal does not appear.
- Locations are resolved from the Windows registry, `where.exe` and per-ecosystem metadata; other platforms are untested.
- An "uninstalled" record is kept for **7 days** and can be deleted permanently from the row.
- The UI strings are Chinese; `locale/en.json` carries the English title and description for the plugin list.

## License / 许可

MIT
