interface MarkdownSummaryProps {
  content: string;
  compact?: boolean;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={`${part}-${index}`} className="font-semibold text-[#1C1C1E]">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${part}-${index}`} className="px-[4px] py-[1px] rounded bg-[#ECECF3] text-[#1C1C1E] font-mono text-[0.95em]">{part.slice(1, -1)}</code>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function getHeadingClass(level: number, compact: boolean): string {
  if (level <= 1) return compact ? 'text-[18px] font-bold text-[#1C1C1E]' : 'text-[22px] font-bold text-[#1C1C1E]';
  if (level === 2) return compact ? 'text-[16px] font-bold text-[#1C1C1E]' : 'text-[19px] font-bold text-[#1C1C1E]';
  return compact ? 'text-[15px] font-bold text-[#1C1C1E]' : 'text-[17px] font-bold text-[#1C1C1E]';
}

export function MarkdownSummary({ content, compact = false }: MarkdownSummaryProps) {
  const lines = content
    .split(/\r?\n/);

  if (lines.every(line => line.trim() === '')) return null;

  const blocks: Array<{ type: 'heading'; level: number; text: string } | { type: 'paragraph'; text: string } | { type: 'list'; items: string[] }> = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push({ type: 'list', items: listBuffer });
    listBuffer = [];
  };

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraphBuffer.join(' ') });
    paragraphBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      listBuffer.push(line.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushList();
  flushParagraph();

  return (
    <div className={compact ? 'space-y-[8px]' : 'space-y-[12px]'}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h3 key={`heading-${index}`} className={getHeadingClass(block.level, compact)}>
              {renderInlineMarkdown(block.text)}
            </h3>
          )
        }

        if (block.type === 'list') {
          return (
            <div key={`list-${index}`} className={compact ? 'space-y-[8px]' : 'space-y-[10px]'}>
              {block.items.map((item, itemIndex) => (
                <div key={`item-${itemIndex}`} className="flex items-start gap-[10px]">
                  <span className="mt-[9px] w-[5px] h-[5px] rounded-full bg-[#007AFF] shrink-0" />
                  <p className={compact ? 'text-[14px] leading-relaxed text-[#3A3A3C]' : 'text-[16px] leading-relaxed text-[#3A3A3C]'}>
                    {renderInlineMarkdown(item)}
                  </p>
                </div>
              ))}
            </div>
          )
        }

        return (
          <p key={`paragraph-${index}`} className={compact ? 'text-[14px] leading-relaxed text-[#3A3A3C]' : 'text-[16px] leading-relaxed text-[#3A3A3C]'}>
            {renderInlineMarkdown(block.text)}
          </p>
        )
      })}
    </div>
  );
}
