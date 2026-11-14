import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import { loadAllRequestsOfType } from '../../discount-registry-requests';

const ctx = {} as RequestContext;
const rows = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: from + i }));

function service(total: number) {
    return {
        findByRequestType: vi.fn(
            async (
                _ctx: RequestContext,
                _type: string,
                options: { take?: number; skip?: number },
            ) => ({
                items: rows(
                    options.skip ?? 0,
                    Math.min(options.take ?? 0, total - (options.skip ?? 0)),
                ),
                totalItems: total,
            }),
        ),
    };
}

describe('loadAllRequestsOfType', () => {
    it('reads every request across the 200-row pages', async () => {
        const svc = service(450);
        const all = await loadAllRequestsOfType(ctx, svc as never, 'discountGrantApproval');
        expect(all).toHaveLength(450);
        expect(svc.findByRequestType).toHaveBeenCalledTimes(3);
    });

    it('fails loudly instead of dropping requests past the ceiling', async () => {
        const svc = service(10001);
        await expect(
            loadAllRequestsOfType(ctx, svc as never, 'discountGrantApproval'),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('accepts exactly the ceiling', async () => {
        const svc = service(1000);
        const all = await loadAllRequestsOfType(ctx, svc as never, 'discountGrantApproval', 1000);
        expect(all).toHaveLength(1000);
    });
});
