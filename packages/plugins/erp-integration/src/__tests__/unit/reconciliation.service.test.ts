import { describe, expect, it, vi } from 'vitest';

import { ReconciliationService } from '../../reconciliation.service';
import type { ReconciliationSummary } from '../../reconciliation-summary.client';
import { COMPARED_AGGREGATE_TYPES } from '../../reconciliation-local-counts.service';

function makeSummary(aggregateType: string, activeCount: number): ReconciliationSummary {
    return { aggregateType, count: activeCount, activeCount, lastModifiedMax: null };
}

// runComparison is the one method both the scheduled task and the manual mutation call — these
// tests exercise it directly, not through either caller, mirroring this plugin's own
// integration-inbox-processor "invoke the processing method directly" convention.
describe('ReconciliationService.runComparison', () => {
    function makeService(overrides?: {
        fetchSummaries?: (aggregateType?: string) => Promise<ReconciliationSummary[]>;
        getLocalActiveCount?: (ctx: unknown, aggregateType: string) => Promise<number>;
    }) {
        const save = vi.fn().mockResolvedValue(undefined);
        const connection = {
            getRepository: () => ({ save, createQueryBuilder: vi.fn() }),
        };
        const requestContextService = { create: vi.fn().mockResolvedValue({}) };
        const summaryClient = {
            fetchSummaries:
                overrides?.fetchSummaries ??
                (async (aggregateType?: string) => [makeSummary(aggregateType ?? '', 1)]),
        };
        const localCounts = {
            getLocalActiveCount: overrides?.getLocalActiveCount ?? (async () => 1),
        };
        const service = new ReconciliationService(
            connection as never,
            requestContextService as never,
            summaryClient as never,
            localCounts as never,
        );
        return { service, save };
    }

    it('records an upstream-higher issue when Integration Service has more active entities', async () => {
        const { service, save } = makeService({
            fetchSummaries: async (aggregateType?: string) => [
                makeSummary(aggregateType ?? '', 10),
            ],
            getLocalActiveCount: async () => 4,
        });

        const result = await service.runComparison({ triggeredBy: 'scheduled' });

        expect(result.issuesFound).toBe(COMPARED_AGGREGATE_TYPES.length);
        expect(save).toHaveBeenCalledTimes(COMPARED_AGGREGATE_TYPES.length);
        expect(save.mock.calls[0][0]).toMatchObject({
            issueType: 'upstream-higher',
            ourCount: 4,
            theirActiveCount: 10,
            triggeredBy: 'scheduled',
        });
    });

    it('records a local-higher issue when mivend has more active entities than Integration Service', async () => {
        const { service, save } = makeService({
            fetchSummaries: async (aggregateType?: string) => [makeSummary(aggregateType ?? '', 2)],
            getLocalActiveCount: async () => 9,
        });

        const result = await service.runComparison({
            triggeredBy: 'manual',
            triggeredByAdministratorId: '42',
        });

        expect(result.issuesFound).toBe(COMPARED_AGGREGATE_TYPES.length);
        expect(save.mock.calls[0][0]).toMatchObject({
            issueType: 'local-higher',
            ourCount: 9,
            theirActiveCount: 2,
            triggeredBy: 'manual',
            triggeredByAdministratorId: '42',
        });
    });

    it('records no issue when counts match', async () => {
        const { service, save } = makeService({
            fetchSummaries: async (aggregateType?: string) => [makeSummary(aggregateType ?? '', 5)],
            getLocalActiveCount: async () => 5,
        });

        const result = await service.runComparison({ triggeredBy: 'scheduled' });

        expect(result.issuesFound).toBe(0);
        expect(result.checked).toBe(COMPARED_AGGREGATE_TYPES.length);
        expect(save).not.toHaveBeenCalled();
    });

    it('skips a type whose summary fetch fails, without crashing the whole run or treating it as zero discrepancies', async () => {
        let calls = 0;
        const { service, save } = makeService({
            fetchSummaries: async (aggregateType?: string) => {
                calls += 1;
                if (aggregateType === COMPARED_AGGREGATE_TYPES[0]) {
                    throw new Error('Integration Service unreachable');
                }
                return [makeSummary(aggregateType ?? '', 3)];
            },
            getLocalActiveCount: async () => 3,
        });

        const result = await service.runComparison({ triggeredBy: 'scheduled' });

        expect(calls).toBe(COMPARED_AGGREGATE_TYPES.length);
        expect(result.skipped).toEqual([COMPARED_AGGREGATE_TYPES[0]]);
        expect(result.checked).toBe(COMPARED_AGGREGATE_TYPES.length - 1);
        expect(save).not.toHaveBeenCalled();
    });

    it('skips a type missing from the response entirely, rather than throwing or silently succeeding', async () => {
        const { service } = makeService({
            fetchSummaries: async () => [],
        });

        const result = await service.runComparison({ triggeredBy: 'scheduled' });

        expect(result.skipped).toEqual([...COMPARED_AGGREGATE_TYPES]);
        expect(result.checked).toBe(0);
    });
});
