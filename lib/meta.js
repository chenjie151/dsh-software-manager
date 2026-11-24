/**
 * 软件用途字典。
 *
 * 用途是"这个包是干什么用的"的离线推断：常见包给一句话说明，
 * 不在表里的按安装器给通用描述，绝不编造具体功能。
 */

const PURPOSE = {
  // ---- Python：语音 / 音视频 ----
  "faster-whisper": "语音转文字（Whisper 的 CTranslate2 加速实现）",
  "whisper": "语音转文字（OpenAI Whisper）",
  "openai-whisper": "语音转文字（OpenAI Whisper）",
  "av": "音视频解码与编码（PyAV / FFmpeg 绑定）",
  "moviepy": "视频剪辑与合成",
  "pydub": "音频剪辑与格式转换（依赖 ffmpeg）",
  "soundfile": "音频文件读写",
  "librosa": "音频特征分析",
  "edge-tts": "微软 Edge 语音合成（TTS）",
  "pyttsx3": "本地离线语音合成（TTS）",
  "vosk": "离线语音识别",
  "speechrecognition": "语音识别统一接口",

  // ---- Python：文档 / 办公 ----
  "pypdf": "PDF 读取与合并拆分",
  "pypdf2": "PDF 读取与合并拆分（旧包名）",
  "pdfplumber": "PDF 文本与表格抽取",
  "pdfminer-six": "PDF 文本抽取",
  "pdf2image": "PDF 转图片",
  "python-docx": "Word（.docx）读写",
  "docx": "Word（.docx）读写",
  "python-pptx": "PowerPoint（.pptx）读写",
  "openpyxl": "Excel（.xlsx）读写",
  "xlsxwriter": "Excel（.xlsx）写入与图表",
  "xlrd": "Excel（.xls）读取",
  "reportlab": "程序生成 PDF",
  "fpdf2": "程序生成 PDF",
  "weasyprint": "HTML/网页转 PDF",
  "markdown": "Markdown 转 HTML",
  "docxtpl": "Word 模板填充",

  // ---- Python：数据 / 科学 ----
  "pandas": "表格数据处理与分析",
  "numpy": "数值与矩阵计算",
  "scipy": "科学计算",
  "matplotlib": "绘图与图表输出",
  "seaborn": "统计图表",
  "plotly": "交互式图表",
  "scikit-learn": "机器学习算法",
  "statsmodels": "统计建模",
  "pyarrow": "列式数据（Parquet/Arrow）",
  "duckdb": "嵌入式分析数据库",
  "h5py": "HDF5 数据文件",
  "openpyxl-chart": "Excel 图表",
  "tabulate": "终端表格输出",

  // ---- Python：图像 / 视觉 ----
  "pillow": "图像读取与处理",
  "opencv-python": "图像与视频处理（OpenCV）",
  "opencv-python-headless": "图像处理（OpenCV，无 GUI）",
  "imageio": "图像读写",
  "scikit-image": "图像算法",
  "pyautogui": "鼠标键盘自动化",
  "pytesseract": "OCR 文字识别（需 Tesseract）",
  "easyocr": "OCR 文字识别",

  // ---- Python：深度学习 ----
  "torch": "PyTorch 深度学习框架",
  "torchvision": "视觉模型与数据集",
  "torchaudio": "音频模型与数据集",
  "transformers": "HuggingFace 预训练模型",
  "tokenizers": "文本分词",
  "safetensors": "模型权重格式读写",
  "accelerate": "模型推理/训练加速",
  "onnxruntime": "ONNX 模型推理",
  "huggingface-hub": "模型与数据集下载",
  "diffusers": "扩散模型（绘图/生成）",
  "sentence-transformers": "文本向量嵌入",
  "faiss-cpu": "向量相似度检索",
  "chromadb": "向量数据库",
  "gradio": "网页形式的模型演示界面",
  "streamlit": "网页形式的数据应用",

  // ---- Python：网络 / Web ----
  "aiofiles": "异步文件读写",
  "aiohttp": "异步 HTTP 客户端与服务端",
  "httpx": "HTTP 客户端（同步/异步）",
  "requests": "HTTP 请求",
  "urllib3": "HTTP 底层库（requests 依赖）",
  "websockets": "WebSocket 通信",
  "websocket-client": "WebSocket 客户端",
  "fastapi": "Web API 框架",
  "uvicorn": "ASGI 应用服务器",
  "starlette": "轻量 ASGI 框架",
  "flask": "轻量 Web 框架",
  "django": "Web 框架",
  "werkzeug": "WSGI 工具集（flask 依赖）",
  "jinja2": "模板引擎",
  "pydantic": "数据校验与配置模型",
  "python-multipart": "表单/文件上传解析",
  "paramiko": "SSH 客户端",
  "fabric": "SSH 远程部署",
  "selenium": "浏览器自动化",
  "playwright": "浏览器自动化",
  "pywin32": "Windows API 调用",
  "psutil": "进程与系统信息",
  "pyperclip": "剪贴板读写",
  "watchdog": "文件变化监控",
  "schedule": "定时任务",

  // ---- Python：解析 / 工具 ----
  "beautifulsoup4": "HTML/XML 解析",
  "lxml": "XML/HTML 高速解析",
  "pyyaml": "YAML 读写",
  "toml": "TOML 读写",
  "orjson": "高性能 JSON",
  "regex": "正则表达式",
  "tqdm": "进度条",
  "rich": "终端富文本输出",
  "colorama": "终端颜色",
  "click": "命令行框架",
  "typer": "命令行框架",
  "cryptography": "加密与证书",
  "pyopenssl": "OpenSSL 绑定",
  "certifi": "根证书列表",
  "python-dateutil": "日期时间解析",
  "pytz": "时区数据",
  "six": "Python 2/3 兼容层",
  "typing-extensions": "类型标注扩展",
  "vdf": "Valve VDF（Steam 配置）解析",
  "py7zr": "7z 压缩包读写",
  "rarfile": "rar 压缩包读取",
  "openai": "OpenAI API 客户端",
  "anthropic": "Anthropic API 客户端",
  "tiktoken": "OpenAI 分词",
  "sqlalchemy": "数据库 ORM",
  "pymysql": "MySQL 驱动",
  "psycopg2-binary": "PostgreSQL 驱动",
  "redis": "Redis 客户端",
  "pymongo": "MongoDB 客户端",
  "pyinstaller": "打包成 exe",
  "nuitka": "编译成原生程序",
  "virtualenv": "虚拟环境",
  "pip": "Python 包管理器",
  "setuptools": "打包工具",
  "wheel": "wheel 包格式",
  "pipx": "隔离安装命令行工具",
  "pytest": "测试框架",
  "black": "代码格式化",
  "ruff": "代码检查与格式化",
  "flake8": "代码检查",
  "pylint": "代码检查",
  "mypy": "类型检查",
  "isort": "import 排序",
  "ipython": "交互式 Python shell",
  "jupyter": "Jupyter 笔记本",
  "notebook": "Jupyter 笔记本服务器",
  "nbconvert": "笔记本格式转换",
  "nbformat": "笔记本文件格式",

  // ---- Node ----
  "typescript": "TypeScript 编译",
  "vite": "前端构建与开发服务器",
  "webpack": "前端打包",
  "rollup": "库打包",
  "esbuild": "极速打包/转译",
  "tsup": "TypeScript 库打包",
  "prettier": "代码格式化",
  "eslint": "代码检查",
  "pnpm": "包管理器",
  "npm": "包管理器",
  "yarn": "包管理器",
  "nodemon": "文件变化自动重启",
  "pm2": "Node 进程守护",
  "serve": "静态文件服务器",
  "http-server": "静态文件服务器",
  "ts-node": "直接运行 TypeScript",
  "tsx": "直接运行 TypeScript",
  "express": "Web 框架",
  "next": "React 全栈框架",
  "react": "React 前端库",
  "vue": "Vue 前端框架",
  "electron": "桌面应用外壳",
  "puppeteer": "浏览器自动化",
  "sharp": "图片处理",
  "better-sqlite3": "SQLite 数据库绑定",
  "vercel": "部署命令行",
  "netlify-cli": "部署命令行",
  "wrangler": "Cloudflare 部署命令行",

  // ---- Windows 应用 ----
  "git": "Git 版本控制",
  "git.git": "Git 版本控制",
  "python.python.3.13": "Python 解释器",
  "python.python.3.12": "Python 解释器",
  "python.python.3.11": "Python 解释器",
  "python.python.3": "Python 解释器",
  "openjs.nodejs.lts": "Node.js 运行时",
  "openjs.nodejs": "Node.js 运行时",
  "7zip.7zip": "7-Zip 压缩工具",
  "microsoft.visualstudio code": "VS Code 编辑器",
  "google.chrome": "Chrome 浏览器",
  "mozilla.firefox": "Firefox 浏览器",
  "notepad++": "Notepad++ 文本编辑器",
  "putty": "SSH / Telnet 客户端",
  "winscp": "SFTP/SCP 客户端",
  "docker.dockerdesktop": "Docker 桌面版",
  "wireshark": "网络抓包分析",
  "obs studio": "录屏与推流",
  "steam": "游戏平台",
  "tencent.wechat": "微信",
  "microsoft.powershell": "PowerShell 7",
  "power toys": "Windows 增强工具集",
  "everything": "文件名秒搜",
  "vlc": "视频播放器",
  "bandizip": "压缩软件",
  "ffmpeg": "音视频转码命令行",
  "llvm": "C/C++ 编译工具链",
  "cmake": "构建系统",
  "ripgrep": "文本搜索工具",
  "fd": "文件查找工具",
  "jq": "JSON 命令行处理",
  "curl": "HTTP 命令行客户端",
};

