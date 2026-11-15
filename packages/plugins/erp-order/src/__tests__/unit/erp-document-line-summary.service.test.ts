import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ErpDocumentLineSummaryService } from '../../erp-document-list/erp-document-line-summary.service';

const ctx = { languageCode: 'en' } as RequestContext;

function service(results: unknown[][]): {
    svc: ErpDocumentLineSummaryService;
    query: ReturnType<typeof vi.fn>;
} {
    const query = vi.fn();
    for (const r of results) query.mockResolvedValueOnce(r);
    const connection = { getRepository: () => ({ query }) } as unknown as TransactionalConnection;
    return { svc: new ErpDocumentLineSummaryService(connection), query };
}

describe('ErpDocumentLineSummaryService', () => {
    it('reads nothing for an empty page', async () => {
        const { svc, query } = service([]);
        expect((await svc.summarize(ctx, ['t'], [])).size).toBe(0);
        expect(query).not.toHaveBeenCalled();
    });

    it('resolves a whole page of product names in two queries, deduped and capped', async () => {
        const { svc, query } = service([
            [
                { documentId: 1, lineCount: 6, productIds: ['p1', 'p1', 'p2', 'p3', 'p4'] },
                { documentId: 2, lineCount: 1, productIds: ['missing'] },
            ],
            [
                { externalId: 'p1', name: 'One' },
                { externalId: 'p2', name: 'Two' },
                { externalId: 'p3', name: 'Three' },
                { externalId: 'p4', name: 'Four' },
            ],
        ]);
        const result = await svc.summarize(ctx, ['a', 'b'], [1, 2]);
        expect(query).toHaveBeenCalledTimes(2);
        expect(result.get(1)).toEqual({ lineCount: 6, productNames: ['One', 'Two', 'Three'] });
        expect(result.get(2)).toEqual({ lineCount: 1, productNames: [] });
    });
});
