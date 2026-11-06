import { describe, expect, it, vi } from 'vitest';
import {
    Channel,
    PaymentMethod,
    PERMISSIONS_METADATA_KEY,
    ShippingMethod,
    TaxCategory,
    TaxRate,
    Zone,
} from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { CustomPermission } from '../../custom-permission';
import { DEFAULT_ROLES } from '../../default-roles';
import { SystemHealthResolver } from '../../system-health.resolver';
import { SystemHealthService } from '../../system-health.service';

interface Counts {
    zone: number;
    taxCategory: number;
    taxRate: number;
    shipping: number;
    payment: number;
    defaultTaxZone: object | null;
}

const HEALTHY: Counts = {
    zone: 1,
    taxCategory: 1,
    taxRate: 1,
    shipping: 1,
    payment: 1,
    defaultTaxZone: { id: 1 },
};

const countArgs: unknown[] = [];
const countIn =
    (n: number) =>
    async (arg: unknown): Promise<number> => {
        countArgs.push(arg);
        return n;
    };

function serviceWith(counts: Counts): SystemHealthService {
    const repos = new Map<unknown, object>([
        [Zone, { count: async () => counts.zone }],
        [TaxCategory, { count: async () => counts.taxCategory }],
        [TaxRate, { count: async () => counts.taxRate }],
        [ShippingMethod, { count: countIn(counts.shipping) }],
        [PaymentMethod, { count: countIn(counts.payment) }],
        [Channel, { findOne: async () => ({ defaultTaxZone: counts.defaultTaxZone }) }],
    ]);
    const connection = { getRepository: (_ctx: unknown, entity: unknown) => repos.get(entity) };
    return new SystemHealthService(connection as unknown as TransactionalConnection);
}

const ctx = { channelId: 1 } as RequestContext;

describe('SystemHealthService.checklist', () => {
    it('reports every item ok when all six conditions hold', async () => {
        const items = await serviceWith(HEALTHY).checklist(ctx);
        expect(items).toHaveLength(6);
        expect(items.every(item => item.ok)).toBe(true);
    });

    it('counts shipping and payment methods only in the request channel', async () => {
        countArgs.length = 0;
        await serviceWith(HEALTHY).checklist(ctx);
        expect(countArgs).toHaveLength(2);
        for (const arg of countArgs) {
            expect(arg).toMatchObject({ where: { channels: { id: 1 } } });
        }
    });

    it('flags only the default tax zone when everything else exists', async () => {
        const items = await serviceWith({ ...HEALTHY, defaultTaxZone: null }).checklist(ctx);
        expect(items.filter(item => !item.ok).map(item => item.id)).toEqual(['default-tax-zone']);
        expect(items.find(item => item.id === 'default-tax-zone')?.detail).toContain('Channels');
    });

    it('reports every item missing when nothing exists', async () => {
        const items = await serviceWith({
            zone: 0,
            taxCategory: 0,
            taxRate: 0,
            shipping: 0,
            payment: 0,
            defaultTaxZone: null,
        }).checklist(ctx);
        expect(items.every(item => !item.ok)).toBe(true);
    });
});

describe('SystemHealthResolver', () => {
    it('is gated by exactly ManageAccessControl, the permission the page checks', () => {
        const gate = Reflect.getMetadata(
            PERMISSIONS_METADATA_KEY,
            SystemHealthResolver.prototype.systemHealthChecklist,
        );
        expect(gate).toEqual([CustomPermission.ManageAccessControl.Permission]);
    });

    it('is reachable by the general director without any Vendure ReadSettings', () => {
        const role = DEFAULT_ROLES.find(r => r.code === 'general-director');
        expect(role?.permissions).toContain('ManageAccessControl');
        expect(role?.permissions).not.toContain('ReadSettings');
    });

    it('delegates to the service', async () => {
        const checklist = vi.fn().mockResolvedValue([]);
        const resolver = new SystemHealthResolver({ checklist } as unknown as SystemHealthService);
        await resolver.systemHealthChecklist(ctx);
        expect(checklist).toHaveBeenCalledWith(ctx);
    });
});
