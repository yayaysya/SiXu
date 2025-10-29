import { App, TFile } from 'obsidian';

const MAX_LEN = 2000; // 统一截断长度，避免日志过大
const DEBUG_DIR = 'sixu_debugger';

function pad(n: number) { return String(n).padStart(2, '0'); }
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function maskSensitive(text: string): string {
  if (!text) return text;
  let t = text;
  // 掩码 Bearer token
  t = t.replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi, 'Authorization: Bearer ****');
  // 掩码可能的 sk- 开头的 key
  t = t.replace(/sk-[A-Za-z0-9]{10,}/g, 'sk-****');
  // 避免记录 data:URL 图像内容
  t = t.replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, '(data-url omitted)');
  return t;
}

function truncate(text: string, maxLen: number = MAX_LEN): string {
  if (!text) return text;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n\n[... truncated, ${text.length - maxLen} more chars]`;
}

export class DebugMarkdownLogger {
  private app: App;
  private buffer: string[] = [];
  private createdAt: string;
  private runTitle: string;

  constructor(app: App, runTitle?: string) {
    this.app = app;
    this.createdAt = timestamp();
    this.runTitle = runTitle || 'Notebook LLM 调试日志';
    this.buffer.push(`# ${this.runTitle}`);
    this.buffer.push(`- 时间: ${new Date().toLocaleString()}`);
    this.buffer.push('');
  }

  appendSection(title: string, content: string | object): void {
    this.buffer.push(`\n## ${title}`);
    if (typeof content === 'string') {
      const masked = maskSensitive(truncate(content));
      this.buffer.push('\n' + masked);
    } else {
      const json = JSON.stringify(content, null, 2);
      const masked = maskSensitive(truncate(json));
      this.buffer.push(`\n\n\`\`\`json\n${masked}\n\`\`\``);
    }
  }

  appendMarkdown(markdown: string): void {
    const masked = maskSensitive(truncate(markdown));
    this.buffer.push('\n' + masked);
  }

  async flush(): Promise<TFile | null> {
    try {
      // 确保目录存在
      const dir = DEBUG_DIR;
      const adapter = this.app.vault.adapter;
      const exists = await adapter.exists(dir);
      if (!exists) {
        await this.app.vault.createFolder(dir);
      }

      let filename = `${dir}/run_${this.createdAt}.md`;
      // 避免重名
      let idx = 1;
      while (await adapter.exists(filename)) {
        filename = `${dir}/run_${this.createdAt}_${idx}.md`;
        idx++;
      }

      const content = this.buffer.join('\n');
      const file = await this.app.vault.create(filename, content);
      return file;
    } catch (e) {
      console.warn('Debug logger flush failed:', e);
      return null;
    }
  }
}
