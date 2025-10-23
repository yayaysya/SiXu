# Notebook LLM - AI 笔记整理插件

基于智谱 AI GLM-4-Flash 和 GLM-4V-Flash 的图文混排笔记自动化整理方案,可将原始 Markdown 笔记快速转换为规整的文章。

## ✨ 功能特点

- 🔍 **自动解析** - 智能识别 Markdown 中的文本、图片和链接
- 👁️ **视觉理解** - 使用 GLM-4V-Flash 识别图片内容(支持本地和网络图片)
- 🌐 **链接抓取** - 自动抓取和总结网页内容
- 🤖 **AI 重组** - 利用 GLM-4-Flash 的大上下文智能重组文章
- 📝 **格式优化** - 自动插入图片和引用,输出规范的 Markdown 格式
- 🎯 **提示词管理** - 内置 5 套提示词模板,支持自定义
- ⚙️ **并行处理** - 可调节并发数,高效处理多个图片和链接
- 🔔 **后台处理** - 异步处理不阻塞编辑器,完成后自动通知
- 💾 **智能保存** - 在源文件同级目录生成新文件,不覆盖原文

## 🚀 快速开始

### 安装

#### 方式一: 手动安装

1. 下载最新的 Release 版本
2. 将文件解压到 Obsidian 插件目录: `<vault>/.obsidian/plugins/notebook-llm/`
3. 在 Obsidian 设置中启用插件

#### 方式二: 开发版安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/obsidian-notebook-llm.git
cd obsidian-notebook-llm

# 安装依赖
npm install

# 构建
npm run build

