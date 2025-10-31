/**
 * DocumentSplitter - 智能文档拆分工具
 * 支持按语义拆分文档，保持上下文连贯性
 */

export interface SplitChunk {
  id: string;
  content: string;
  title?: string;
  index: number;
  length: number;
}

export interface DocumentMetadata {
  title?: string;
  sections: Array<{
    title: string;
    level: number; // 1-6 for H1-H6
    position: number;
  }>;
}

/**
 * 智能拆分文档，支持多种拆分策略
 */
export class DocumentSplitter {
  private static readonly MIN_CHUNK_SIZE = 200;
  private static readonly MAX_CHUNK_SIZE = 500;
  private static readonly MIN_TITLE_SIZE = 50;

  /**
   * 智能拆分文档
   * @param content 文档内容
   * @param maxLength 最大长度限制（默认500字符）
   * @returns 拆分后的块数组
   */
  static smartSplit(content: string, maxLength: number = 500): SplitChunk[] {
    if (!content || content.length === 0) {
      return [];
    }

    // 如果文档长度小于阈值，直接返回
    if (content.length <= maxLength) {
      return [{
        id: this.generateId(),
        content: content.trim(),
        index: 0,
        length: content.length
      }];
    }

    // 第一步：尝试按标题层级拆分
    let chunks = this.splitByHeaders(content);

    // 如果拆分后块数量合理，进行优化合并
    if (chunks.length > 1) {
      chunks = this.mergeSmallChunks(chunks, maxLength);
    }

    // 如果仍然有超长块，进一步拆分
    chunks = chunks.flatMap(chunk => {
      if (chunk.content.length <= maxLength) {
        return [chunk];
      }
      return this.splitLongChunk(chunk, maxLength);
    });

    // 重新分配索引
    return chunks.map((chunk, index) => ({
      ...chunk,
      index,
      id: this.generateId()
    }));
  }

  /**
   * 按标题层级拆分（优先级最高）
   */
  private static splitByHeaders(content: string): SplitChunk[] {
    // 检测标题模式 (# ## ### 等)
    const headerPattern = /(^|\n)(#{1,6})\s+(.+?)(\n|$)/g;
    const headers: Array<{ match: RegExpExecArray; level: number; title: string }> = [];

    let match;
    while ((match = headerPattern.exec(content)) !== null) {
      headers.push({
        match,
        level: match[2].length,
        title: match[3].trim()
      });
    }

    // 如果没有找到标题，按段落拆分
    if (headers.length === 0) {
      return this.splitByParagraphs(content);
    }

    const chunks: SplitChunk[] = [];

    for (let i = 0; i < headers.length; i++) {
      const currentHeader = headers[i];
      const nextHeader = headers[i + 1];

      const startPos = currentHeader.match.index + currentHeader.match[0].length;
      const endPos = nextHeader ? nextHeader.match.index : content.length;

      const sectionContent = content.slice(startPos, endPos).trim();

      if (sectionContent.length >= this.MIN_TITLE_SIZE) {
        chunks.push({
          id: this.generateId(),
          content: `${currentHeader.match[0].trim()}\n\n${sectionContent}`,
          title: currentHeader.title,
          index: chunks.length,
          length: sectionContent.length
        });
      }
    }

    return chunks;
  }

  /**
   * 按段落拆分（次优选择）
   */
  private static splitByParagraphs(content: string): SplitChunk[] {
    // 按两个或以上换行符分割段落
    const paragraphs = content.split(/\n\s*\n+/);
    const chunks: SplitChunk[] = [];

    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (!trimmedPara) continue;

      // 如果加上这个段落不会超过阈值，直接添加
      const newLength = currentChunk.length + trimmedPara.length + 2;
      if (newLength <= this.MAX_CHUNK_SIZE && currentChunk) {
        currentChunk += '\n\n' + trimmedPara;
      } else {
        // 保存当前块
        if (currentChunk) {
          chunks.push({
            id: this.generateId(),
            content: currentChunk,
            index: chunks.length,
            length: currentChunk.length
          });
        }

        // 开始新块
        if (trimmedPara.length > this.MAX_CHUNK_SIZE) {
          // 段落本身太长，稍后会进一步拆分
          currentChunk = trimmedPara;
        } else {
          currentChunk = trimmedPara;
        }
      }
    }

    // 添加最后一个块
    if (currentChunk) {
      chunks.push({
        id: this.generateId(),
        content: currentChunk,
        index: chunks.length,
        length: currentChunk.length
      });
    }

    return chunks;
  }

  /**
   * 合并小片段，避免碎片化
   */
  private static mergeSmallChunks(chunks: SplitChunk[], maxLength: number): SplitChunk[] {
    if (chunks.length <= 1) return chunks;

    const merged: SplitChunk[] = [];
    let current = { ...chunks[0] };

    for (let i = 1; i < chunks.length; i++) {
      const next = chunks[i];
      const canMerge = current.content.length + next.content.length + 2 <= maxLength;

      if (canMerge && current.length < this.MIN_CHUNK_SIZE) {
        current.content += '\n\n' + next.content;
        current.length = current.content.length;
        current.index = merged.length;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * 拆分过长的块
   */
  private static splitLongChunk(chunk: SplitChunk, maxLength: number): SplitChunk[] {
    // 尝试按句子拆分
    const sentences = chunk.content.split(/(?<=[。！？.?!])\s+/);
    const result: SplitChunk[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      const newLength = currentChunk.length + trimmed.length;

      if (newLength > maxLength && currentChunk) {
        result.push({
          id: this.generateId(),
          content: currentChunk.trim(),
          title: chunk.title,
          index: result.length,
          length: currentChunk.length
        });
        currentChunk = trimmed;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmed;
      }
    }

    if (currentChunk) {
      result.push({
        id: this.generateId(),
        content: currentChunk.trim(),
        title: chunk.title,
        index: result.length,
        length: currentChunk.length
      });
    }

    return result;
  }

  /**
   * 提取文档元数据
   */
  static extractMetadata(content: string): DocumentMetadata {
    const metadata: DocumentMetadata = {
      sections: []
    };

    // 提取文档标题（第一个#标题）
    const firstHeader = content.match(/^#{1,6}\s+(.+?)$/m);
    if (firstHeader) {
      metadata.title = firstHeader[1].trim();
    }

    // 提取所有章节
    const headerPattern = /^#{1,6}\s+(.+?)$/gm;
    let match;
    let position = 0;

    while ((match = headerPattern.exec(content)) !== null) {
      metadata.sections.push({
        title: match[1].trim(),
        level: match[0].indexOf('#'),
        position
      });
      position++;
    }

    return metadata;
  }

  /**
   * 生成唯一ID
   */
  private static generateId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 计算文档的统计信息
   */
  static getStats(chunks: SplitChunk[]): {
    totalChunks: number;
    totalLength: number;
    averageLength: number;
    minLength: number;
    maxLength: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalLength: 0,
        averageLength: 0,
        minLength: 0,
        maxLength: 0
      };
    }

    const lengths = chunks.map(c => c.length);
    const totalLength = lengths.reduce((a, b) => a + b, 0);

    return {
      totalChunks: chunks.length,
      totalLength,
      averageLength: Math.round(totalLength / chunks.length),
      minLength: Math.min(...lengths),
      maxLength: Math.max(...lengths)
    };
  }
}
