import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import { ApprovalRequestQueryService } from '../../approval-request-query.service';
import { ApprovalStepService } from '../../approval-step.service';
import { WorkflowDefinitionService } from '../../workflow-definition.service';

const ctx = {} as RequestContext;

function repoReturning(n: number) {
    const find = vi.fn(async () => Array.from({ length: n }, () => ({ stepsJson: '[]' })));
    const connection = { getRepository: () => ({ find }) } as unknown as TransactionalConnection;
    return { find, connection };
}

function queryService(rowCount: number) {
    const qb = {
        select: () => qb,
        where: () => qb,
        andWhere: () => qb,
        orderBy: () => qb,
        take: vi.fn(() => qb),
        limit: vi.fn(() => qb),
        getMany: vi.fn(async () => Array.from({ length: rowCount }, () => ({}))),
        getRawMany: vi.fn(async () =>
            Array.from({ length: rowCount }, (_, i) => ({ orderId: String(i) })),
        ),
    };
    const connection = { getRepository: () => ({ createQueryBuilder: () => qb }) };
    const scope = { apply: vi.fn(async () => undefined) };
    const service = new ApprovalRequestQueryService(
        connection as never,
        {} as never,
        {} as never,
        scope as never,
    );
    return { service, qb, scope };
}

describe('approval reads are bounded', () => {
    it('steps of a request: the ceiling passes, one over throws', async () => {
        const ok = repoReturning(1000);
        const steps = await new ApprovalStepService(ok.connection).findSteps(ctx, 1);
        expect(steps).toHaveLength(1000);
        expect(ok.find).toHaveBeenCalledWith(expect.objectContaining({ take: 1001 }));
        const over = repoReturning(1001);
        await expect(new ApprovalStepService(over.connection).findSteps(ctx, 1)).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });

    it('workflow definitions: one over the ceiling throws', async () => {
        const over = repoReturning(1001);
        await expect(
            new WorkflowDefinitionService(over.connection).getAllDefinitions(ctx),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('pending order ids: 5000 pass after the scope, 5001 throws', async () => {
        const ok = queryService(5000);
        await expect(ok.service.findPendingPriceAdjustmentOrderIds(ctx)).resolves.toHaveLength(5000);
        expect(ok.qb.limit).toHaveBeenCalledWith(5001);
        expect(ok.scope.apply).toHaveBeenCalled();
        const over = queryService(5001);
        await expect(over.service.findPendingPriceAdjustmentOrderIds(ctx)).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });

    it('requests of one order: the ceiling passes, one over throws', async () => {
        const ok = queryService(1000);
        await expect(ok.service.findPriceAdjustmentRequestsForOrder(ctx, 7)).resolves.toHaveLength(1000);
        const over = queryService(1001);
        await expect(over.service.findPriceAdjustmentRequestsForOrder(ctx, 7)).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});
