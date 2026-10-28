import { create, toJson } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
    DiscountSetupChangedSchema,
    SelectionConditionSchema,
    SourceFieldValueSchema,
    RetroBonusSetupChangedSchema,
} from '@nlightn22/event-contracts';
import { describe, expect, it } from 'vitest';

import { parseDiscountSetup } from '../../handlers/discount-setup-payload';
import { parseRetroBonusSetup } from '../../handlers/retro-bonus-setup-payload';
import { NonRetryableInboundError } from '../../non-retryable-inbound-error';

// Payloads come from real protobuf messages through toJson, as the Kafka consumer builds them, so a
// renamed contract field breaks these tests instead of silently reading as an absent default.
const from = timestampFromDate(new Date('2026-01-01T00:00:00Z'));

function discountPayload(
    overrides: Parameters<typeof create<typeof DiscountSetupChangedSchema>>[1] = {},
): Record<string, unknown> {
    return toJson(
        DiscountSetupChangedSchema,
        create(DiscountSetupChangedSchema, {
            entityId: 'doc-1',
            version: '7',
            documentNumber: '000123',
            operationKind: 'by-nomenclature',
            effectiveFrom: from,
            isActive: true,
            condition: 'quantity-kind',
            conditionNumber: 10,
            percent: 5,
            productMode: 'list',
            productIds: ['p1', 'p2'],
            recipients: [{ counterpartyId: 'cp-1' }],
            ...overrides,
        }),
    ) as Record<string, unknown>;
}

describe('parseDiscountSetup against the real contract', () => {
    it('reads the header, recipients and product list', () => {
        const parsed = parseDiscountSetup('doc-1', discountPayload());

        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: {
                setup: {
                    erpId: 'doc-1',
                    documentNumber: '000123',
                    percent: 5,
                    conditionName: 'quantity-kind',
                    conditionNumber: 10,
                    priceTypeErpId: null,
                    validTo: null,
                    active: true,
                    inactiveReason: null,
                    allProducts: false,
                    productMode: 'list',
                    sourceVersion: '7',
                },
                recipients: [{ counterpartyErpId: 'cp-1', contractErpId: '' }],
                productErpIds: ['p1', 'p2'],
            },
        });
    });

    it('reads an empty condition as unconditional and keeps a negative percent (markup)', () => {
        const parsed = parseDiscountSetup(
            'doc-1',
            discountPayload({ condition: '', conditionNumber: undefined, percent: -3 }),
        );

        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: {
                setup: { conditionName: '', conditionNumber: null, percent: -3, active: true },
            },
        });
    });

    it('unions product lines into the product set and drops warehouse recipients', () => {
        const parsed = parseDiscountSetup(
            'doc-1',
            discountPayload({
                productIds: ['p1'],
                productLines: [{ productId: 'p1' }, { productId: 'p3' }],
                recipients: [
                    { counterpartyId: 'cp-1', contractId: 'k-1' },
                    { warehouseId: 'w-1' },
                    { counterpartyId: 'cp-1', contractId: 'k-1' },
                    {},
                ],
            }),
        );

        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: {
                productErpIds: ['p1', 'p3'],
                recipients: [
                    { counterpartyErpId: 'cp-1', contractErpId: 'k-1' },
                    { counterpartyErpId: '', contractErpId: '' },
                ],
            },
        });
    });

    it.each([
        [
            'a document without a header percent (price groups, bonuses, fixed price)',
            { percent: undefined },
            'no-header-percent',
        ],
        ['a fixed price', { priceNumber: 99 }, 'fixed-price'],
        ['a reference condition', { conditionRefId: 'card-1' }, 'reference-condition'],
        ['weekday windows', { byWeekdays: true }, 'weekday-windows'],
    ])('stores %s inactive, never applied', (_name, overrides, reason) => {
        const parsed = parseDiscountSetup('doc-1', discountPayload(overrides));

        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: { setup: { active: false, inactiveReason: reason } },
        });
    });

    it('keeps a dynamic product filter active, each reference value as {refId}', () => {
        const parsed = parseDiscountSetup(
            'doc-1',
            discountPayload({
                productMode: 'filter',
                productFilter: [
                    create(SelectionConditionSchema, {
                        field: 'Номенклатура',
                        comparison: 'Равно',
                        values: [
                            create(SourceFieldValueSchema, {
                                value: { case: 'refId', value: 'p-1' },
                            }),
                        ],
                    }),
                ],
            }),
        );

        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: {
                setup: {
                    active: true,
                    inactiveReason: null,
                    productFilter: [{ values: [{ refId: 'p-1' }] }],
                },
            },
        });
    });

    it('applies an all-products setup even in filter mode', () => {
        const parsed = parseDiscountSetup(
            'doc-1',
            discountPayload({ productMode: 'filter', allProducts: true, productIds: [] }),
        );

        expect(parsed).toMatchObject({ input: { setup: { active: true, allProducts: true } } });
    });

    it('keeps the price type scope of a markup/discount rule', () => {
        const parsed = parseDiscountSetup('doc-1', discountPayload({ priceTypeId: 'pt-1' }));

        expect(parsed).toMatchObject({
            input: { setup: { priceTypeErpId: 'pt-1', active: true } },
        });
    });

    it('turns a tombstone and an unposted document into deactivations', () => {
        expect(
            parseDiscountSetup(
                'doc-1',
                toJson(
                    DiscountSetupChangedSchema,
                    create(DiscountSetupChangedSchema, {
                        entityId: 'doc-1',
                        version: '8',
                        isDeleted: true,
                    }),
                ) as Record<string, unknown>,
            ),
        ).toEqual({ kind: 'tombstone', version: '8' });
        expect(parseDiscountSetup('doc-1', discountPayload({ isActive: false }))).toEqual({
            kind: 'unposted',
            version: '7',
        });
    });

    it.each([
        ['version', { version: '' }],
        ['effectiveFrom', { effectiveFrom: undefined }],
        ['productMode', { productMode: '' }],
    ])('rejects a payload with an invalid %s as non-retryable', (_field, overrides) => {
        expect(() => parseDiscountSetup('doc-1', discountPayload(overrides))).toThrow(
            NonRetryableInboundError,
        );
    });
});

