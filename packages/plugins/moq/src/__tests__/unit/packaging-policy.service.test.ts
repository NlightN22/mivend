import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PackagingPolicyService } from '../../packaging-policy.service';

const ctx = {} as RequestContext;

function makeService(options: {
    preferredBranchId: string | null;
    settingsByBranchId: Record<string, boolean>;
}): { service: PackagingPolicyService; resolveEffective: ReturnType<typeof vi.fn> } {
    const resolveEffective = vi.fn(async (_ctx: unknown, branchId: string | null) =>
        branchId && branchId in options.settingsByBranchId
            ? { packagesOnly: options.settingsByBranchId[branchId] }
            : null,
    );
    const tradingPoints = {
        getPreferredForCustomer: vi.fn(async () =>
            options.preferredBranchId ? { servicingBranchId: options.preferredBranchId } : null,
        ),
        resolveServicingBranchId: vi.fn(
            async (_c: unknown, tp: { servicingBranchId: string | null }) => tp.servicingBranchId,
        ),
    };
    return {
        service: new PackagingPolicyService(
            { resolveEffective } as never,
            tradingPoints as never,
            {} as never,
        ),
        resolveEffective,
    };
}

describe('PackagingPolicyService', () => {
    it("uses the order's own branch even when the customer's preferred trading point changed", async () => {
        const { service } = makeService({
            preferredBranchId: 'branch-a',
            settingsByBranchId: { 'branch-a': true, 'branch-b': false },
        });
        expect(await service.isPackagesOnly(ctx, 'customer-1', 'branch-b')).toBe(false);
    });

    it('uses the preferred trading point branch before the order is placed', async () => {
        const { service } = makeService({
            preferredBranchId: 'branch-a',
            settingsByBranchId: { 'branch-a': true },
        });
        expect(await service.isPackagesOnly(ctx, 'customer-1', null)).toBe(true);
    });

    it('falls back to the order branch when the customer has no preferred trading point', async () => {
        const { service } = makeService({
            preferredBranchId: null,
            settingsByBranchId: { 'branch-b': true },
        });
        expect(await service.isPackagesOnly(ctx, 'customer-1', 'branch-b')).toBe(true);
    });

    it('is false when no branch settings resolve at all', async () => {
        const { service } = makeService({ preferredBranchId: null, settingsByBranchId: {} });
        expect(await service.isPackagesOnly(ctx, undefined)).toBe(false);
    });

    it("does not let another branch's flag leak into the resolved one", async () => {
        const { service } = makeService({
            preferredBranchId: 'branch-a',
            settingsByBranchId: { 'branch-a': false, 'branch-b': true },
        });
        expect(await service.isPackagesOnly(ctx, 'customer-1')).toBe(false);
    });

    it('isMultiplicityEnforced reads the branch cart policy: on only when enabled and blocking', async () => {
        const policyFor = (policy: { enabled: boolean; consequence: string }) => {
            const resolve = vi.fn(async () => policy);
            const service = new PackagingPolicyService(
                { resolveEffective: vi.fn(async () => null) } as never,
                {} as never,
                { resolve } as never,
            );
            return { service, resolve };
        };
        const on = policyFor({ enabled: true, consequence: 'block' });
        expect(await on.service.isMultiplicityEnforced(ctx, undefined, 'branch-a')).toBe(true);
        expect(on.resolve).toHaveBeenCalledWith(ctx, 'order.multiplicity', 'cart', 'branch-a');
        expect(
            await policyFor({
                enabled: false,
                consequence: 'block',
            }).service.isMultiplicityEnforced(ctx, undefined, 'branch-a'),
        ).toBe(false);
        expect(
            await policyFor({ enabled: true, consequence: 'warn' }).service.isMultiplicityEnforced(
                ctx,
                undefined,
                'branch-a',
            ),
        ).toBe(false);
    });
});

describe('PackagingPolicyService.requiredMultiples', () => {
    const variant = (
        id: string,
        multiplicity: number | null,
        unitRatioToBase: number | null = null,
    ) => ({ id, customFields: { multiplicity, unitRatioToBase } }) as never;

    function build(packagesOnly: boolean, enforced: boolean) {
        const resolveEffective = vi.fn(async () => ({ packagesOnly }));
        const getPreferredForCustomer = vi.fn(async () => ({ servicingBranchId: 'branch-a' }));
        const resolve = vi.fn(async () => ({ enabled: enforced, consequence: 'block' }));
        const service = new PackagingPolicyService(
            { resolveEffective } as never,
            {
                getPreferredForCustomer,
                resolveServicingBranchId: async (_c: unknown, tp: { servicingBranchId: string }) =>
                    tp.servicingBranchId,
            } as never,
            { resolve } as never,
        );
        return { service, resolveEffective, getPreferredForCustomer, resolve };
    }

    const mixed = [
        variant('1', null),
        variant('2', 6),
        variant('3', 1, 12),
        variant('4', 6, 12),
        variant('5', 4),
    ];

    it('equals the per-variant answer for every settings combination', async () => {
        for (const packagesOnly of [true, false]) {
            for (const enforced of [true, false]) {
                for (const assumeEnforced of [true, false]) {
                    const { service } = build(packagesOnly, enforced);
                    const batch = await service.requiredMultiples(
                        ctx,
                        mixed,
                        'customer-1',
                        null,
                        assumeEnforced,
                    );
                    for (const v of mixed) {
                        const single = await build(packagesOnly, enforced).service.requiredMultiple(
                            ctx,
                            v,
                            'customer-1',
                            null,
                            assumeEnforced,
                        );
                        expect(batch.get(String((v as { id: string }).id))).toBe(single);
                    }
                }
            }
        }
    });

    it('resolves branch, settings and policy once for the whole order', async () => {
        const { service, resolveEffective, getPreferredForCustomer, resolve } = build(false, true);
        await service.requiredMultiples(ctx, mixed, 'customer-1');
        expect(getPreferredForCustomer).toHaveBeenCalledTimes(1);
        expect(resolveEffective).toHaveBeenCalledTimes(1);
        expect(resolve).toHaveBeenCalledTimes(1);
    });

    it('looks nothing up when no variant has a rule', async () => {
        const { service, resolveEffective, resolve } = build(false, true);
        const steps = await service.requiredMultiples(
            ctx,
            [variant('1', null), variant('2', 1)],
            'c',
        );
        expect([...steps.values()]).toEqual([1, 1]);
        expect(resolveEffective).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
    });

    it('does not swallow a failing settings lookup', async () => {
        const { service, resolveEffective } = build(false, true);
        resolveEffective.mockRejectedValueOnce(new Error('settings down'));
        await expect(service.requiredMultiples(ctx, mixed, 'customer-1')).rejects.toThrow(
            'settings down',
        );
    });
});
