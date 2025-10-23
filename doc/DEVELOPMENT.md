# 开发指南

## 📁 文件结构说明

### 开发时（完整项目）
```
notebook_llm_ob_cc/
├── src/                    # TypeScript 源代码
│   ├── main.ts            # 插件入口
│   ├── settings.ts        # 设置面板
│   ├── types.ts           # 类型定义
│   └── ...
├── node_modules/          # npm 依赖
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── esbuild.config.mjs     # 构建配置
├── manifest.json          # 插件清单
├── styles.css             # 样式文件
└── README.md              # 文档
```

### 发布时（仅需 3 个文件）
```
release/                   # 或直接复制到 Obsidian 插件目录
├── main.js               # ⭐ 所有 TS 代码打包后的产物
├── manifest.json         # ⭐ 插件信息
└── styles.css            # ⭐ 样式（可选）
```

## 🔨 开发流程

### 1. 初次设置
```bash
# 安装依赖
npm install
```

### 2. 开发模式
```bash
# 启动开发模式（自动监听文件变化并重新编译）
npm run dev
```

在开发模式下：
- 修改 `src/` 下的任何 `.ts` 文件
- esbuild 自动重新编译生成 `main.js`
- 在 Obsidian 中按 `Ctrl+R` 重新加载插件查看效果

### 3. 生产构建
```bash
# 构建生产版本
npm run build
```

这会：
1. 运行 TypeScript 类型检查
2. 使用 esbuild 编译并打包所有代码
3. 生成优化后的 `main.js`（无 sourcemap）

### 4. 打包发布
```bash
# 构建并打包到 release/ 目录
npm run release
```

这会创建 `release/` 目录，包含：
- `main.js`
- `manifest.json`
- `styles.css`

## 🧪 测试插件

### 方法一：手动复制
```bash
# 构建
npm run build

# 复制到 Obsidian vault
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/notebook-llm/
```

### 方法二：创建符号链接
```bash
# 构建一次
npm run build

# 创建符号链接到开发目录
ln -s /home/song/src/project/notebook_llm_ob_cc /path/to/vault/.obsidian/plugins/notebook-llm
```

然后在开发模式下：
```bash
npm run dev  # 自动监听并重新编译
```

在 Obsidian 中按 `Ctrl+R` 即可重新加载插件。

### 方法三：使用 Obsidian Hot Reload 插件
1. 安装 [Hot Reload](https://github.com/pjeby/hot-reload) 插件
2. 符号链接你的开发目录
3. 运行 `npm run dev`
4. 保存文件后插件自动重新加载

## 📦 发布到 Obsidian 插件市场

### 1. 准备仓库
```bash
# 初始化 git（如果还没有）
git init
git add .
git commit -m "Initial commit"

# 推送到 GitHub
git remote add origin https://github.com/yourusername/obsidian-notebook-llm.git
git push -u origin main
```

### 2. 创建 Release
```bash
# 确保 manifest.json 和 versions.json 中的版本号一致
npm version patch  # 或 minor, major

# 构建
npm run build

# 创建 GitHub Release
# 1. 到 GitHub 仓库页面
# 2. Releases → Create a new release
# 3. 上传 main.js, manifest.json, styles.css
```

### 3. 提交到官方市场
1. Fork [obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. 添加你的插件到 `community-plugins.json`
3. 提交 Pull Request

详细步骤见：https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin

## 🔍 为什么使用 TypeScript？

虽然最终只生成一个 `main.js`，但 TypeScript 开发有很多好处：

1. **类型安全** - 编译时发现错误
2. **代码提示** - 更好的 IDE 支持
3. **代码组织** - 可以分模块开发
4. **重构友好** - 修改接口自动提示所有引用位置
5. **文档化** - 类型即文档

## 📊 构建过程详解

```
源代码                      中间产物               最终产物
─────────                   ──────────              ────────

src/main.ts       ─┐
src/settings.ts   ─┤
src/types.ts      ─┤
src/api/zhipu.ts  ─┤──> TypeScript ──> JavaScript ──> main.js
src/parsers/...   ─┤     编译器          代码        (打包压缩)
src/processors/.. ─┤
src/prompts/...   ─┘

manifest.json ──────────────────────────────────> manifest.json
                                                   (直接复制)

styles.css ─────────────────────────────────────> styles.css
                                                   (直接复制)
```

## 🛠️ 常用命令

```bash
# 开发
npm run dev          # 开发模式（监听变化）
npm run build        # 生产构建
npm run release      # 打包到 release/

# 版本管理
npm version patch    # 升级补丁版本 (1.0.0 -> 1.0.1)
npm version minor    # 升级次版本 (1.0.0 -> 1.1.0)
npm version major    # 升级主版本 (1.0.0 -> 2.0.0)

# 清理
rm -rf node_modules  # 删除依赖
rm main.js           # 删除构建产物
npm install          # 重新安装依赖
```

## 🐛 调试技巧

### 1. 使用 Console
```typescript
console.log('调试信息', data);
```
在 Obsidian 中按 `Ctrl+Shift+I` 打开开发者工具查看。

### 2. 使用 Source Map
开发模式下会生成 source map，可以在开发者工具中直接调试 TypeScript 源代码。

### 3. 使用 Notice
```typescript
new Notice('提示信息');
```

### 4. 查看插件状态
Obsidian 设置 → 第三方插件 → 已安装插件 → 查看插件信息

## 📚 相关资源

- [Obsidian 插件开发文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian API 文档](https://docs.obsidian.md/Reference/TypeScript+API)
- [示例插件](https://github.com/obsidianmd/obsidian-sample-plugin)
- [esbuild 文档](https://esbuild.github.io/)
