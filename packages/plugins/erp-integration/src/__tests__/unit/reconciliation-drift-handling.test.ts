import { describe, expect, it, vi } from 'vitest';

import { ReconciliationService } from '../../reconciliation.service';
import { filterFor } from '../../reconciliation-filters';

const summary = (aggregateType: string, count: number): Record<string, unknown> => ({
    aggregateType,
    count,
    activeCount: count,
    lastModifiedMax: null,
    pendingPublish: aggregateType === 'customer-order' ? 0 : undefined,
});

interface Setup {
    service: ReconciliationService;
    save: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
    healIfDue: ReturnType<typeof vi.fn>;
}

function setup(opts: {
    state: Record<string, unknown>;
    heal?: Record<string, unknown>;
    backlog?: () => Promise<unknown[]>;
}): Setup {
    const save = vi.fn().mockResolvedValue(undefined);
    const findOne = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn(async (_c: unknown, i: { aggregateType: string }) => ({
        aggregateType: i.aggregateType,
        ...opts.state,
    }));
    const healIfDue = vi.fn(
        async () => opts.heal ?? { outcome: 'skipped', detail: 'too-soon', alarm: false },
    );
    const service = new ReconciliationService(
        { getRepository: () => ({ save, findOne }) } as never,
        { create: vi.fn().mockResolvedValue({}) } as never,
        { fetchSummaries: async (t?: string) => [summary(t ?? '', 10)] } as never,
        { getLocalActiveCount: async () => 4 } as never,
        { create: vi.fn(), resolveBySource: vi.fn() } as never,
        { getBacklogByStream: opts.backlog ?? (async () => []) } as never,
        { countMissing: async () => 0 } as never,
        { record } as never,
        { healIfDue } as never,
    );
    return { service, save, record, healIfDue };
}

const issueTypes = (save: ReturnType<typeof vi.fn>): string[] =>
    save.mock.calls.map(c => (c[0] as { issueType: string }).issueType);

describe('ReconciliationService drift handling', () => {
    it('records a seeding gap without an issue and without healing', async () => {
        const { service, save, healIfDue } = setup({
            state: { state: 'seeding', seedingAlarm: false },
        });
        const result = await service.runComparison({ triggeredBy: 'scheduled' });
        expect(result.issuesFound).toBe(0);
        expect(save).not.toHaveBeenCalled();
        expect(healIfDue).not.toHaveBeenCalled();
    });

    it('records a converging gap without an issue', async () => {
        const { service, save } = setup({ state: { state: 'converging', seedingAlarm: false } });
        await service.runComparison({ triggeredBy: 'scheduled' });
        expect(save).not.toHaveBeenCalled();
    });

    it('opens the drift issue and heals only a stalled gap', async () => {
        const { service, save, healIfDue } = setup({
            state: { state: 'stalled', seedingAlarm: false },
        });
        await service.runComparison({ triggeredBy: 'scheduled' });
        expect(issueTypes(save)).not.toContain('heal-alarm');
        expect(healIfDue).toHaveBeenCalled();
        expect(issueTypes(save).every(t => t === 'upstream-higher')).toBe(true);
    });

    it('opens a heal alarm issue when healing reports an alarm', async () => {
        const { service, save } = setup({
            state: { state: 'stalled', seedingAlarm: false },
            heal: { outcome: 'all-not-found', detail: 'x', alarm: true },
        });
        await service.runComparison({ triggeredBy: 'scheduled' });
        expect(issueTypes(save)).toContain('heal-alarm');
    });

    it('opens a seeding-stuck issue after the seeding alarm, without healing', async () => {
        const { service, save, healIfDue } = setup({
            state: { state: 'seeding', seedingAlarm: true },
        });
        await service.runComparison({ triggeredBy: 'scheduled' });
        expect(new Set(issueTypes(save))).toEqual(new Set(['seeding-stuck']));
        expect(healIfDue).not.toHaveBeenCalled();
    });

    it('passes an unreadable backlog on as unknown, never as empty', async () => {
        const backlog = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue([]);
        const { service, record } = setup({
            state: { state: 'seeding', seedingAlarm: false },
            backlog,
        });
        await service.runComparison({ triggeredBy: 'scheduled' });
        const input = record.mock.calls[0][1] as unknown as { signals: unknown };
        expect(input.signals).toMatchObject({ inboxBacklog: null, inboxFailed: null });
    });

    it('passes the order source queue (unknown when absent) and the stream backlog', async () => {
        const { service, record } = setup({
            state: { state: 'seeding', seedingAlarm: false },
            backlog: async () => [
                {
                    stream: 'order-changed',
                    pending: 2,
                    processing: 1,
                    failed: 4,
                    dependencyMissing: 0,
                    replayPending: 1,
                },
            ],
        });
        await service.runComparison({ triggeredBy: 'scheduled' });
        const order = record.mock.calls
            .map(c => c[1] as { aggregateType: string; signals: Record<string, unknown> })
            .find(i => i.aggregateType === 'customer-order');
        expect(order?.signals).toEqual({ inboxBacklog: 4, inboxFailed: 4, sourceQueue: 0 });
    });

    it('declares the filter shown for orders', () => {
        expect(filterFor('customer-order').summaryParams).toEqual({ excludeDeleted: 'true' });
    });
});
