import type { RequestContext } from '@vendure/core';
import { ApprovalRequest, ApprovalRequestQueryService } from '@mivend/plugin-approval-workflow';
import { KEYSET_CEILING, QueryTooLargeError } from 'shared';

// The query service caps a page at 200 rows, so every request is read page by page; past the ceiling the backfill fails.
const PAGE_SIZE = 200;

export async function loadAllRequestsOfType(
    ctx: RequestContext,
    service: Pick<ApprovalRequestQueryService, 'findByRequestType'>,
    requestType: string,
    ceiling: number = KEYSET_CEILING,
): Promise<ApprovalRequest[]> {
    const all: ApprovalRequest[] = [];
    for (;;) {
        const { items, totalItems } = await service.findByRequestType(ctx, requestType, {
            take: PAGE_SIZE,
            skip: all.length,
        });
        if (totalItems > ceiling) throw new QueryTooLargeError(ceiling);
        all.push(...items);
        if (items.length === 0 || all.length >= totalItems) return all;
    }
}
