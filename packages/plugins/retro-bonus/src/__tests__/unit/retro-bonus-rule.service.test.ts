import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { RetroBonusRuleService, RetroBonusRuleUpsertInput } from '../../retro-bonus-rule.service';
import { RetroBonusRule } from '../../retro-bonus-rule.entity';

const ctx = {} as RequestContext;

function input(overrides: Partial<RetroBonusRuleUpsertInput> = {}): RetroBonusRuleUpsertInput {
    return {
        erpId: 'rbr-1',
        productErpId: 'prod-1',
        counterpartyErpId: 'cp-1',
        recipientContractErpId: null,
        priceTypeErpId: null,
        isInstant: false,
        accrualPeriod: null,
        accrualDayNumber: 0,
        accrualKind: 'ПоПродажам',
        percent: 5,
        limitAmount: null,
        conditionAmount: null,
        conditionQuantity: null,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validTo: null,
        sourceVersion: '1',
        ...overrides,
    };
}

function createService(existing: Partial<RetroBonusRule> | null) {
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((values: Partial<RetroBonusRule>) => ({ ...values })),
        save: vi.fn((entity: RetroBonusRule) => Promise.resolve(entity)),
        find: vi.fn().mockResolvedValue([]),
    };
    const connection = { getRepository: () => repo } as never;
    return { service: new RetroBonusRuleService(connection), repo };
}

describe('RetroBonusRuleService.upsertRetroBonusRule', () => {
    it('always applies the first write (no existing row)', async () => {
        const { service, repo } = createService(null);

        const result = await service.upsertRetroBonusRule(ctx, input());

        expect(repo.create).toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalled();
        expect(result.erpId).toBe('rbr-1');
    });

    it('overwrites an existing row when the incoming version is newer', async () => {
        const existing = { erpId: 'rbr-1', sourceVersion: '1', percent: 5 } as RetroBonusRule;
        const { service, repo } = createService(existing);

        const result = await service.upsertRetroBonusRule(
            ctx,
            input({ sourceVersion: '2', percent: 10 }),
        );

        expect(repo.save).toHaveBeenCalled();
        expect(result.percent).toBe(10);
        expect(result.sourceVersion).toBe('2');
    });

    it('skips and returns the existing row unchanged when the incoming version is equal', async () => {
        const existing = { erpId: 'rbr-1', sourceVersion: '2', percent: 5 } as RetroBonusRule;
        const { service, repo } = createService(existing);

        const result = await service.upsertRetroBonusRule(
            ctx,
            input({ sourceVersion: '2', percent: 999 }),
        );

        expect(repo.save).not.toHaveBeenCalled();
        expect(result).toBe(existing);
        expect(result.percent).toBe(5);
    });

    it('skips and returns the existing row unchanged when the incoming version is older', async () => {
        const existing = { erpId: 'rbr-1', sourceVersion: '5', percent: 5 } as RetroBonusRule;
        const { service, repo } = createService(existing);

        const result = await service.upsertRetroBonusRule(
            ctx,
            input({ sourceVersion: '2', percent: 999 }),
        );

        expect(repo.save).not.toHaveBeenCalled();
        expect(result).toBe(existing);
    });

    it('never conflicts two different erpIds for the same counterparty/product — both persist', async () => {
        const { service: service1, repo: repo1 } = createService(null);
        await service1.upsertRetroBonusRule(ctx, input({ erpId: 'rbr-1' }));
        expect(repo1.findOne).toHaveBeenCalledWith({ where: { erpId: 'rbr-1' } });

        const { service: service2, repo: repo2 } = createService(null);
        await service2.upsertRetroBonusRule(ctx, input({ erpId: 'rbr-2' }));
        expect(repo2.findOne).toHaveBeenCalledWith({ where: { erpId: 'rbr-2' } });
        // No cross-row conflict query exists — each upsert only ever looks up its own erpId.
        expect(repo1.findOne).toHaveBeenCalledTimes(1);
        expect(repo2.findOne).toHaveBeenCalledTimes(1);
    });
});

describe('RetroBonusRuleService.findForCounterparty', () => {
    it('filters by counterpartyErpId only when contractErpId is not provided', async () => {
        const { service, repo } = createService(null);

        await service.findForCounterparty(ctx, 'cp-1');

        expect(repo.find).toHaveBeenCalledWith({ where: { counterpartyErpId: 'cp-1' } });
    });

    it('filters by both counterpartyErpId and contractErpId when provided', async () => {
        const { service, repo } = createService(null);

        await service.findForCounterparty(ctx, 'cp-1', 'contract-1');

        expect(repo.find).toHaveBeenCalledWith({
            where: { counterpartyErpId: 'cp-1', recipientContractErpId: 'contract-1' },
        });
    });
});
