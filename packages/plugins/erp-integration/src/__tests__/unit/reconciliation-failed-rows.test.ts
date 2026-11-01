import { describe, expect, it, vi } from 'vitest';

import { ReconciliationService } from '../../reconciliation.service';

function makeSummary(aggregateType: string, activeCount: number) {
    return { aggregateType, count: activeCount, activeCount, lastModifiedMax: null };
}

describe('ReconciliationService failed inbox rows', () => {
    function make(failedByStream: Record<string, number>, open: object | undefined) {
        const save = vi.fn().mockResolvedValue(undefined);
        const findOne = vi.fn().mockResolvedValue(open);
        const connection = { getRepository: () => ({ save, findOne }) };
        const summaryClient = {
            fetchSummaries: async (t?: string) => [makeSummary(t ?? '', 1)],
        };
        const service = new ReconciliationService(
            connection as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            summaryClient as never,
            { getLocalActiveCount: async () => 1 } as never,
            { create: vi.fn(), resolveBySource: vi.fn() } as never,
            {
                getBacklogByStream: async () =>
                    Object.entries(failedByStream).map(([stream, failed]) => ({ stream, failed })),
            } as never,
        );
        return { service, save, findOne };
    }

    it('opens one failed-inbox-rows issue per stream with failed rows', async () => {
        const { service, save } = make({ contract: 694, 'point-of-sale': 2186 }, undefined);
        const result = await service.runComparison({ triggeredBy: 'scheduled' });
        expect(result.issuesFound).toBe(2);
        const saved = save.mock.calls.map(c => c[0]);
        expect(saved).toHaveLength(2);
        expect(saved).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    issueType: 'failed-inbox-rows',
                    aggregateType: 'inbox-failed:contract',
                    ourCount: 694,
                    theirActiveCount: 0,
                }),
            ]),
        );
    });

    it('auto-resolves an open failed-rows issue once the stream has none', async () => {
        const open = { aggregateType: 'inbox-failed:stock', status: 'open' };
        const { service, save } = make({}, open);
        await service.runComparison({ triggeredBy: 'scheduled' });
        expect(save).toHaveBeenCalled();
        expect(open).toMatchObject({ status: 'resolved' });
    });
});
