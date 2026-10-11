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
        service: new PackagingPolicyService({ resolveEffective } as never, tradingPoints as never),
        resolveEffective,
    };
}

describe('PackagingPolicyService', () => {
    it("uses the customer's preferred trading point branch before the order's own branch", async () => {
        const { service } = makeService({
            preferredBranchId: 'branch-a',
            settingsByBranchId: { 'branch-a': true, 'branch-b': false },
        });
        expect(await service.isPackagesOnly(ctx, 'customer-1', 'branch-b')).toBe(true);
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
});
