import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ErpImportService } from '../../erp-import.service';
import type { BatchImportBody } from '../../types';

const CATEGORY_HANDLER_INDEX = 8;
const HANDLER_COUNT = 17;

function buildService(): {
    service: ErpImportService;
    categoryHandler: {
        upsert: ReturnType<typeof vi.fn>;
        recomputeFilters: ReturnType<typeof vi.fn>;
    };
} {
    const categoryHandler = { upsert: vi.fn(), recomputeFilters: vi.fn() };
    const importRunService = {
        findByExchangeId: vi.fn(async () => null),
        createPending: vi.fn(async () => ({ id: 'run-1' })),
        markProcessing: vi.fn(),
        complete: vi.fn(),
        toResult: vi.fn(() => ({})),
    };
    const handlers = Array.from({ length: HANDLER_COUNT }, (_, i) =>
        i === CATEGORY_HANDLER_INDEX ? categoryHandler : { upsert: vi.fn() },
    );
    const Ctor = ErpImportService as unknown as new (...args: unknown[]) => ErpImportService;
    return { service: new Ctor(importRunService, ...handlers.slice(1)), categoryHandler };
}

const ctx = {} as RequestContext;
const category = (
    erpId: string,
    parentErpId: string | null,
): BatchImportBody['records'][number] => ({
    type: 'category' as const,
    data: { erpId, name: erpId, parentErpId },
});

describe('ErpImportService category filter recompute', () => {
    it('recomputes subtree filters once after a batch that contains categories', async () => {
        const { service, categoryHandler } = buildService();
        const body = {
            exchangeId: 'ex-1',
            records: [category('p', null), category('c', 'p')],
        } as BatchImportBody;
        await service.processBatch(ctx, body);
        expect(categoryHandler.upsert).toHaveBeenCalledTimes(2);
        expect(categoryHandler.recomputeFilters).toHaveBeenCalledTimes(1);
    });

    it('does not recompute for a batch without categories', async () => {
        const { service, categoryHandler } = buildService();
        await service.processBatch(ctx, { exchangeId: 'ex-2', records: [] } as BatchImportBody);
        expect(categoryHandler.recomputeFilters).not.toHaveBeenCalled();
    });
});
