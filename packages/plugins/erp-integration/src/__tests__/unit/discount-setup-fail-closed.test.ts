import { create, toJson } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { DiscountSetupChangedSchema } from '@nlightn22/event-contracts';
import { describe, expect, it } from 'vitest';

import { parseDiscountSetup } from '../../handlers/discount-setup-payload';

const time = timestampFromDate(new Date('2026-01-01T00:00:00Z'));

function payload(
    overrides: Parameters<typeof create<typeof DiscountSetupChangedSchema>>[1] = {},
): Record<string, unknown> {
    return toJson(
        DiscountSetupChangedSchema,
        create(DiscountSetupChangedSchema, {
            entityId: 'doc-1',
            version: '7',
            effectiveFrom: time,
            isActive: true,
            percent: 5,
            productMode: 'list',
            productIds: ['p1'],
            recipients: [{ counterpartyId: 'cp-1' }],
            ...overrides,
        }),
    ) as Record<string, unknown>;
}

function reasonOf(overrides: Parameters<typeof payload>[0]): string | null | undefined {
    const parsed = parseDiscountSetup('doc-1', payload(overrides));
    return parsed.kind === 'upsert' ? parsed.input.setup.inactiveReason : undefined;
}

describe('parseDiscountSetup fails closed on attributes it does not evaluate', () => {
    it('keeps a plain percent document active', () => {
        expect(reasonOf({})).toBeNull();
    });

    it.each([
        ['markupTypeId', { markupTypeId: 'mt-1' }, 'markup-type'],
        ['currencyId', { currencyId: 'cur-1' }, 'currency'],
        ['commonTimeFrom', { commonTimeFrom: time }, 'time-window'],
        ['commonTimeTo', { commonTimeTo: time }, 'time-window'],
        ['pseudo', { pseudo: true }, 'pseudo-document'],
        ['priceGroups', { priceGroups: [{ priceGroupId: 'g1', percent: 3 }] }, 'price-groups'],
        ['bonusLines', { bonusLines: [{ productId: 'b1', quantity: 1 }] }, 'bonus-lines'],
        ['setComponents', { setComponents: [{ productId: 's1', quantity: 1 }] }, 'set-components'],
        ['weekdayWindows', { weekdayWindows: [{ weekday: 'mon' }] }, 'weekday-windows'],
        [
            'line characteristic',
            { productLines: [{ productId: 'p1', characteristicId: 'c' }] },
            'product-line-attributes',
        ],
        [
            'line percent',
            { productLines: [{ productId: 'p1', percent: 9 }] },
            'product-line-attributes',
        ],
        [
            'line price number',
            { productLines: [{ productId: 'p1', priceNumber: 2 }] },
            'product-line-attributes',
        ],
    ])('stores a document with %s inactive', (_name, overrides, reason) => {
        expect(reasonOf(overrides)).toBe(reason);
    });

    it('ignores purpose on the header', () => {
        expect(reasonOf({ purposeId: 'pu-1' })).toBeNull();
    });

    it('ignores quality on the header and on lines', () => {
        expect(reasonOf({ qualityId: 'q-1' })).toBeNull();
        expect(reasonOf({ productLines: [{ productId: 'p1', qualityId: 'q-1' }] })).toBeNull();
    });

    it('never turns a positive percent with a markup type into a discount', () => {
        const parsed = parseDiscountSetup('doc-1', payload({ percent: 10, markupTypeId: 'mt-1' }));
        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: { setup: { active: false, inactiveReason: 'markup-type' } },
        });
    });

    it('keeps a negative percent without a markup type as a markup', () => {
        const parsed = parseDiscountSetup('doc-1', payload({ percent: -4 }));
        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: { setup: { active: true, percent: -4 } },
        });
    });

    it('keeps plain product lines (ids only) active', () => {
        expect(reasonOf({ productLines: [{ productId: 'p1' }] })).toBeNull();
    });

    it('applies a by-product document with the no-condition kind', () => {
        const parsed = parseDiscountSetup(
            'doc-1',
            payload({ operationKind: 'ПоНоменклатуре', condition: 'БезУсловий' }),
        );
        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: { setup: { active: true, conditionName: 'БезУсловий' } },
        });
    });

    it('ends a price-groups document inactive by its form', () => {
        expect(
            reasonOf({
                operationKind: 'ПоЦеновымГруппам',
                percent: 0,
                priceGroups: [{ priceGroupId: 'g1', percent: 4 }],
            }),
        ).toBe('no-header-percent');
        expect(
            reasonOf({
                operationKind: 'ПоЦеновымГруппам',
                priceGroups: [{ priceGroupId: 'g1', percent: 4 }],
            }),
        ).toBe('price-groups');
    });

    it('ends a natural-discounts document inactive by its bonus lines or set components', () => {
        const bonus = { operationKind: 'НатуральныеСкидки', percent: 0 };
        expect(reasonOf({ ...bonus, bonusLines: [{ productId: 'b1', quantity: 1 }] })).toBe(
            'no-header-percent',
        );
        expect(
            reasonOf({
                operationKind: 'НатуральныеСкидки',
                bonusLines: [{ productId: 'b1', quantity: 1 }],
            }),
        ).toBe('bonus-lines');
        expect(
            reasonOf({
                operationKind: 'НатуральныеСкидки',
                setComponents: [{ productId: 's1', quantity: 1 }],
            }),
        ).toBe('set-components');
    });

    it('stores a document with no recipients inactive instead of silently never matching', () => {
        expect(reasonOf({ recipients: [] })).toBe('no-recipients');
    });

    it('hands the operation kind to the service for the allow-list check', () => {
        const parsed = parseDiscountSetup('doc-1', payload({ operationKind: 'ПоНоменклатуре' }));
        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: { operationKind: 'ПоНоменклатуре' },
        });
    });
});
