# 项目上下文

## 1. 项目概览
- **项目名称**：思序 (Notebook LLM) - Obsidian 智能学习生态系统插件
- **核心目标**：基于智谱 AI 的 Markdown 笔记智能整理插件，提供闪卡学习系统、Quiz 生成评分、学习数据分析等完整的学习生态功能
- **技术栈**：TypeScript、Obsidian Plugin API、esbuild、智谱AI API、SM-2间隔重复算法

## 2. 核心架构
- **架构模式**：模块化插件架构，基于 Obsidian WorkspaceLeaf 系统
- **关键模块**：
  - **闪卡系统**：基于 SM-2 算法的间隔重复学习
  - **组合笔记**：多文件智能合并与整理
  - **Quiz 系统**：AI 自动出题与评分
  - **学习路径**：结构化学习流程管理
  - **任务队列**：异步处理与进度管理
- **数据流向**：用户输入 → 内容解析 → AI 处理 → 结果生成 → 用户界面展示

## 3. 已实现功能
- **智能笔记整理**：基于多种模板的 AI 笔记重组，支持文本、图片、链接多模态处理
- **闪卡学习系统**：完整的 SM-2 间隔重复算法实现，支持桌面端和移动端
- **Quiz 学习系统**：4 种题型自动生成，AI 智能评分
- **组合笔记管理**：拖拽式文件管理，智能搜索筛选
- **学习数据看板**：进度追踪、活跃度可视化
- **学习路径功能**：结构化学习流程创建和管理

## 4. 代码结构
```
notebook_llm_ob_cc/
├── src/                    # 源代码
│   ├── main.ts            # 插件入口和核心功能
│   ├── settings.ts        # 设置面板和配置管理
│   ├── types/             # TypeScript 类型定义
│   ├── views/             # 用户界面组件
│   │   └── combineView.ts # 主要的 UI 界面
│   ├── flashcard/         # 闪卡系统完整实现
│   │   ├── FlashcardDeckView.ts
│   │   ├── SM2Algorithm.ts
│   │   └── FlashcardGenerator.ts
│   ├── learningPath/      # 学习路径系统
│   ├── processors/        # 核心处理器
│   │   ├── text.ts        # 文本生成和整理
│   │   ├── image.ts       # 图片处理和识别
│   │   ├── quizGenerator.ts # Quiz 生成器
│   │   └── grading.ts     # Quiz 评分系统
│   ├── api/               # AI 服务接口
│   │   ├── factory.ts     # Provider 工厂
│   │   └── zhipu.ts       # 智谱 AI 接口
│   ├── utils/             # 工具函数
│   └── prompts/           # 提示词模板
├── doc/                   # 文档
├── styles.css             # 样式文件
├── manifest.json          # 插件清单
└── package.json           # 项目配置
```

- **关键文件**：
  - `src/main.ts`：插件主入口，注册命令和视图
  - `src/flashcard/SM2Algorithm.ts`：SM-2 间隔重复算法核心实现
  - `src/views/combineView.ts`：主要用户界面
  - `src/settings.ts`：插件设置管理
  - `esbuild.config.mjs`：构建配置

## 5. 构建与运行
- **安装依赖**：`npm install`
- **开发模式**：`npm run dev` (自动编译监听)
- **构建**：`npm run build` (TypeScript 检查 + esbuild 打包)
- **打包发布**：`npm run build:zip`
- **环境配置**：无需特殊环境变量，配置通过插件设置界面管理

## 6. 关键决策记录
- **选择 TypeScript**：提供类型安全和更好的开发体验
- **使用 esbuild**：快速构建和热重载，提升开发效率
- **模块化架构**：便于功能扩展和维护
- **SM-2 算法**：经典间隔重复算法，科学记忆曲线
- **多 AI 模型支持**：灵活配置，支持智谱、OpenAI、DeepSeek、Gemini

## 7. 注意事项
- **移动端适配**：闪卡系统已完成移动端触摸优化
- **并发处理**：任务队列系统支持并发 AI 请求，避免阻塞 UI
- **错误处理**：完善的错误处理和用户反馈机制
- **配置管理**：通过 Obsidian 设置界面管理所有配置
- **文件命名**：使用 `{name}_{type}_{date}.md` 格式避免冲突

## 8. 下一步计划
- **性能优化**：优化大文件处理和批量操作性能
- **更多 AI 模型**：集成更多 AI 服务提供商
- **高级模板**：支持更复杂的自定义模板系统
- **数据导出**：学习数据的多格式导出功能
- **协作功能**：多人协作学习支持（待调研）