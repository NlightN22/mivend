import { testRequestContext } from 'shared';
import { describe, expect, it, vi } from 'vitest';

import { IntegrationEventListService } from '../../integration-event-list.service';
import { IntegrationOutboxHealthService } from '../../integration-outbox-health.service';
import { InvalidListOptionsError } from '../../list-options';

const rows = vi.hoisted(() => ({ page: [] as unknown[] }));

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getPageAndCount: vi.fn(async () => ({ items: rows.page, totalItems: rows.page.length })),
    ctxQueryBounded: vi.fn(async () => rows.page),
}));

const chain = (): object => {
    const proxy: object = new Proxy(() => undefined, {
        get: () => () => proxy,
    });
    return proxy;
};
const connection = { getRepository: () => ({ createQueryBuilder: chain }) };

const CONSTRAINT = 'duplicate key; Key (inn)=(7701234567) already exists.';
const MASKED = 'duplicate key; Key (inn)=(…) already exists.';
const EMAIL = 'cannot notify jane.doe@example.com';

describe('integration event lists mask stored error text', () => {
    const service = new IntegrationEventListService(connection as never);

    it('masks lastError and outcomeReason of an inbox issue', async () => {
        rows.page = [{ id: 1, lastError: CONSTRAINT, outcomeReason: EMAIL }];

        const result = await service.listInboxIssues(testRequestContext, {});

        expect(result.items[0]).toMatchObject({
            lastError: MASKED,
            outcomeReason: 'cannot notify [email]',
        });
    });

    it('masks lastError of an outbox problem', async () => {
        rows.page = [{ id: 1, eventType: 'order.confirmed', payload: {}, lastError: EMAIL }];

        const result = await service.listOutboxProblems(testRequestContext, {});

        expect(result.items[0].lastError).toBe('cannot notify [email]');
    });

    it.each(['lastError', 'outcomeReason'])('refuses to filter inbox issues on %s', async field => {
        await expect(
            service.listInboxIssues(testRequestContext, {
                filter: { [field]: { contains: 'x' } },
            }),
        ).rejects.toThrow(InvalidListOptionsError);
    });

    it('refuses to filter outbox problems on lastError', async () => {
        await expect(
            service.listOutboxProblems(testRequestContext, {
                filter: { lastError: { contains: 'x' } },
            }),
        ).rejects.toThrow(InvalidListOptionsError);
    });
});

describe('outbox health masks stored error text', () => {
    it('masks lastError and lastSkipReason', async () => {
        rows.page = [
            {
                eventType: 'order.confirmed',
                pending: 0,
                failed: 1,
                skipped: 1,
                held: 0,
                oldestPendingAt: null,
                lastPublishedAt: null,
                lastError: CONSTRAINT,
                lastErrorAt: null,
                lastSkipReason: EMAIL,
            },
        ];

        const result = await new IntegrationOutboxHealthService(
            connection as never,
        ).getHealthByEventType(testRequestContext);

        const row = result.find(r => r.eventType === 'order.confirmed');
        expect(row?.lastError).toBe(MASKED);
        expect(row?.lastSkipReason).toBe('cannot notify [email]');
    });
});
