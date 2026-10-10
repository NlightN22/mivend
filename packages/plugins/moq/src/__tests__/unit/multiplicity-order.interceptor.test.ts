import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Injector, Order, ProductVariant, RequestContext } from '@vendure/core';

import { PackagingPolicyService } from '../../packaging-policy.service';
import { MultiplicityOrderInterceptor } from '../../multiplicity-order.interceptor';

function createVariant(
    multiplicity: number | null | undefined,
    unitRatioToBase?: number | null,
): ProductVariant {
    return { customFields: { multiplicity, unitRatioToBase } } as unknown as ProductVariant;
}

function createOrder(branchId: string | null = null, customerId: string | null = null): Order {
    return { customFields: { branchId }, customerId } as unknown as Order;
}

describe('MultiplicityOrderInterceptor', () => {
    let interceptor: MultiplicityOrderInterceptor;
    let resolveEffective: ReturnType<typeof vi.fn>;
    let getPreferredForCustomer: ReturnType<typeof vi.fn>;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        interceptor = new MultiplicityOrderInterceptor();
        resolveEffective = vi.fn(async () => null);
        // No customer on the order by default (guest cart) — falls through to
        // order.customFields.branchId, same as before this fix existed.
        getPreferredForCustomer = vi.fn(async () => null);
        // init() only needs injector.get() to resolve some object with hydrate()/translate()/
        // resolveEffective/getPreferredForCustomer — exact token matching isn't under test here,
        // just that valid/invalid quantities are judged correctly.
        interceptor.init({
            get: (token: unknown) => {
                if (typeof token === 'function' && token.name === 'PackagingPolicyService') {
                    return new PackagingPolicyService(
                        { resolveEffective } as never,
                        {
                            getPreferredForCustomer,
                            resolveServicingBranchId: async (
                                _c: unknown,
                                tp: { servicingBranchId: string | null },
                            ) => tp.servicingBranchId,
                        } as never,
                    );
                }
                return {
                    hydrate: vi.fn(async () => undefined),
                    translate: vi.fn(() => ({ name: 'Test Variant' })),
                };
            },
        } as unknown as Injector);
    });

    it('passes a quantity that is a multiple of multiplicity', async () => {
        const result = await interceptor.willAddItemToOrder(ctx, createOrder(), {
            productVariant: createVariant(4),
            quantity: 8,
        });
        expect(result).toBeUndefined();
    });

    it('rejects a quantity that is not a multiple of multiplicity', async () => {
        const result = await interceptor.willAddItemToOrder(ctx, createOrder(), {
            productVariant: createVariant(4),
            quantity: 5,
        });
        expect(result).toContain('multiples of 4');
    });

    it.each([null, undefined, 0, -1, 1])(
        'treats multiplicity=%s as no constraint',
        async multiplicity => {
            const result = await interceptor.willAddItemToOrder(ctx, createOrder(), {
                productVariant: createVariant(multiplicity),
                quantity: 7,
            });
            expect(result).toBeUndefined();
        },
    );

    it('applies the same check to willAdjustOrderLine', async () => {
        const result = await interceptor.willAdjustOrderLine(ctx, createOrder(), {
            orderLine: { productVariant: createVariant(3) } as never,
            quantity: 4,
        });
        expect(result).toContain('multiples of 3');
    });

    // Issue #103: branch-conditional packaging enforcement.
    it('enforces unitRatioToBase as the effective multiple when packagesOnly is true', async () => {
        resolveEffective.mockResolvedValue({ packagesOnly: true });
        const result = await interceptor.willAddItemToOrder(ctx, createOrder('branch-wholesale'), {
            productVariant: createVariant(null, 6),
            quantity: 5,
        });
        expect(result).toContain('multiples of 6');
    });

    it('enforces whole packages for a ratio below 1 (0.9 -> multiples of 9 base units)', async () => {
        resolveEffective.mockResolvedValue({ packagesOnly: true });
        const bad = await interceptor.willAddItemToOrder(ctx, createOrder('branch-wholesale'), {
            productVariant: createVariant(null, 0.9),
            quantity: 1,
        });
        expect(bad).toContain('multiples of 9');
        const ok = await interceptor.willAddItemToOrder(ctx, createOrder('branch-wholesale'), {
            productVariant: createVariant(null, 0.9),
            quantity: 9,
        });
        expect(ok).toBeUndefined();
    });

    it('allows piece-level quantities when packagesOnly is false, regardless of unitRatioToBase', async () => {
        resolveEffective.mockResolvedValue({ packagesOnly: false });
        const result = await interceptor.willAddItemToOrder(ctx, createOrder('branch-retail'), {
            productVariant: createVariant(null, 6),
            quantity: 1,
        });
        expect(result).toBeUndefined();
    });

    it('allows piece-level quantities when no BranchSettings resolves at all (fallback)', async () => {
        resolveEffective.mockResolvedValue(null);
        const result = await interceptor.willAddItemToOrder(ctx, createOrder(), {
            productVariant: createVariant(null, 6),
            quantity: 1,
        });
        expect(result).toBeUndefined();
    });

    it('ignores unitRatioToBase entirely when unset (base/piece unit sold)', async () => {
        resolveEffective.mockResolvedValue({ packagesOnly: true });
        const result = await interceptor.willAddItemToOrder(ctx, createOrder('branch-wholesale'), {
            productVariant: createVariant(null, null),
            quantity: 1,
        });
        expect(result).toBeUndefined();
        expect(resolveEffective).not.toHaveBeenCalled();
    });

    // Audit finding (mivend#103): branchId must come from the customer's preferred TradingPoint,
    // not order.customFields.branchId — that field is unset until placement, so before this fix
    // this check silently fell back to the global default branch's settings during cart editing.
    it('resolves the branch from the preferred TradingPoint, not order.customFields.branchId', async () => {
        getPreferredForCustomer.mockResolvedValue({ servicingBranchId: 'branch-wholesale' });
        resolveEffective.mockImplementation(async (_ctx: unknown, branchId: string | null) =>
            branchId === 'branch-wholesale' ? { packagesOnly: true } : { packagesOnly: false },
        );

        // order.customFields.branchId is null (pre-placement) — only the TradingPoint lookup
        // should determine the branch.
        const result = await interceptor.willAddItemToOrder(ctx, createOrder(null, 'cust-1'), {
            productVariant: createVariant(null, 6),
            quantity: 5,
        });

        expect(getPreferredForCustomer).toHaveBeenCalledWith(ctx, 'cust-1');
        expect(result).toContain('multiples of 6');
    });

    it('plain multiplicity enforcement keeps working unchanged when unitRatioToBase is also set but allowed', async () => {
        resolveEffective.mockResolvedValue({ packagesOnly: false });
        const result = await interceptor.willAddItemToOrder(ctx, createOrder('branch-retail'), {
            productVariant: createVariant(4, 6),
            quantity: 5,
        });
        expect(result).toContain('multiples of 4');
    });
});
