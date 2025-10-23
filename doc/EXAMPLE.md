# 使用示例

这是一个演示文档,展示如何使用 Notebook LLM 插件整理笔记。

## 示例输入

假设你有这样一份原始笔记:

```markdown
# 学习 React Hooks

今天学习了 React Hooks,主要看了官方文档和一些教程。

![React Logo](https://reactjs.org/logo.png)

useState 是最常用的 Hook,用于在函数组件中添加状态。

详细文档: [React Hooks 介绍](https://reactjs.org/docs/hooks-intro.html)

useEffect 用于处理副作用,比如数据获取、订阅等。

![Code Example](./images/hooks-example.png)

参考教程: https://www.example.com/react-hooks-tutorial
```

## 处理流程

1. **解析阶段**
   - 提取文本内容
   - 识别 2 张图片
   - 找到 2 个链接

2. **图片处理**
   - React Logo → AI 识别: "React JavaScript 库的官方标志"
   - Code Example → AI 识别: "展示 useState 和 useEffect 使用示例的代码片段"

3. **链接处理**
   - React Hooks 介绍 → 抓取并总结核心内容
   - 教程链接 → 抓取网页并生成摘要

4. **文章生成**
   - 使用选定的提示词模板(如"通用整理")
   - 整合原文、图片描述、链接摘要
   - AI 重组生成优化后的文章

## 示例输出

处理后会生成 `学习 React Hooks_AI整理.md`:

```markdown
# React Hooks 学习笔记

React Hooks 是 React 16.8 引入的新特性,它允许在不编写 class 的情况下使用 state 和其他 React 特性。

![React Logo](https://reactjs.org/logo.png)
*React JavaScript 库的官方标志*

## useState - 状态管理

useState 是最基础也是最常用的 Hook。它让函数组件也能拥有自己的状态。通过 useState,我们可以在组件中声明状态变量,并获得更新该状态的函数。

## useEffect - 副作用处理

useEffect Hook 用于处理组件中的副作用操作,包括但不限于:
- 数据获取
- 订阅管理
- DOM 操作
- 定时器设置

![Code Example](./images/hooks-example.png)
*展示 useState 和 useEffect 使用示例的代码片段*

根据 [React 官方文档](https://reactjs.org/docs/hooks-intro.html) 的介绍,Hooks 的设计理念是让函数组件也能享受到之前只有 class 组件才有的能力,同时避免了 class 组件中 this 指向等常见问题。

## 参考资料

想要深入学习 React Hooks,推荐阅读这篇[详细教程](https://www.example.com/react-hooks-tutorial),其中包含了丰富的实践案例和最佳实践。

---
*本文由 Notebook LLM 插件自动整理生成*
```

## 不同模板效果对比

### 通用整理
- 结构优化,语言流畅
- 保持原文信息完整
- 适合大多数场景

### 公众号风格
- 开头更吸引人
- 使用小标题分段
- 语言生动活泼
- 可能添加互动元素

### 技术文档
- 保持技术术语准确
- 结构清晰规范
- 代码和细节完整
- 专业性强

### 学术论文
- 语言正式严谨
- 逻辑论证充分
- 引用格式规范
- 客观中立

### 提炼总结
- 提取核心要点
- 使用列表组织
- 简洁明了
- 长度约原文 30-50%

## 最佳实践

1. **原始笔记准备**
   - 保持基本的 Markdown 结构
   - 图片和链接使用标准格式
   - 可以简略,AI 会补充完善

2. **模板选择**
   - 根据用途选择合适的模板
   - 可以自定义专属模板
   - 尝试不同模板找到最适合的

3. **后处理**
   - 检查生成的文章
   - 必要时手动调整
   - 可以再次整理优化

4. **性能优化**
   - 图片较多时调高并发数
   - 网络不好时降低并发数
   - 大文件在后台慢慢处理
