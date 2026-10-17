import { describe, expect, it } from 'vitest';
import { ForbiddenError, UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import type { ChecksService } from '@mivend/plugin-checks';
import { withAggregateLock } from 'shared';

import { ReservationExtensionService } from '../../reservation-extension.service';
import { seedCancellableOrder, sleep } from './order-cancellation.harness';
import { TestReservation, mockCtx, useReserveOrderHarness } from './reserve-order.harness';

const h = useReserveOrderHarness('reservation_extension_concurrency');
const DAY_MS = 24 * 60 * 60 * 1000;

function buildService(consequence: 'block' | null = null): ReservationExtensionService {
    return new ReservationExtensionService(
        h.connection,
        {
            getActorIdentity: async () => ({ roleCodes: ['manager'], branchId: 'branch-1' }),
        } as unknown as AccessScopeService,
        {
            evaluate: async () => ({ findings: [], strongestConsequence: consequence }),
        } as unknown as ChecksService,
    );
}

const load = (orderId: string): Promise<TestReservation> =>
    h.dataSource.getRepository(TestReservation).findOneByOrFail({ orderId });

describe('ReservationExtensionService.extendReservation under concurrent writers (real Postgres)', () => {
    it('two parallel extensions each add their days exactly once', async () => {
        const order = await seedCancellableOrder(h);
        const before = (await load(order.id)).expiresAt.getTime();
        const service = buildService();

        await Promise.all([
            service.extendReservation(mockCtx, order.id, 2),
            service.extendReservation(mockCtx, order.id, 3),
        ]);

        expect((await load(order.id)).expiresAt.getTime()).toBe(before + 5 * DAY_MS);
    });

    it('an extension queued behind a release does not extend the released row', async () => {
        const order = await seedCancellableOrder(h);
        const before = (await load(order.id)).expiresAt.getTime();
        const service = buildService();

        const release = withAggregateLock(
            h.connection,
            mockCtx,
            `reserve-order:${order.id}`,
            async (txCtx: RequestContext) => {
                await sleep(80);
                await h.connection
                    .getRepository(txCtx, 'Channel')
                    .query(
                        `UPDATE reservation_test_reservation SET status = 'released' WHERE "orderId" = $1`,
                        [order.id],
                    );
            },
        );
        await sleep(20);
        const extension = service.extendReservation(mockCtx, order.id, 2);

        await release;
        await expect(extension).rejects.toBeInstanceOf(UserInputError);
        const row = await load(order.id);
        expect(row.status).toBe('released');
        expect(row.expiresAt.getTime()).toBe(before);
    });

    it('an extension racing a sweep that expired the row (row lock, no advisory lock) does not extend it', async () => {
        const order = await seedCancellableOrder(h);
        const before = (await load(order.id)).expiresAt.getTime();
        const service = buildService();

        const sweep = h.dataSource.transaction(async manager => {
            await manager.query(
                `SELECT 1 FROM reservation_test_reservation WHERE "orderId" = $1 FOR UPDATE`,
                [order.id],
            );
            await sleep(100);
            await manager.query(
                `UPDATE reservation_test_reservation SET status = 'expired' WHERE "orderId" = $1`,
                [order.id],
            );
        });
        await sleep(30);
        const extension = service.extendReservation(mockCtx, order.id, 2);

        await sweep;
        await expect(extension).rejects.toBeInstanceOf(UserInputError);
        const row = await load(order.id);
        expect(row.status).toBe('expired');
        expect(row.expiresAt.getTime()).toBe(before);
    });

    it('a blocked extension (over the limit or no limit row) writes nothing', async () => {
        const order = await seedCancellableOrder(h);
        const before = (await load(order.id)).expiresAt.getTime();

        await expect(
            buildService('block').extendReservation(mockCtx, order.id, 30),
        ).rejects.toBeInstanceOf(ForbiddenError);

        expect((await load(order.id)).expiresAt.getTime()).toBe(before);
    });
});
