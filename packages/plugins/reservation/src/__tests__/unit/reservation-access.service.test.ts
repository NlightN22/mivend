import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import type { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { ReservationAccessService } from '../../reservation-access.service';

function service(
    visibleOrder: unknown,
    roleCodes: string[] = [],
): {
    svc: ReservationAccessService;
    andWhere: ReturnType<typeof vi.fn>;
} {
    const andWhere = vi.fn(() => ({ getOne: async () => visibleOrder }));
    const visibility = {
        buildVisibleOrdersQuery: async () => ({ alias: 'o', andWhere }),
    } as unknown as OrderVisibilityService;
    const accessScope = {
        getActorIdentity: async () => ({ roleCodes, branchId: null }),
    } as unknown as AccessScopeService;
    return { svc: new ReservationAccessService(visibility, accessScope), andWhere };
}

const ctx = (manages: boolean): RequestContext =>
    ({ userHasPermissions: () => manages }) as unknown as RequestContext;

describe('ReservationAccessService.findVisibleOrder', () => {
    it('returns an order inside the visible set, filtered by id', async () => {
        const { svc, andWhere } = service({ id: 5 });
        await expect(svc.findVisibleOrder(ctx(false), 5)).resolves.toEqual({ id: 5 });
        expect(andWhere).toHaveBeenCalledWith('o.id = :orderId', { orderId: 5 });
    });

    it('rejects an order outside the scope or unknown as not found', async () => {
        const { svc } = service(null);
        await expect(svc.findVisibleOrder(ctx(false), 9)).rejects.toThrow('Order not found');
    });
});

describe('ReservationAccessService.canReadExtensionLimit', () => {
    it('allows the caller own role', async () => {
        const { svc } = service(null, ['sales']);
        expect(await svc.canReadExtensionLimit(ctx(false), 'sales')).toBe(true);
    });

    it('denies another role without the manage permission', async () => {
        const { svc } = service(null, ['sales']);
        expect(await svc.canReadExtensionLimit(ctx(false), 'director')).toBe(false);
    });

    it('allows any role for a caller managing access control', async () => {
        const { svc } = service(null, []);
        expect(await svc.canReadExtensionLimit(ctx(true), 'director')).toBe(true);
    });
});