/** 不在字典里的包：按安装器给通用描述。 */
const GENERIC = {
  pip: { text: "Python 包", category: "python" },
  npm: { text: "npm 包", category: "node" },
  pnpm: { text: "pnpm 全局工具", category: "node" },
  yarn: { text: "yarn 全局工具", category: "node" },
  bun: { text: "bun 全局工具", category: "node" },
  cargo: { text: "Rust 命令行工具", category: "rust" },
  uv: { text: "uv 隔离安装的工具", category: "python" },
  gem: { text: "Ruby gem", category: "ruby" },
  dotnet: { text: ".NET 全局工具", category: "dotnet" },
  winget: { text: "Windows 应用程序", category: "windows" },
  msi: { text: "Windows 安装包程序", category: "windows" },
  choco: { text: "Chocolatey 安装的程序", category: "windows" },
  scoop: { text: "Scoop 安装的程序", category: "windows" },
  archive: { text: "解压得到的绿色包", category: "windows" },
  git: { text: "从仓库克隆的源码", category: "source" },
  script: { text: "由安装脚本部署的程序", category: "windows" },
  requirements: { text: "requirements.txt 里的一批依赖", category: "python" },
};

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_.]+/g, "-");
}

function tailOf(value) {
  const parts = String(value || "").split(/[/\\]/);
  return parts[parts.length - 1] || String(value || "");
}

/** 一段话里像"继续""好了？"这种回复不算诉求，不能当"为什么装"。 */
const FILLER_ASK = /^(继续|好了吗|好了|嗯|可以|行|谢谢|ok|go on|continue|yes|no)$/i;

/**
 * 描述一个包的用途。
 * @returns {{ text: string, known: boolean, category: string }}
 */
export function describePackage(installer, packageName, kind) {
  const generic = GENERIC[installer] ?? { text: "已安装的软件", category: "other" };
  if (kind === "requirements") return { ...GENERIC.requirements, known: false };
  if (kind === "script") return { ...GENERIC.script, known: false };
  if (!packageName) return { ...generic, known: false };
  const candidates = [normalize(packageName), normalize(tailOf(packageName))];
  for (const key of candidates) {
    const hit = PURPOSE[key];
    if (hit) return { text: hit, known: true, category: generic.category };
  }
  return { ...generic, known: false };
}

export function isFillerAsk(text) {
  return FILLER_ASK.test(String(text || "").replace(/[。！？!?\s]/g, "").trim());
}

export const PURPOSE_COUNT = Object.keys(PURPOSE).length;