function retroPayload(
    overrides: Parameters<typeof create<typeof RetroBonusSetupChangedSchema>>[1] = {},
): Record<string, unknown> {
    return toJson(
        RetroBonusSetupChangedSchema,
        create(RetroBonusSetupChangedSchema, {
            entityId: 'doc-2',
            version: '3',
            documentNumber: '000007',
            percent: 2.5,
            accrualKind: 'by-sale',
            effectiveFrom: from,
            isActive: true,
            counterpartyMode: 'list',
            productMode: 'list',
            counterpartyIds: ['cp-1'],
            productIds: ['p1'],
            ...overrides,
        }),
    ) as Record<string, unknown>;
}

describe('parseRetroBonusSetup against the real contract', () => {
    it('reads scalars, flags and both lists', () => {
        const parsed = parseRetroBonusSetup(
            'doc-2',
            retroPayload({ isInstant: true, conditionAmount: 1000, recipientContractId: 'k-1' }),
        );

        expect(parsed).toMatchObject({
            kind: 'upsert',
            input: {
                rule: {
                    erpId: 'doc-2',
                    documentNumber: '000007',
                    percent: 2.5,
                    isInstant: true,
                    accrualKind: 'by-sale',
                    accrualDayNumber: 0,
                    conditionAmount: 1000,
                    conditionQuantity: null,
                    recipientContractErpId: 'k-1',
                    allCounterparties: false,
                    allProducts: false,
                    sourceVersion: '3',
                },
                counterpartyErpIds: ['cp-1'],
                productErpIds: ['p1'],
            },
        });
    });

    it('keeps the all flags and the filter of a filter-mode dimension', () => {
        const parsed = parseRetroBonusSetup(
            'doc-2',
            retroPayload({
                allProducts: true,
                counterpartyMode: 'filter',
                counterpartyIds: [],
                counterpartyFilter: [{ field: 'Parent', comparison: 'Equal', values: [] }],
            }),
        );

        expect(parsed).toMatchObject({
            input: {
                rule: {
                    allProducts: true,
                    counterpartyMode: 'filter',
                    counterpartyFilter: [{ field: 'Parent', comparison: 'Equal' }],
                },
                counterpartyErpIds: [],
            },
        });
    });

    it('treats a legacy empty accrual kind as stored empty text', () => {
        const parsed = parseRetroBonusSetup('doc-2', retroPayload({ accrualKind: '' }));

        expect(parsed).toMatchObject({ input: { rule: { accrualKind: '' } } });
    });

    it('turns a tombstone and an unposted document into deactivations', () => {
        expect(
            parseRetroBonusSetup(
                'doc-2',
                toJson(
                    RetroBonusSetupChangedSchema,
                    create(RetroBonusSetupChangedSchema, {
                        entityId: 'doc-2',
                        version: '4',
                        isDeleted: true,
                    }),
                ) as Record<string, unknown>,
            ),
        ).toEqual({ kind: 'tombstone', version: '4' });
        expect(parseRetroBonusSetup('doc-2', retroPayload({ isActive: false }))).toEqual({
            kind: 'inactive',
            version: '3',
        });
    });

    it.each([
        ['version', { version: '' }],
        ['effectiveFrom', { effectiveFrom: undefined }],
        ['counterpartyMode', { counterpartyMode: '' }],
    ])('rejects a payload with an invalid %s as non-retryable', (_field, overrides) => {
        expect(() => parseRetroBonusSetup('doc-2', retroPayload(overrides))).toThrow(
            NonRetryableInboundError,
        );
    });
});
