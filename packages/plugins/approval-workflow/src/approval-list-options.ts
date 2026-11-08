import { SelectQueryBuilder } from 'typeorm';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalListOptions } from './types';

const MAX_TAKE = 200;
const DEFAULT_TAKE = 50;

const SORT_COLUMNS: Record<string, string> = {
    id: 'request.id',
    requestType: 'request.requestType',
    status: 'request.status',
    createdAt: 'request.createdAt',
    decidedAt: 'request.decidedAt',
};

function pageWindow(options: ApprovalListOptions): { take: number; skip: number } {
    const take = Math.trunc(options.take ?? DEFAULT_TAKE);
    const skip = Math.trunc(options.skip ?? 0);
    return {
        take: Number.isFinite(take) ? Math.min(Math.max(take, 0), MAX_TAKE) : DEFAULT_TAKE,
        skip: Number.isFinite(skip) ? Math.max(skip, 0) : 0,
    };
}

// Unknown fields fall back to newest first; the id tie-break keeps pages stable.
export function applyListSort(
    qb: SelectQueryBuilder<ApprovalRequest>,
    options: ApprovalListOptions,
): void {
    const column = SORT_COLUMNS[options.sortField ?? ''] ?? SORT_COLUMNS.createdAt;
    const dir = options.sortDir === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(column, dir);
    if (column !== SORT_COLUMNS.id) qb.addOrderBy(SORT_COLUMNS.id, dir);
}

// take 0 is a count-only request; TypeORM would treat a 0 limit as no limit.
export async function runPage(
    qb: SelectQueryBuilder<ApprovalRequest>,
    options: ApprovalListOptions,
): Promise<{ items: ApprovalRequest[]; totalItems: number }> {
    const { take, skip } = pageWindow(options);
    const totalItems = await qb.getCount();
    if (take === 0) return { items: [], totalItems };
    return { items: await qb.take(take).skip(skip).getMany(), totalItems };
}
