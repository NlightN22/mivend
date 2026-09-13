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
        const findOne = vi.fn().mockResolvedValue(undefined);
        const connection = {
            getRepository: () => ({ save, findOne, createQueryBuilder: vi.fn() }),
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
        const notificationService = { create: vi.fn().mockResolvedValue({}) };
        const service = new ReconciliationService(
            connection as never,
            requestContextService as never,
            summaryClient as never,
            localCounts as never,
            notificationService as never,
        );
        return { service, save, notificationService };
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

    // issue #87 Part 2: unlike reservation/payment reconciliation, a manual re-run always carries
    // the requesting administrator, so this is the one of the four sites with a real recipient.
    it('does not create a Notification for a scheduled run (no administrator to notify)', async () => {
        const { service, notificationService } = makeService({
            fetchSummaries: async (aggregateType?: string) => [
                makeSummary(aggregateType ?? '', 10),
            ],
            getLocalActiveCount: async () => 4,
        });

        await service.runComparison({ triggeredBy: 'scheduled' });

        expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('creates a warning Notification addressed to the requesting administrator for a manual run', async () => {
        const { service, notificationService } = makeService({
            fetchSummaries: async (aggregateType?: string) => [
                makeSummary(aggregateType ?? '', 10),
            ],
            getLocalActiveCount: async () => 4,
        });

        await service.runComparison({ triggeredBy: 'manual', triggeredByAdministratorId: '42' });

        expect(notificationService.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                recipientType: 'administrator',
                recipientId: '42',
                kind: 'warning',
                sourceType: 'erp-reconciliation',
            }),
        );
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

    it('auto-resolves a previously open issue once counts agree again (no stale drift left showing)', async () => {
        const existing = { id: '9', status: 'open', aggregateType: COMPARED_AGGREGATE_TYPES[0] };
        const save = vi.fn().mockResolvedValue(undefined);
        const findOne = vi.fn().mockResolvedValue(existing);
        const connection = {
            getRepository: () => ({ save, findOne, createQueryBuilder: vi.fn() }),
        };
        const requestContextService = { create: vi.fn().mockResolvedValue({}) };
        const summaryClient = {
            fetchSummaries: async (aggregateType?: string) => [makeSummary(aggregateType ?? '', 5)],
        };
        const localCounts = { getLocalActiveCount: async () => 5 };
        const notificationService = { create: vi.fn() };
        const service = new ReconciliationService(
            connection as never,
            requestContextService as never,
            summaryClient as never,
            localCounts as never,
            notificationService as never,
        );

        await service.runComparison({ triggeredBy: 'scheduled' });

        expect(save).toHaveBeenCalledTimes(COMPARED_AGGREGATE_TYPES.length);
        expect(save.mock.calls[0][0]).toMatchObject({
            id: '9',
            status: 'resolved',
            resolution: expect.stringMatching(/auto-resolved/i),
        });
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

    it('updates the existing open issue for the same aggregateType instead of inserting a duplicate (mivend.audit.85 HIGH)', async () => {
        const existing = { id: '7', status: 'open', aggregateType: COMPARED_AGGREGATE_TYPES[0] };
        const save = vi.fn().mockResolvedValue(undefined);
        const findOne = vi.fn().mockResolvedValue(existing);
        const connection = {
            getRepository: () => ({ save, findOne, createQueryBuilder: vi.fn() }),
        };
        const requestContextService = { create: vi.fn().mockResolvedValue({}) };
        const summaryClient = {
            fetchSummaries: async (aggregateType?: string) => [
                makeSummary(aggregateType ?? '', 10),
            ],
        };
        const localCounts = { getLocalActiveCount: async () => 4 };
        const notificationService = { create: vi.fn().mockResolvedValue({}) };
        const service = new ReconciliationService(
            connection as never,
            requestContextService as never,
            summaryClient as never,
            localCounts as never,
            notificationService as never,
        );

        await service.runComparison({ triggeredBy: 'scheduled' });

        expect(save).toHaveBeenCalledTimes(COMPARED_AGGREGATE_TYPES.length);
        expect(save.mock.calls[0][0]).toMatchObject({
            id: '7',
            issueType: 'upstream-higher',
            ourCount: 4,
            theirActiveCount: 10,
        });
    });
});

describe('ReconciliationService.resolve', () => {
    it('marks the issue resolved with the given resolution note, never auto-picked', async () => {
        const issue = { id: '3', status: 'open', resolution: null };
        const save = vi.fn().mockImplementation(async (x: typeof issue) => x);
        const findOneOrFail = vi.fn().mockResolvedValue(issue);
        const connection = {
            getRepository: () => ({ save, findOneOrFail }),
        };
        const service = new ReconciliationService(
            connection as never,
            { create: vi.fn() } as never,
            {} as never,
            {} as never,
            { create: vi.fn() } as never,
        );

        const result = await service.resolve({} as never, {
            id: '3',
            resolution: 'stale seed row',
        });

        expect(result).toMatchObject({ status: 'resolved', resolution: 'stale seed row' });
    });
});
