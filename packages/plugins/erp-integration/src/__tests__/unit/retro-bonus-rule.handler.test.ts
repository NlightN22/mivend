import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { RetroBonusRuleStreamHandler } from '../../handlers/retro-bonus-rule.handler';

const ctx = {} as RequestContext;

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        entityId: 'rbr-1',
        version: '5',
        productId: 'prod-1',
        counterpartyId: 'cp-1',
        recipientContractId: 'contract-1',
        priceTypeId: 'pt-1',
        isInstant: true,
        accrualPeriod: 'monthly',
        accrualDayNumber: 10,
        accrualKind: 'ПоПродажам',
        percent: 7.5,
        limitAmount: 1000,
        conditionAmount: 500,
        conditionQuantity: 20,
        effectiveFrom: '2026-07-01T00:00:00Z',
        effectiveTo: '2026-07-31T00:00:00Z',
        ...overrides,
    };
}

function createHandler() {
    const retroBonusRuleService = { upsertRetroBonusRule: vi.fn().mockResolvedValue({}) };
    const handler = new RetroBonusRuleStreamHandler(retroBonusRuleService as never);
    return { handler, retroBonusRuleService };
}

describe('RetroBonusRuleStreamHandler', () => {
    it('upserts a valid full-field payload with all fields mapped', async () => {
        const { handler, retroBonusRuleService } = createHandler();

        await handler.apply(ctx, 'rbr-1', basePayload());

        expect(retroBonusRuleService.upsertRetroBonusRule).toHaveBeenCalledWith(ctx, {
            erpId: 'rbr-1',
            productErpId: 'prod-1',
            counterpartyErpId: 'cp-1',
            recipientContractErpId: 'contract-1',
            priceTypeErpId: 'pt-1',
            isInstant: true,
            accrualPeriod: 'monthly',
            accrualDayNumber: 10,
            accrualKind: 'ПоПродажам',
            percent: 7.5,
            limitAmount: 1000,
            conditionAmount: 500,
            conditionQuantity: 20,
            validFrom: new Date('2026-07-01T00:00:00Z'),
            validTo: new Date('2026-07-31T00:00:00Z'),
            sourceVersion: '5',
        });
    });

    it('skips an unrecognized accrualKind rather than storing a raw/opaque value', async () => {
        const { handler, retroBonusRuleService } = createHandler();

        await handler.apply(ctx, 'rbr-1', basePayload({ accrualKind: 'ПоВозврату' }));

        expect(retroBonusRuleService.upsertRetroBonusRule).not.toHaveBeenCalled();
    });

    it.each(['ПоЗакупкам', 'ПоПоступлениюДС', 'ПоПоступлениюДССБК', 'ПоПродажам'])(
        'accepts the closed accrualKind value %s',
        async accrualKind => {
            const { handler, retroBonusRuleService } = createHandler();

            await handler.apply(ctx, 'rbr-1', basePayload({ accrualKind }));

            expect(retroBonusRuleService.upsertRetroBonusRule).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({ accrualKind }),
            );
        },
    );

    it.each(['version', 'productId', 'counterpartyId', 'percent', 'effectiveFrom'])(
        'skips when required field %s is missing',
        async field => {
            const { handler, retroBonusRuleService } = createHandler();
            const payload = basePayload();
            delete payload[field];

            await handler.apply(ctx, 'rbr-1', payload);

            expect(retroBonusRuleService.upsertRetroBonusRule).not.toHaveBeenCalled();
        },
    );

    it('skips when entityId is empty', async () => {
        const { handler, retroBonusRuleService } = createHandler();

        await handler.apply(ctx, '', basePayload());

        expect(retroBonusRuleService.upsertRetroBonusRule).not.toHaveBeenCalled();
    });

    it('skips when percent is not a finite number', async () => {
        const { handler, retroBonusRuleService } = createHandler();

        await handler.apply(ctx, 'rbr-1', basePayload({ percent: 'not-a-number' }));

        expect(retroBonusRuleService.upsertRetroBonusRule).not.toHaveBeenCalled();
    });

    it('maps an absent isInstant to false (zero-coercion, not "field not sent")', async () => {
        const { handler, retroBonusRuleService } = createHandler();
        const { isInstant, ...payload } = basePayload();
        void isInstant;

        await handler.apply(ctx, 'rbr-1', payload);

        expect(retroBonusRuleService.upsertRetroBonusRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isInstant: false }),
        );
    });

    it('maps an absent accrualDayNumber to 0 (zero-coercion, not "field not sent")', async () => {
        const { handler, retroBonusRuleService } = createHandler();
        const { accrualDayNumber, ...payload } = basePayload();
        void accrualDayNumber;

        await handler.apply(ctx, 'rbr-1', payload);

        expect(retroBonusRuleService.upsertRetroBonusRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ accrualDayNumber: 0 }),
        );
    });

    it('maps an absent effectiveTo to validTo: null (no expiry) rather than skipping', async () => {
        const { handler, retroBonusRuleService } = createHandler();
        const { effectiveTo, ...payload } = basePayload();
        void effectiveTo;

        await handler.apply(ctx, 'rbr-1', payload);

        expect(retroBonusRuleService.upsertRetroBonusRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ validTo: null }),
        );
    });

    it('skips when effectiveTo is present but unparseable (malformed, not "no expiry")', async () => {
        const { handler, retroBonusRuleService } = createHandler();

        await handler.apply(ctx, 'rbr-1', basePayload({ effectiveTo: 'not-a-date' }));

        expect(retroBonusRuleService.upsertRetroBonusRule).not.toHaveBeenCalled();
    });

    it('maps absent recipientContractId/priceTypeId to null', async () => {
        const { handler, retroBonusRuleService } = createHandler();
        const { recipientContractId, priceTypeId, ...payload } = basePayload();
        void recipientContractId;
        void priceTypeId;

        await handler.apply(ctx, 'rbr-1', payload);

        expect(retroBonusRuleService.upsertRetroBonusRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ recipientContractErpId: null, priceTypeErpId: null }),
        );
    });

    it('maps absent limitAmount/conditionAmount/conditionQuantity to null', async () => {
        const { handler, retroBonusRuleService } = createHandler();
        const { limitAmount, conditionAmount, conditionQuantity, ...payload } = basePayload();
        void limitAmount;
        void conditionAmount;
        void conditionQuantity;

        await handler.apply(ctx, 'rbr-1', payload);

        expect(retroBonusRuleService.upsertRetroBonusRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                limitAmount: null,
                conditionAmount: null,
                conditionQuantity: null,
            }),
        );
    });
});
