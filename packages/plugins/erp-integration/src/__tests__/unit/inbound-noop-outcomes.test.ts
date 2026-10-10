import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ContractStreamHandler } from '../../handlers/contract.handler';
import { CounterpartyStreamHandler } from '../../handlers/counterparty.handler';
import { DiscountRuleStreamHandler } from '../../handlers/discount-rule.handler';
import { GrantedDiscountStreamHandler } from '../../handlers/granted-discount.handler';
import { GrantedRetroBonusStreamHandler } from '../../handlers/granted-retro-bonus.handler';
import { OrderChangedStreamHandler } from '../../handlers/order-changed.handler';
import { OrderRegistrationResultHandler } from '../../handlers/order-registration-result.handler';
import { OrganizationStreamHandler } from '../../handlers/organization.handler';
import { PointOfSaleStreamHandler } from '../../handlers/point-of-sale.handler';

// Issue #200: a tombstone matching no row, or a skipped part of a message, is a noop with a
// reason, never a bare return recorded as applied; the "row existed" case stays `applied`.
const ctx = {} as RequestContext;

function orderConnection(variantId: string): never {
    return {
        rawConnection: {
            createQueryBuilder: () => ({
                select: vi.fn().mockReturnThis(),
                from: vi.fn().mockReturnThis(),
                innerJoin: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                getRawOne: vi.fn().mockResolvedValue({ id: variantId }),
            }),
        },
    } as never;
}

describe.each([
    [
        'point-of-sale',
        (m: boolean) =>
            new PointOfSaleStreamHandler({ deactivate: vi.fn().mockResolvedValue(m) } as never),
        { isDeleted: true },
    ],
    [
        'contract',
        (m: boolean) =>
            new ContractStreamHandler(
                { deactivateTombstone: vi.fn().mockResolvedValue(m) } as never,
                {} as never,
            ),
        { isDeleted: true },
    ],
    [
        'discount-rule',
        (m: boolean) =>
            new DiscountRuleStreamHandler({
                deactivateTombstone: vi.fn().mockResolvedValue(m),
            } as never),
        { isDeleted: true },
    ],
    [
        'granted-discount',
        (m: boolean) =>
            new GrantedDiscountStreamHandler({ remove: vi.fn().mockResolvedValue(m) } as never),
        { isDeleted: true, version: '5' },
    ],
    [
        'granted-retro-bonus',
        (m: boolean) =>
            new GrantedRetroBonusStreamHandler({ remove: vi.fn().mockResolvedValue(m) } as never),
        { isDeleted: true, version: '5' },
    ],
    [
        'organization',
        (m: boolean) =>
            new OrganizationStreamHandler({
                upsertActiveState: vi.fn().mockResolvedValue(m),
            } as never),
        { isDeleted: true },
    ],
    [
        'counterparty',
        (m: boolean) =>
            new CounterpartyStreamHandler(
                { upsertActiveState: vi.fn().mockResolvedValue(m) } as never,
                { findAdministratorByErpId: vi.fn(), resolveByErpId: vi.fn() } as never,
            ),
        { isDeleted: true },
    ],
] as const)('%s tombstone outcome', (stream, make, payload) => {
    it('is noop with a reason when it matched no row', async () => {
        const outcome = await make(false).apply(ctx, 'e-1', { ...payload });

        expect(outcome).toMatchObject({ kind: 'noop' });
        expect(outcome.kind === 'noop' && outcome.reason).toContain(stream);
    });

    it('is applied when a row existed', async () => {
        expect(await make(true).apply(ctx, 'e-1', { ...payload })).toEqual({ kind: 'applied' });
    });
});

describe.each([
    ['order-changed', OrderChangedStreamHandler, 'handleOrderChanged', 'lines'],
    [
        'order-registration-result',
        OrderRegistrationResultHandler,
        'handleOrderRegistrationResult',
        'reservedLines',
    ],
] as const)('%s with a line lacking productId', (stream, Handler, syncMethod, linesKey) => {
    it('applies the valid lines and records the skipped one as a noop reason', async () => {
        const sync = {
            [syncMethod]: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new Handler(orderConnection('variant-1'), sync as never, {} as never);

        const outcome = await handler.apply(ctx, 'o-1', {
            orderEntityId: 'o-1',
            status: 'ok',
            [linesKey]: [
                { productId: '', reservedQuantity: 1 },
                { productId: 'p-1', reservedQuantity: 2 },
            ],
        });

        expect(sync[syncMethod]).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({ kind: 'noop' });
        expect(outcome.kind === 'noop' && outcome.reason).toContain(
            '1 line(s) lacking a productId',
        );
        expect(outcome.kind === 'noop' && outcome.reason).toContain(stream);
    });

    it('is applied when every line has a productId', async () => {
        const handler = new Handler(
            orderConnection('variant-1'),
            {
                [syncMethod]: vi.fn(),
                isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
            } as never,
            {} as never,
        );

        const outcome = await handler.apply(ctx, 'o-1', {
            orderEntityId: 'o-1',
            [linesKey]: [{ productId: 'p-1', reservedQuantity: 2 }],
        });

        expect(outcome).toEqual({ kind: 'applied' });
    });
});
