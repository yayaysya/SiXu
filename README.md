# 思序 (Notebook LLM) - AI 驱动的智能学习生态系统

[![NPM Version](https://img.shields.io/npm/v/obsidian-notebook-llm.svg)](https://www.npmjs.com/package/obsidian-notebook-llm)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blueviolet)](https://obsidian.md/)

一个功能强大的 Obsidian 插件，集成多种 AI 模型，提供**智能笔记整理**、**闪卡学习系统**、**Quiz 生成评分**、**学习数据分析**等完整的学习生态功能。

## ✨ 核心亮点

🎯 **SM-2 间隔重复算法** - 科学记忆，高效学习
🧠 **AI 智能闪卡** - 自动生成，智能复习
📱 **移动端优化** - 随时随地，指尖学习
📊 **学习数据可视化** - 进度追踪，成就系统

---

## 🚀 功能架构

### 🎴 闪卡学习系统 ⭐ **新功能**
基于经典的 SM-2 算法实现的间隔重复学习系统

#### 核心特性
- **🔄 SM-2 算法实现** - 经典间隔重复，科学记忆曲线
- **📊 智能卡片管理** - 新学、学习中、复习中、已掌握四种状态
- **📱 移动端完美适配** - 触摸反转、手势操作、响应式设计
- **🤖 AI 自动生成** - 基于笔记内容智能创建闪卡
- **📈 学习数据追踪** - 复习历史、正确率、学习进度可视化

#### 卡片状态管理
```
新卡片 → 学习中 → 复习中 → 已掌握
   ↑         ↓        ↓        ↓
   └───── 复习循环 ──────────────┘
```

#### 使用场景
- 📚 **教材知识点** - 自动提取关键概念制成闪卡
- 🗣️ **语言学习** - 词汇、句型、语法点记忆
- 💡 **概念理解** - 专业术语、定义、公式记忆
- 🎯 **考试复习** - 高效的知识点巩固和复习

### 🧠 智能笔记整理
- **多模态处理**：同时理解文本、图片、链接内容
- **AI 重组**：基于多种模板智能重写和优化笔记
- **格式保持**：自动维护 Markdown 格式和 YAML 元数据
- **批量处理**：支持多个文件的后台并发处理

### 📚 组合笔记管理
- **拖拽添加**：直观的文件管理界面，支持拖拽排序
- **智能搜索**：全文搜索、文件夹筛选、日期范围、标签过滤
- **内容预览**：实时预览笔记内容的前50字符
- **一键整理**：将多个笔记合并为结构化的知识体系

### 🎯 Quiz 学习系统
- **智能出题**：基于文档内容自动生成 4 种题型
  - 单选题、多选题、填空题、简答题
- **难度分级**：简单、中等、困难三个难度等级
- **考试界面**：专业的答题界面，支持题目导航和进度跟踪
- **AI 评分**：客观题即时评分，主观题 AI 智能评分
- **结果分析**：详细的答题报告和知识点解析

### 📊 学习数据看板
- **统计卡片**：组合笔记数量、Quiz 总数、闪卡复习情况等关键指标
- **活动追踪**：最近学习活动的时间线展示
- **日历热力图**：可视化 90 天的学习活跃度
- **进度监控**：实时显示学习进度和成就

### 🤖 多 AI 模型支持
- **文本模型**：智谱 GLM、OpenAI、DeepSeek、Google Gemini
- **视觉模型**：GLM-4V、GPT-4V 等图片理解模型
- **灵活配置**：支持自定义 API 地址和模型参数

### 🎨 丰富的模板系统
- **内置模板**：通用整理、公众号风格、技术文档、学术论文、提炼总结、**闪卡制作**
- **自定义模板**：支持创建和编辑个人专属模板
- **智能变量**：支持 `{content}`、`{images_section}`、`{links_section}` 等动态变量

---

## 🚀 快速开始

### 安装方式

#### 方式一：直接安装（推荐）
1. 下载最新的 Release 版本 ZIP 文件
2. 在 Obsidian 中进入 `设置 → 第三方插件 → 打开插件目录`
3. 将 ZIP 文件解压到插件目录
4. 在 Obsidian 设置中启用"思序"插件

#### 方式二：开发者安装
```bash
# 克隆仓库
git clone https://github.com/yourusername/notebook-llm.git
cd notebook-llm

# 安装依赖
npm install

# 构建插件
npm run build:zip

# 将生成的 ZIP 文件按方式一安装
```

### 初始配置

1. **获取 API Key**
   - 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
   - 注册并获取 API Key

2. **插件配置**
   - 在 Obsidian 设置中找到"思序"
   - 输入 API Key 并点击验证
   - 选择合适的文本和视觉模型
   - 调整并发处理数量（建议 5-10）

---

## 📖 使用指南

### 🎴 闪卡学习流程

#### 1. 创建闪卡组
```
方式一：AI 自动生成
1. 选择一篇或多篇笔记
2. 右键选择"生成闪卡"
3. 设置卡片数量和类型
4. AI 自动提取知识点创建闪卡

方式二：手动创建
1. 在组合笔记界面点击"闪卡"标签
2. 点击"新建卡片组"
3. 手动输入问题和答案
```

#### 2. 学习闪卡
```
桌面端操作：
- 点击卡片查看答案
- 使用按钮选择难度 (1-4)
- 空格键快速切换正反面

移动端操作：
- 点击卡片反转查看答案
- 滑动选择难度等级
- 支持手势操作和触摸优化
```

#### 3. 复习管理
```
智能复习调度：
- 新卡片：每天限制学习数量
- 学习中：根据记忆强度安排复习
- 复习中：间隔逐渐延长
- 已掌握：定期巩固复习
```

### 🧠 智能整理单篇笔记

1. 打开要整理的 Markdown 笔记
2. 使用以下任一方式触发整理：
   - **命令面板**：`Ctrl/Cmd + P` → "整理当前笔记"
   - **右键菜单**：右键点击文件 → "AI 整理笔记"
   - **快捷键**：点击左侧功能区的"思序"图标
3. 选择合适的模板和参数
4. 等待后台处理完成，新文件将自动保存并打开

### 📚 组合多篇笔记

1. **打开组合笔记界面**
   - 点击左侧功能区图标或使用命令"打开组合笔记侧边栏"

2. **添加笔记到待整理列表**
   - **拖拽方式**：直接从文件列表拖拽文件到界面
   - **右键菜单**：右键文件选择"添加到待整理列表"
   - **选择文本**：选中正文内容，右键选择"添加笔记到待整理列表"

3. **搜索和筛选**
   - 使用搜索框按关键词筛选
   - 使用筛选器按文件夹、日期、标签过滤
   - 支持实时搜索，带防抖优化

4. **开始整理**
   - 调整笔记顺序（拖拽排序）
   - 点击"开始整理"按钮
   - 选择输出模板和设置
   - 等待处理完成

### 🎯 Quiz 学习流程

1. **生成 Quiz**
   - 在组合笔记界面或文件右键菜单选择"生成 Quiz"
   - 设置题目数量（5-30 题）
   - 选择难度等级和题型组合
   - 等待 AI 生成题目

2. **参加考试**
   - 打开生成的 Quiz 文件
   - 点击"开始考试"进入答题界面
   - 逐题作答，支持前后导航
   - 提交后等待 AI 评分

3. **查看结果**
   - 系统自动生成详细的结果报告
   - 包含每道题的正确答案和解析
   - 统计总分和等级评价

### 📊 查看学习数据

1. **打开数据看板**
   - 在组合笔记界面点击"思序"标签页

2. **查看统计数据**
   - 学习进度统计卡片（包含闪卡复习统计）
   - 最近活动时间线
   - 学习活跃度日历图
   - 闪卡掌握情况分析

---

## 🎯 使用场景

### 学生学习 🎓
- **📝 课堂笔记整理**：将零散的课堂笔记整理成结构化的学习资料
- **🎴 知识点闪卡**：自动提取重点概念制作成复习闪卡
- **📝 知识点测验**：基于学习内容自动生成练习题
- **📊 学习进度跟踪**：通过数据看板监控学习进展
- **🔁 科学复习**：SM-2 算法安排最佳复习时间

### 知识工作者 💼
- **📋 会议纪要整理**：将会议记录整理成规范的文档
- **📚 资料研究**：整合多篇参考资料形成完整的知识体系
- **✍️ 内容创作**：基于收集的素材快速生成文章草稿
- **🎴 概念记忆**：专业术语和行业知识的高效记忆

### 语言学习者 🗣️
- **📚 词汇闪卡**：单词、短语、句型的间隔重复记忆
- **📝 语法练习**：AI 生成语法练习题和测验
- **🗣️ 口语素材**：整理对话材料制作学习闪卡
- **📊 进度追踪**：语言学习进度可视化分析

### 内容创作者 🎨
- **💡 素材收集**：将分散的灵感和素材整合成创作内容
- **📱 多平台发布**：根据不同平台风格调整内容格式
- **🧠 知识沉淀**：将零散的想法整理成系统的知识库
- **🎴 创意闪卡**：创意点和灵感的概念化记忆

---

## 🔧 高级配置

### AI 服务配置

```typescript
// 支持的 AI 服务商
const providers = {
  // 智谱 AI
  zhipu: {
    apiKey: "your_zhipu_api_key",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
    models: ["glm-4-flash", "glm-4"]
  },
  // OpenAI
  openai: {
    apiKey: "your_openai_api_key",
    baseUrl: "https://api.openai.com/v1/",
    models: ["gpt-4o-mini", "gpt-4o"]
  },
  // DeepSeek
  deepseek: {
    apiKey: "your_deepseek_api_key",
    baseUrl: "https://api.deepseek.com/v1/",
    models: ["deepseek-chat"]
  },
  // Google Gemini
  gemini: {
    apiKey: "your_gemini_api_key",
    baseUrl: "https://generativelanguage.googleapis.com/v1/",
    models: ["gemini-pro", "gemini-pro-vision"]
  }
};
```

### 闪卡系统配置

```typescript
// SM-2 算法参数配置
const sm2Config = {
  // 复习间隔参数
  easinessFactor: 2.5,        // 难度因子基数
  minimumInterval: 1,         // 最小间隔天数
  maximumInterval: 180,       // 最大间隔天数

  // 每日限制
  newCardsPerDay: 20,         // 每日新卡片数量
  reviewCardsPerDay: 100,     // 每日复习卡片数量

  // 难度评分映射
  qualityScores: {
    again: 1,     // 完全忘记
    hard: 2,      // 困难回忆
    good: 3,      // 良好回忆
    easy: 4       // 轻松回忆
  }
};
```

### 自定义提示词模板

在设置中创建自定义模板：

```markdown
# 闪卡生成模板
你是一个专业的闪卡制作专家，擅长从学习材料中提取关键知识点制作成高效的复习闪卡。

## 源内容
{content}

## 图片内容
{images_section}

## 参考链接
{links_section}

要求：
1. 提取最重要的概念、定义、公式、要点
2. 每张闪卡包含一个问题和对应答案
3. 问题要简洁明确，答案要准确完整
4. 优先制作基础概念和核心知识点的闪卡
5. 输出格式：问题在前，答案在后，用分隔线隔开

输出格式：
Q: [问题]
A: [答案]
---
Q: [问题]
A: [答案]
```

### 输出文件命名

使用变量自定义文件名：
- `{name}` - 原文件名
- `{date}` - 当前日期
- `{time}` - 当前时间
- `{type}` - 文件类型 (整理/闪卡/Quiz)

示例：
- `{name}_AI整理.md` → `笔记_AI整理.md`
- `{name}_闪卡_{date}.md` → `笔记_闪卡_2025-10-30.md`
- `{name}_Quiz_{type}.md` → `笔记_Quiz_复习.md`

---

## 🛠️ 开发指南

### 环境要求
- Node.js 18+
- npm 或 yarn
- Obsidian 桌面版

### 开发流程
```bash
# 安装依赖
npm install

# 开发模式（自动编译）
npm run dev

# 构建生产版本
npm run build

# 打包发布版本
npm run build:zip
```

### 项目结构
```
src/
├── main.ts                 # 插件入口和核心功能
├── settings.ts             # 设置面板和配置管理
├── types/                  # TypeScript 类型定义
│   ├── index.ts
│   ├── activity.ts
│   └── flashcard.ts        # 闪卡相关类型定义
├── views/                  # 用户界面组件
│   ├── combineView.ts      # 主要的 UI 界面
│   ├── flashcardView.ts    # 闪卡学习界面 ⭐
│   └── quizView.ts         # Quiz 答题界面
├── processors/             # 核心处理器
│   ├── image.ts            # 图片处理和识别
│   ├── link.ts             # 链接抓取和处理
│   ├── text.ts             # 文本生成和整理
│   ├── quizGenerator.ts    # Quiz 生成器
│   ├── grading.ts          # Quiz 评分系统
│   └── flashcardProcessor.ts # 闪卡处理器 ⭐
├── parsers/                # 内容解析器
│   ├── markdown.ts         # Markdown 解析
│   └── flashcardParser.ts  # 闪卡内容解析 ⭐
├── api/                    # AI 服务接口
│   ├── factory.ts          # Provider 工厂
│   ├── zhipu.ts            # 智谱 AI 接口
│   ├── openai.ts           # OpenAI 接口
│   ├── deepseek.ts         # DeepSeek 接口
│   └── gemini.ts           # Google Gemini 接口 ⭐
├── utils/                  # 工具函数
│   ├── statistics.ts       # 数据统计
│   ├── format.ts           # 格式化工具
│   └── sm2.ts             # SM-2 算法实现 ⭐
├── prompts/                # 提示词模板
│   ├── templates.ts        # 内置模板定义
│   └── flashcardPrompts.ts # 闪卡生成提示词 ⭐
└── taskQueue.ts            # 任务队列管理
```

### 核心架构

#### 闪卡系统架构 ⭐
```typescript
class FlashcardSystem {
  // SM-2 算法核心
  sm2: SM2Algorithm;

  // 卡片管理
  cardManager: CardManager;

  // 学习调度
  scheduler: ReviewScheduler;

  // UI 组件
  view: FlashcardView;
}
```

#### 处理器模式
插件采用模块化的处理器架构：
- **TextProcessor**：文本理解和生成
- **ImageProcessor**：图片识别和描述
- **LinkProcessor**：链接抓取和摘要
- **QuizGenerator**：智能题目生成
- **GradingSystem**：AI 辅助评分
- **FlashcardProcessor**：闪卡智能生成 ⭐

#### 任务队列系统
- 异步任务处理，不阻塞 UI
- 实时进度反馈
- 错误处理和重试机制
- 任务状态持久化

#### UI 组件化
- 基于 Obsidian 的 WorkspaceLeaf 系统
- 响应式设计，完美适配移动端和桌面端
- 丰富的交互反馈和动画效果
- 触摸手势支持（移动端闪卡操作）

---

## 🔍 工作原理

### 1. 闪卡学习流程 ⭐
```mermaid
graph TD
    A[笔记内容] --> B[AI 知识点提取]
    B --> C[生成闪卡]
    C --> D[SM-2 算法调度]
    D --> E[学习复习]
    E --> F[进度跟踪]
    F --> G[数据可视化]

    E --> H[选择难度 1-4]
    H --> I[更新记忆强度]
    I --> D
```

### 2. SM-2 算法核心 ⭐
```mermaid
graph TD
    A[复习卡片] --> B{用户评分}
    B -->|1: 忘记| C[重置为新手]
    B -->|2: 困难| D[间隔×1.2]
    B -->|3: 良好| E[间隔×2.5]
    B -->|4: 简单| F[间隔×4.0]

    C --> G[明天复习]
    D --> H[短期间隔]
    E --> I[中期间隔]
    F --> J[长期间隔]
```

### 3. 内容解析流程
```mermaid
graph TD
    A[Markdown 文件] --> B[解析器]
    B --> C[文本内容]
    B --> D[图片列表]
    B --> E[链接列表]
    B --> F[元数据]

    C --> G[闪卡提取]
    D --> H[图片描述]
    E --> I[链接摘要]

    G --> J[AI 生成闪卡]
    H --> J
    I --> J
```

### 4. 多平台适配 ⭐
```mermaid
graph TD
    A[用户设备] --> B{设备类型}
    B -->|桌面端| C[鼠标点击操作]
    B -->|移动端| D[触摸手势操作]

    C --> E[点击反转卡片]
    D --> F[滑动选择难度]

    E --> G[键盘快捷键支持]
    F --> H[响应式界面适配]
```

---

## ❓ 常见问题

### 闪卡系统 ⭐

**Q: SM-2 算法是什么？**
SM-2 (SuperMemo 2) 是经典的间隔重复算法，通过科学的复习间隔安排，最大化记忆效率。算法会根据你的记忆表现动态调整下次复习时间。

**Q: 每天应该学习多少张新卡片？**
建议初学者每天 10-20 张新卡片，随着经验增加可适当调整。关键是保持持续学习，避免一次性学习过多。

**Q: 移动端如何操作闪卡？**
- 点击卡片查看答案
- 滑动或点击难度按钮选择记忆强度
- 支持左右滑动手势进行难度选择
- 长按可以显示更多选项

**Q: 忘记了卡片怎么办？**
选择"忘记"(难度1)会让卡片重新回到新手状态，明天会重新开始学习，这是正常的记忆过程。

### API 相关

**Q: API Key 验证失败？**
- 检查 API Key 是否正确复制（无多余空格）
- 确认账户余额充足
- 检查网络连接和代理设置

**Q: 处理速度较慢？**
- 调整并发处理数量（建议 5-10）
- 图片和链接较多时需要更多时间
- 考虑使用更快的 AI 模型

### 功能使用

**Q: 图片无法识别？**
- 确认图片格式支持（PNG、JPG、GIF、WebP）
- 检查图片路径是否正确
- 网络图片需确保可访问

**Q: Quiz 生成质量不佳？**
- 尝试增加源文档的内容长度
- 调整难度等级设置
- 选择合适的题型组合

**Q: 组合笔记文件在哪里？**
- 默认在源文件同级目录
- 文件名格式：`组合笔记_日期.md`
- 可在设置中自定义输出路径

---

## 🤝 贡献指南

我们欢迎所有形式的贡献：

### 报告问题
- 使用 [Issues](https://github.com/yourusername/notebook-llm/issues) 报告 bug
- 提供详细的复现步骤和环境信息
- 包含相关的错误日志和截图

### 功能建议
- 在 [Discussions](https://github.com/yourusername/notebook-llm/discussions) 中讨论新功能
- 描述使用场景和预期效果
- 考虑功能的通用性和实现复杂度

### 代码贡献
1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

### 开发规范
- 遵循 TypeScript 严格模式
- 添加适当的注释和文档
- 确保代码风格一致
- 编写单元测试（如适用）
- 新功能需要考虑移动端适配

---

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

---

## 🙏 致谢

- [Obsidian](https://obsidian.md/) - 强大的知识管理工具
- [智谱 AI](https://www.zhipuai.cn/) - 提供优秀的 AI 模型服务
- [OpenAI](https://openai.com/) - GPT 系列模型支持
- [DeepSeek](https://www.deepseek.com/) - 高性能的开源模型
- [Google Gemini](https://ai.google.dev/) - 多模态 AI 能力支持
- SuperMemo 团队 - SM-2 间隔重复算法的创始者
- 所有贡献者和使用者的一路支持

---

## 🔗 相关链接

- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [OpenAI API 文档](https://platform.openai.com/docs)
- [DeepSeek API](https://platform.deepseek.com/)
- [Google AI Studio](https://aistudio.google.com/)
- [Obsidian 插件开发文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [项目主页](https://github.com/yourusername/notebook-llm)
- [更新日志](CHANGELOG.md)
- [SM-2 算法详解](https://www.supermemo.com/en/algorithms/sm-2)

---

## 🌟 更新亮点

### v1.0.0 - 闪卡学习系统 🎴
- ✨ **全新闪卡系统** - 基于 SM-2 算法的间隔重复学习
- 📱 **移动端完美适配** - 触摸优化，手势操作
- 🤖 **AI 智能生成** - 自动从笔记提取知识点制作闪卡
- 📊 **学习数据可视化** - 进度追踪，成就系统
- 🎯 **学习效率提升** - 科学记忆，事半功倍

### 让 AI 成为你学习的伙伴，让知识记忆变得科学而高效！🚀✨

**立即开始你的智能学习之旅吧！** 🎓📚