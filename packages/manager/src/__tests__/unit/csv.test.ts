import { describe, expect, it, vi } from 'vitest';
import { downloadCsv } from '../../utils/csv';

async function render(rows: unknown[][]): Promise<string> {
    let blob: Blob | undefined;
    vi.stubGlobal('URL', {
        createObjectURL: (b: Blob) => ((blob = b), 'blob:x'),
        revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', { createElement: () => ({ click: vi.fn() }) });
    downloadCsv('f.csv', ['a'], rows);
    return (blob as Blob).text();
}

describe('downloadCsv', () => {
    it('prefixes text cells that a spreadsheet would run as a formula', async () => {
        const out = await render([['=1+1'], ['@SUM(A1)'], ['+7 900'], ['-x'], ['plain']]);
        expect(out.split('\n').slice(1)).toEqual(["'=1+1", "'@SUM(A1)", "'+7 900", "'-x", 'plain']);
    });

    it('leaves numbers and quotes untouched', async () => {
        const out = await render([[-5], ['say "hi"']]);
        expect(out.split('\n').slice(1)).toEqual(['-5', '"say ""hi"""']);
    });
});
