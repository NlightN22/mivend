import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import {
    GrantedRetroBonusService,
    GrantedRetroBonusUpsertInput,
} from '../../granted-retro-bonus.service';

const ctx = {} as RequestContext;

function input(
    overrides: Partial<GrantedRetroBonusUpsertInput> = {},
): GrantedRetroBonusUpsertInput {
    return {
        erpId: 'grb-1',
        sourceDocumentErpId: 'doc-1',
        sourceCounterpartyErpId: 'cp-1',
        recipientCounterpartyErpId: 'cp-2',
        productErpId: 'prod-1',
        discountDocumentErpId: null,
        operationKind: null,
        accrualKind: null,
        percent: 5,
        quantity: 2,
        amount: 10,
        orderErpId: null,
        sourceVersion: '5',
        ...overrides,
    };
}

function createService(existing: Record<string, unknown> | null) {
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((v: object) => ({ ...v })),
        save: vi.fn().mockResolvedValue({}),
    };
    const build = vi.fn();
    const service = new GrantedRetroBonusService(
        { getRepository: () => repo } as never,
        { build } as never,
    );
    return { service, repo, build };
}

describe('GrantedRetroBonusService', () => {
    it('inserts a new fact', async () => {
        const { service, repo } = createService(null);
        await service.upsert(ctx, input());
        expect(repo.create).toHaveBeenCalledOnce();
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it.each(['5', '4'])('skips a redelivery at version %s against stored 5', async v => {
        const { service, repo } = createService({ sourceVersion: '5' });
        await service.upsert(ctx, input({ sourceVersion: v }));
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('applies a strictly newer version onto the existing row', async () => {
        const existing = { erpId: 'grb-1', sourceVersion: '5', amount: 1 };
        const { service, repo } = createService(existing);
        await service.upsert(ctx, input({ sourceVersion: '6', amount: 99 }));
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 99, sourceVersion: '6' }),
        );
    });

    it('scopes the list query to the recipient counterparty', async () => {
        const { service, build } = createService(null);
        build.mockReturnValue({ getManyAndCount: () => Promise.resolve([[{ id: 1 }], 1]) });
        const result = await service.findForRecipient(ctx, 'cp-2', { take: 10 });
        expect(build).toHaveBeenCalledWith(
            expect.anything(),
            { take: 10 },
            expect.objectContaining({ where: { recipientCounterpartyErpId: 'cp-2' } }),
        );
        expect(result.totalItems).toBe(1);
    });
});
