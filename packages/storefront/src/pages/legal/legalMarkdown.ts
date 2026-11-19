export type InlinePart = { text: string; bold: boolean };

export type TextBlock = { type: 'h1' | 'h2' | 'p'; parts: InlinePart[] };

export type LegalBlock = TextBlock | { type: 'ul'; items: InlinePart[][] } | { type: 'hr' };

export function parseInline(text: string): InlinePart[] {
    return text
        .split(/(\*\*[^*]+\*\*)/)
        .filter(Boolean)
        .map(chunk =>
            chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4
                ? { text: chunk.slice(2, -2), bold: true }
                : { text: chunk, bold: false },
        );
}

// The documents use only headings, paragraphs, bullet lists, bold and rules; anything else stays plain text.
export function parseLegalMarkdown(source: string): LegalBlock[] {
    const blocks: LegalBlock[] = [];
    let paragraph = '';
    const flush = (): void => {
        if (paragraph) {
            blocks.push({ type: 'p', parts: parseInline(paragraph) });
            paragraph = '';
        }
    };
    for (const raw of source.split('\n')) {
        const line = raw.trim();
        const last = blocks.at(-1);
        if (line === '') flush();
        else if (line === '---') {
            flush();
            blocks.push({ type: 'hr' });
        } else if (line.startsWith('## ') || line.startsWith('# ')) {
            flush();
            const type = line.startsWith('## ') ? 'h2' : 'h1';
            blocks.push({ type, parts: parseInline(line.replace(/^#+\s+/, '')) });
        } else if (line.startsWith('- ')) {
            flush();
            const item = parseInline(line.slice(2));
            if (last?.type === 'ul') last.items.push(item);
            else blocks.push({ type: 'ul', items: [item] });
        } else {
            // Two trailing spaces are a hard line break; the page renders "\n" with pre-line.
            paragraph += (paragraph ? (paragraph.endsWith('\n') ? '' : ' ') : '') + line;
            if (raw.endsWith('  ')) paragraph += '\n';
        }
    }
    flush();
    return blocks.map(b => (b.type === 'p' ? trimBreaks(b) : b));
}

function trimBreaks(block: TextBlock): LegalBlock {
    const parts = block.parts.map(p => ({ ...p }));
    const last = parts.at(-1);
    if (last) last.text = last.text.replace(/\n$/, '');
    return { ...block, parts };
}
