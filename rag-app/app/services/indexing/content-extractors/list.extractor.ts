import { ContentExtractor, ExtractedContent, BlockContext } from './base.extractor';

export class ListExtractor extends ContentExtractor {
  constructor() {
    super('list');
  }

  canExtract(block: any): boolean {
    return ['list', 'bullet_list', 'numbered_list', 'ul', 'ol', 'todo_list', 'checklist'].includes(
      block.type?.toLowerCase()
    );
  }

  async extract(block: any, context: BlockContext): Promise<ExtractedContent> {
    let text = '';
    const listType = this.getListType(block.type);
    
    if (Array.isArray(block.content)) {
      text = block.content
        .map((item, index) => this.formatListItem(item, index, listType))
        .join('\n');
    } else if (block.content?.items) {
      text = block.content.items
        .map((item: any, index: number) => this.formatListItem(item, index, listType))
        .join('\n');
    } else {
      text = this.extractText(block.content);
    }
    
    return {
      text,
      metadata: {
        blockId: block.id,
        blockType: 'list',
        listType,
        pageId: context.pageId,
        position: block.position
      },
      priority: this.calculatePriority(block, context),
      chunkSize: 500
    };
  }

  private getListType(type: string): 'bullet' | 'numbered' | 'todo' {
    if (type?.includes('number') || type === 'ol') return 'numbered';
    if (type?.includes('todo') || type?.includes('check')) return 'todo';
    return 'bullet';
  }

  private formatListItem(item: any, index: number, listType: 'bullet' | 'numbered' | 'todo'): string {
    const text = this.extractText(item);
    
    switch (listType) {
      case 'numbered':
        return `${index + 1}. ${text}`;
      case 'todo':
        const checked = item.checked || item.completed || false;
        return `- [${checked ? 'x' : ' '}] ${text}`;
      default:
        return `- ${text}`;
    }
  }
}