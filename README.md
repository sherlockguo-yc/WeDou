# 豆格 · 拼豆图纸工坊

把一张图片变成能照着拼的拼豆图纸：带色号图例、行列坐标、每色号用量、29×29 分板打印，以及边拼边看的网页引导。

图片全程只在浏览器里处理，不会上传；账号云端只保存网格工程数据和拼装进度，不保存原图。

## 在线访问

**https://sherlockguo-yc.github.io/WeDou/**

公开静态版包含完整的图片转图纸、手工编辑、A4 分板 PDF / 高清 PNG 导出、拼装引导与本地草稿。GitHub Pages 没有 Node 后端，因此账号云同步不可用，页面会显示「本地模式」；换设备可用「工程文件」导出再导入。

需要完整账号同步时，请按下方方式本地运行 Express，或把服务部署到能跑 Node 的环境。

## 快速开始

```bash
npm install
npm run dev        # 前端 http://localhost:5173
npm run server     # 后端 http://localhost:3001（另一个终端）
```

开发模式下 Vite 把 `/api` 代理到 3001。生产运行：

```bash
npm run build
npm start          # Express 同时托管 dist/ 与 /api
```

常用命令：

| 命令 | 作用 |
|---|---|
| `npm test` | 核心算法单元测试（Vitest，25 项） |
| `npm run build` | TypeScript 检查 + Vite 构建 |
| `npm run fetch:palettes` | 重新抓取色卡数据，写入 `src/data/palettes.json` |

## 功能

- 上传 / 拖拽 / 粘贴图片；可选浏览器内 AI 去背景（ONNX + ISNet，模型按需下载，失败自动降级手动擦除）
- 5 套真实色板：MARD 221 / MARD 291 / Perler 117 / Hama 89 / Artkal 176；Lab + CIEDE2000 最近色匹配
- 限色、去孤立豆、小区域合并、可选抖动；透明区自动留空
- 点格改色、拖拽刷色、橡皮、吸管、区域换色思路下的撤销重做
- 导出按 29×29 分板的 A4 PDF、高清 PNG、工程 JSON
- 网页拼装引导：逐行高亮、点格标记完成、进度持久化
- 跨品牌单色替代建议（按色差自算）
- 本地草稿 + 账号云同步；不登录也能完整使用转换与导出

## 色卡数据

`src/data/palettes.json` 由 `scripts/fetch-palettes.mjs` 从公开的 bitbead.app 色卡页批量提取（5 个请求，894 色），含色号、名称、HEX、来源 URL 与抓取日期。脚本会校验每个色板的色数与页面声明一致。

**HEX 是公开参考值，不是厂商分光实测值**，批次染色会有偏差。图纸以色号 + 格内符号为准，不要按屏幕或打印颜色配豆。

## 结构

```
src/core/        网格数据模型、色差、量化、优化、分板、统计、AI 分割
src/render/      Canvas 网格、PNG、A4 分页 PDF
src/components/  通用控件、图纸画布、用量表、替代建议
src/views/      工作台、拼装引导、图纸库、登录
src/api/        后端 API 客户端
server/         Express 账号认证与工程数据持久化（JSON 文件）
scripts/        色卡抓取
tests/          核心算法测试
docs/           需求文档（冻结）、功能规格（活文档）、实现计划
```

技术栈：TypeScript + React 18 + Vite 6、lucide-react、jsPDF（动态加载）、Express 4、Node `crypto`（scrypt + HMAC-SHA256 JWT）、Vitest。

## 约束与边界

- GitHub Pages 静态版由 `.github/workflows/deploy.yml` 自动构建部署（`VITE_STATIC_MODE=1`、`--base /WeDou/`）；完整 Node 服务（`npm start`）需自行部署，不在本次范围。
- 不含第三方登录、付费与社区图纸库。
- 账号数据落在 `server/data/`（已 gitignore），仅适用于本地/单机运行。
- AI 去背景首次使用需从 CDN 下载约 40MB 模型；无网络或设备不支持时会提示并回退到手动擦除，不影响主链路。
- 网格上限 200×200，原图超过 4000px 或 20MB 会先降采样。
- jsPDF 内置字体不含中文，因此 PDF 内文字一律英文/数字/符号；文件名与界面仍是中文。
