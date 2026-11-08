import { describe, expect, it } from 'vitest';
import type { OrderLineShortfallRow } from '../../api/orderLineEdit';
import { lineNotes, orderNotes, type PanelNotes } from '../../utils/orderPanelNotes';

const shortfall = (sku: string | null): OrderLineShortfallRow =>
    ({
        id: '1',
        sku,
        requestedQuantity: 10,
        keptQuantity: 6,
        shortfallQuantity: 4,
        limitedBy: 'warehouse',
        createdAt: '2026-01-01T10:00:00Z',
    }) as OrderLineShortfallRow;

const failure = {
    reason: 'INSUFFICIENT_STOCK',
    detail: 'SKU-A need 9, available 0; other problem',
    failedAt: null,
};

describe('panel notes per cell', () => {
    it('puts the failure segment of a line into its Reserve notes with the reason and the hint', () => {
        const notes = lineNotes({ failure, shortfalls: [] }, 'SKU-A').reserve.map(n => n.text);
        expect(notes[0]).toBe('Reservation failed: Not enough stock');
        expect(notes).toContain('SKU-A need 9, available 0');
        expect(notes.at(-1)).toContain('confirm the order');
        expect(lineNotes({ failure, shortfalls: [] }, 'SKU-B').reserve).toEqual([]);
    });

    it('puts a cut into the Available notes of its line and keeps unmatched ones for the total', () => {
        const src: PanelNotes = {
            failure: null,
            shortfalls: [shortfall('SKU-A'), shortfall('GONE')],
        };
        expect(lineNotes(src, 'SKU-A').available[0].text).toContain('4 cut');
        const rest = orderNotes(src, ['SKU-A']).map(n => n.text);
        expect(rest).toHaveLength(1);
        expect(rest[0]).toContain('GONE');
    });

    it('keeps a failure that names no line on the order total', () => {
        const src: PanelNotes = { failure: { ...failure, detail: 'no sku here' }, shortfalls: [] };
        expect(orderNotes(src, ['SKU-A']).map(n => n.text)).toContain('no sku here');
    });
});