# 将构建产物复制到你的 vault
cp main.js manifest.json <vault>/.obsidian/plugins/notebook-llm/
```

### 配置

1. 在 Obsidian 设置中找到 "Notebook LLM"
2. 输入你的智谱 AI API Key (在 [智谱AI开放平台](https://open.bigmodel.cn/) 获取)
3. 点击"验证"按钮确认 API Key 有效
4. 根据需要调整其他设置

## 📖 使用方法

### 基本使用

1. 打开要整理的 Markdown 笔记
2. 使用以下任一方式触发整理:
   - 命令面板 (Ctrl/Cmd + P) → "整理当前笔记"
   - 右键点击文件 → "AI 整理笔记"
3. 插件会在后台处理,状态栏显示进度
4. 处理完成后会收到通知,新文件保存在源文件同级目录

### 输出文件

- 默认文件名格式: `原文件名_AI整理.md`
- 如果文件已存在,会提示是否覆盖或自动生成新文件名
- 可在设置中自定义文件名模板

## 🔧 配置说明

### API 设置

- **API Key**: 必填,从智谱AI平台获取
- **API Base URL**: 可选,默认为官方地址,支持自定义代理

### 处理设置

- **并发处理数**: 控制同时处理图片和链接的数量
  - 建议值: 5-10
  - 过高可能触发 API 限流
  - 过低影响处理速度

### 提示词模板

内置 5 套模板:

1. **通用整理** - 适合大多数笔记,优化结构和表达
2. **公众号风格** - 适合公众号发布,注重可读性和吸引力
3. **技术文档** - 适合技术笔记,保持专业性和准确性
4. **学术论文** - 适合学术笔记,注重逻辑性和严谨性
5. **提炼总结** - 提炼核心要点,适合快速回顾

你也可以创建自定义模板:

- 点击"添加自定义模板"
- 填写模板名称、描述、系统提示词和用户提示词
- 使用变量: `{content}`, `{images_section}`, `{links_section}`

### 输出设置

- **输出文件名模板**: 使用 `{name}` 代表原文件名
  - 示例: `{name}_AI整理` → `笔记_AI整理.md`
  - 示例: `{name}_整理版` → `笔记_整理版.md`

## 💡 使用技巧

### 图片支持

- ✅ 本地图片 (Obsidian 格式): `![[image.png]]` 或 `![](image.png)`
- ✅ 网络图片: `![](https://example.com/image.jpg)`
- ✅ 支持的格式: PNG, JPG, GIF, WebP, BMP
- ⚠️ 确保图片可访问,本地图片会自动转换为 base64

### 链接处理

- ✅ 标准链接: `[文本](https://example.com)`
- ✅ 纯 URL: `https://example.com`
- ⚠️ 部分网站有反爬虫,抓取可能失败
- 💡 抓取失败的链接会保留在文章末尾的"参考链接"部分

### 笔记组织建议

- 保持基本的 Markdown 结构(标题、段落)
- 原始文本可以简略,AI 会自动优化表达
- 图片和链接会被智能整合到文章中
- 可以使用 YAML front matter 添加元数据

### 性能优化

- 调整并发数:在设置中根据网络状况调整
- 大文件处理:插件会自动在后台处理,不阻塞编辑器
- API 限流:如果遇到限流,降低并发数并稍后重试

## 🛠️ 开发

### 环境要求

- Node.js 18+
- npm 或 yarn

### 开发流程

```bash
# 安装依赖
npm install

# 开发模式(自动重新编译)
npm run dev

# 构建生产版本
npm run build

# 版本发布
npm version patch  # 或 minor, major
```

### 项目结构

```
src/
├── main.ts              # 插件入口
├── settings.ts          # 设置面板
├── types.ts             # TypeScript 类型定义
├── taskQueue.ts         # 后台任务队列
├── parsers/
│   └── markdown.ts      # Markdown 解析器
├── processors/
│   ├── image.ts         # 图片处理
│   ├── link.ts          # 链接处理
│   └── text.ts          # 文本整合
├── api/
│   └── zhipu.ts         # 智谱 AI API 封装
└── prompts/
    └── templates.ts     # 提示词模板
```

## 📝 工作原理

### 1. Markdown 解析

- 提取文本、图片、链接
- 支持标准 Markdown 和 Obsidian Wiki 链接
- 本地图片转换为 base64 (用于 API 调用)

### 2. 并行处理

**图片识别:**
- GLM-4V-Flash 直接读取图片 URL
- 生成简洁的图片描述

**链接抓取:**
- HTTP 请求抓取网页内容
- GLM-4-Flash 总结核心内容
- 失败的链接保留到参考部分

### 3. 内容整合

- 将原始文本、图片描述、链接摘要组合
- 使用选定的提示词模板
- GLM-4-Flash 一次性生成完整文章
- 自动插入图片和链接引用

### 4. 后台处理

- 异步执行,不阻塞编辑器
- 状态栏显示实时进度
- 完成后系统通知
- 自动打开生成的新文件

## 🔍 网页抓取策略

- 使用简单的 HTTP 请求抓取
- 自动提取 HTML 文本内容
- 部分网站可能有反爬虫保护
- 抓取失败的链接会保留原文引用

## ❓ 常见问题

### API Key 验证失败?

- 检查 API Key 是否正确复制(无多余空格)
- 确认账户余额充足
- 检查网络连接是否正常

### 图片识别失败?

- 确认图片格式支持(PNG, JPG 等)
- 检查图片路径是否正确
- 网络图片需确保可访问
- 本地图片需在 Obsidian vault 中

### 链接抓取失败?

- 某些网站有反爬虫机制
- 失败的链接会保留在文末
- 可以手动复制内容到笔记中

### 处理速度慢?

- 调整并发处理数(建议 5-10)
- 图片和链接较多时需要更多时间
- API 调用受网络影响

### 输出文件在哪里?

- 默认在源文件同级目录
- 文件名格式: `原文件名_AI整理.md`
- 可在设置中自定义

## 🔗 相关链接

- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [GLM-4-Flash 文档](https://bigmodel.cn/dev/api/normal-model/glm-4)
- [GLM-4V-Flash 文档](https://bigmodel.cn/dev/api/multimodal-model/glm-4v)
- [Obsidian 插件开发文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## 📄 许可证

MIT License

## 🙏 致谢

- [Obsidian](https://obsidian.md/) - 强大的知识管理工具
- [智谱 AI](https://www.zhipuai.cn/) - 提供优秀的 AI 模型
- 所有贡献者和使用者

## 💬 反馈与支持

如果你遇到问题或有建议,请:

- 提交 [Issue](https://github.com/yourusername/obsidian-notebook-llm/issues)
- 发起 [Pull Request](https://github.com/yourusername/obsidian-notebook-llm/pulls)
- 在 [Discussions](https://github.com/yourusername/obsidian-notebook-llm/discussions) 中讨论

---

**Enjoy organizing your notes with AI! 📝✨**
