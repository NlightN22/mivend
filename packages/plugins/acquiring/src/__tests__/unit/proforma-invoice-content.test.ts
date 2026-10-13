import { describe, expect, it } from 'vitest';
import type { OrderLine } from '@vendure/core';

import type { ProformaInvoiceLineSnapshot } from '../../entities/proforma-invoice.entity';
import {
    contentHash,
    decideVersion,
    groupByOrganization,
    snapshotLine,
    type OrganizationContent,
} from '../../proforma-invoice-content';
import { extractVat } from '../../proforma-invoice-tax';

function line(
    id: number,
    organizationId: number | null,
    price: number,
    quantity = 1,
    discounts: { description: string; amountWithTax: number }[] = [],
): OrderLine {
    return {
        id,
        quantity,
        unitPriceWithTax: price,
        linePriceWithTax: price * quantity,
        discounts,
        taxLines: [{ description: 'VAT20', taxRate: 20 }],
        taxCategory: { name: 'VAT20' },
        customFields: { organizationId },
        productVariant: { id, sku: `sku-${id}`, name: `Item ${id}` },
    } as unknown as OrderLine;
}

function content(lines: ProformaInvoiceLineSnapshot[], amount: number): OrganizationContent {
    return { organizationId: 1, amount, lines };
}

const base = groupByOrganization([line(1, 1, 100, 2), line(2, 1, 50)])[0];

describe('groupByOrganization', () => {
    it('groups lines per organization and sums linePriceWithTax', () => {
        const groups = groupByOrganization([line(1, 1, 100, 2), line(2, 2, 50), line(3, 1, 30)]);
        expect(groups.map(g => [g.organizationId, g.amount, g.lines.length])).toEqual([
            [1, 230, 2],
            [2, 50, 1],
        ]);
    });

    it('subtracts line discounts so the amount equals the printed line totals', () => {
        const [group] = groupByOrganization([
            line(1, 1, 100, 2, [{ description: 'promo', amountWithTax: -20 }]),
            line(2, 1, 50),
        ]);
        expect(group.amount).toBe(230);
    });

    it('snapshots variant, quantity, prices and discounts', () => {
        const [group] = groupByOrganization([
            line(1, 1, 100, 2, [{ description: 'promo', amountWithTax: -20 }]),
        ]);
        expect(group.lines[0]).toEqual({
            variantId: 1,
            sku: 'sku-1',
            name: 'Item 1',
            quantity: 2,
            unitPriceWithTax: 100,
            linePriceWithTax: 200,
            discounts: [{ description: 'promo', amount: -20 }],
            taxRate: 20,
            taxCategoryName: 'VAT20',
            taxAmount: 30,
        });
    });

    it('throws when a line has no organizationId', () => {
        expect(() => groupByOrganization([line(1, null, 100)])).toThrow(/has no organizationId/);
    });
});

describe('contentHash', () => {
    it('ignores line order', () => {
        const reversed = [...base.lines].reverse();
        expect(contentHash(1, 'RUB', base.amount, reversed)).toBe(
            contentHash(1, 'RUB', base.amount, base.lines),
        );
    });

    it.each([
        ['quantity', { ...base.lines[0], quantity: 3 }],
        ['price', { ...base.lines[0], unitPriceWithTax: 101 }],
        ['discounts', { ...base.lines[0], discounts: [{ description: 'd', amount: -1 }] }],
    ])('changes when %s changes', (_name, changed) => {
        const lines = [changed, base.lines[1]];
        expect(contentHash(1, 'RUB', base.amount, lines)).not.toBe(
            contentHash(1, 'RUB', base.amount, base.lines),
        );
    });

    it('changes with currency and organization', () => {
        const hash = contentHash(1, 'RUB', base.amount, base.lines);
        expect(contentHash(1, 'USD', base.amount, base.lines)).not.toBe(hash);
        expect(contentHash(2, 'RUB', base.amount, base.lines)).not.toBe(hash);
    });
});

describe('decideVersion', () => {
    const head = (status: 'issued' | 'paid' | 'pending') => ({
        status,
        organizationId: 1,
        currencyCode: 'RUB',
        amount: base.amount,
        lines: base.lines,
    });
    const changed = content([{ ...base.lines[0], quantity: 5 }, base.lines[1]], 600);

    it('creates the first version', () => {
        expect(decideVersion(undefined, base, 'RUB')).toBe('create');
    });

    it('reuses the head for unchanged content, whatever its status', () => {
        expect(decideVersion(head('issued'), base, 'RUB')).toBe('reuse');
        expect(decideVersion(head('paid'), base, 'RUB')).toBe('reuse');
    });

    it('creates a new version for changed content when the head is unpaid', () => {
        expect(decideVersion(head('issued'), changed, 'RUB')).toBe('create');
        expect(decideVersion(head('pending'), changed, 'RUB')).toBe('create');
    });

    it('creates a new document when the head is cancelled, even for the same content', () => {
        expect(decideVersion({ ...head('issued'), status: 'cancelled' }, base, 'RUB')).toBe(
            'create',
        );
    });

    it('never replaces a paid head', () => {
        expect(decideVersion(head('paid'), changed, 'RUB')).toBe('paid-changed');
    });
});

describe('snapshot tax', () => {
    it('extracts VAT from the net amount and ignores tax in the content hash', () => {
        const l = groupByOrganization([
            line(1, 1, 100, 1, [{ description: 'd', amountWithTax: -10 }]),
        ])[0].lines[0];
        expect(l).toMatchObject({ taxRate: 20, taxCategoryName: 'VAT20', taxAmount: 15 });
        const other = { ...l, taxRate: 10, taxAmount: 8 };
        expect(contentHash(1, 'RUB', 90, [l])).toBe(contentHash(1, 'RUB', 90, [other]));
    });

    it('stores a null rate for the unconfirmed placeholder or missing tax lines', () => {
        const placeholder = line(1, 1, 100);
        placeholder.taxLines = [{ description: 'VAT10 (auto, zone)', taxRate: 0 }] as never;
        expect(snapshotLine(placeholder).taxRate).toBeNull();
        const none = line(2, 1, 100);
        none.taxLines = [];
        expect(snapshotLine(none).taxRate).toBeNull();
        const zero = line(3, 1, 100);
        zero.taxLines = [{ description: 'VAT0 (zone)', taxRate: 0 }] as never;
        expect(snapshotLine(zero)).toMatchObject({ taxRate: 0, taxAmount: 0 });
    });
});

describe('extractVat', () => {
    it('rounds the extracted VAT', () => {
        expect(extractVat(10000, 20)).toBe(1667);
        expect(extractVat(10000, 10)).toBe(909);
        expect(extractVat(0, 20)).toBe(0);
    });
});
