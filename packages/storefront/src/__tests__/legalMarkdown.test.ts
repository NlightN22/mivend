import { describe, expect, it } from 'vitest';
import { parseLegalMarkdown } from '../pages/legal/legalMarkdown';

describe('parseLegalMarkdown', () => {
    it('parses headings, paragraphs, lists, bold and rules', () => {
        const blocks = parseLegalMarkdown(
            [
                '# Title',
                '',
                '**Version:** 1  ',
                'second line',
                '',
                '## Part',
                '- one',
                '- two',
                '---',
            ].join('\n'),
        );
        expect(blocks.map(b => b.type)).toEqual(['h1', 'p', 'h2', 'ul', 'hr']);
        expect(blocks[1]).toEqual({
            type: 'p',
            parts: [
                { text: 'Version:', bold: true },
                { text: ' 1\nsecond line', bold: false },
            ],
        });
        expect(blocks[3]).toMatchObject({ type: 'ul' });
        expect((blocks[3] as { items: unknown[] }).items).toHaveLength(2);
    });

    it('keeps markup-like text as plain text, never as HTML', () => {
        const [block] = parseLegalMarkdown('<script>alert(1)</script>');
        expect(block).toEqual({
            type: 'p',
            parts: [{ text: '<script>alert(1)</script>', bold: false }],
        });
    });
});
