import { describe, expect, it } from 'vitest';
import { buildCsv, csvRaw } from '../../api/csv';
import { exportCsv, exportFileName } from '../../components/analytics/analyticsExport';

const BOM = String.fromCharCode(0xfeff);

describe('buildCsv', () => {
    it('starts with a BOM, separates with semicolons and ends lines with CRLF', () => {
        expect(buildCsv(['a', 'b'], [['x', 1]])).toBe(`${BOM}a;b\r\nx;1\r\n`);
    });

    it('quotes separators, quotes and line breaks', () => {
        const csv = buildCsv(['h'], [['a;b'], ['say "hi"'], ['one\ntwo']]);
        expect(csv).toContain('\r\n"a;b"\r\n"say ""hi"""\r\n"one\ntwo"\r\n');
    });

    it('defuses formula starts in text but keeps raw decimals untouched', () => {
        const csv = buildCsv(['h'], [['=SUM(A1)'], ['+1'], ['-1'], ['@x'], [csvRaw('-5.00')]]);
        expect(csv).toContain("\r\n'=SUM(A1)\r\n'+1\r\n'-1\r\n'@x\r\n-5.00\r\n");
    });

    it('writes only the header for an empty result', () => {
        expect(buildCsv(['a'], [])).toBe(`${BOM}a\r\n`);
    });

    it('handles a large result', () => {
        const rows = Array.from({ length: 20000 }, (_, i) => [`row ${i}`, i]);
        const lines = buildCsv(['n', 'i'], rows).split('\r\n');
        expect(lines).toHaveLength(20002);
        expect(lines[20000]).toBe('row 19999;19999');
    });
});

describe('exportCsv', () => {
    const columns = [
        { field: 'title', header: 'Name' },
        { field: 'period', header: 'Period' },
        { field: 'currency', header: 'Currency' },
        { field: 'turnover', header: 'With VAT' },
        { field: 'orderCount', header: 'Orders' },
    ];

    it('exports exact decimals with a dot, ISO periods, alphabetic currency and numeric counts', () => {
        const csv = exportCsv(
            columns,
            [
                {
                    title: 'Customer One',
                    period: '2026-03-01T00:00:00.000Z',
                    currency: 'RUB',
                    turnover: '1234.56',
                    orderCount: 3,
                },
            ],
            new Set(['turnover']),
        );
        expect(csv).toBe(
            `${BOM}Name;Period;Currency;With VAT;Orders\r\nCustomer One;2026-03-01T00:00:00.000Z;RUB;1234.56;3\r\n`,
        );
    });

    it('leaves empty amounts and missing periods empty and appends notes as a trailing row', () => {
        const csv = exportCsv(
            columns,
            [{ title: 'Total', period: null, currency: 'RUB', turnover: '', orderCount: 0 }],
            new Set(['turnover']),
            ['Preliminary data'],
        );
        expect(csv.split('\r\n').slice(1, 3)).toEqual(['Total;;RUB;;0', 'Preliminary data;;;;']);
    });
});

describe('exportFileName', () => {
    it('names the file by report and period', () => {
        expect(exportFileName('orders-analytics', '2026-03-01', '2026-03-31')).toBe(
            'orders-analytics-2026-03-01_2026-03-31.csv',
        );
    });
});
