import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { getPageAndCount } from 'shared';
import { NotificationService } from '@mivend/plugin-notification';

import { ErpReconciliationIssue } from './entities/erp-reconciliation-issue.entity';
import type {
    ErpReconciliationIssueType,
    ErpReconciliationTrigger,
} from './entities/erp-reconciliation-issue.entity';
import { classifyDiscrepancy } from './reconciliation-decision';

export interface OpenErpReconciliationIssueListOptions {
    take?: number;
    skip?: number;
}

const OPEN_ISSUES_MAX_TAKE = 100;

// Persistence of ErpReconciliationIssue rows; plain class so ReconciliationService keeps its constructor.
export class ReconciliationIssues {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly notificationService: NotificationService,
    ) {}

    async findOpen(
        ctx: RequestContext,
        options?: OpenErpReconciliationIssueListOptions,
    ): Promise<PaginatedList<ErpReconciliationIssue>> {
        const take = Math.min(options?.take ?? 20, OPEN_ISSUES_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, ErpReconciliationIssue)
            .createQueryBuilder('issue')
            .where('issue.status = :status', { status: 'open' })
            .orderBy('issue.detectedAt', 'DESC')
            .addOrderBy('issue.id', 'DESC');

        return getPageAndCount(qb, take, skip);
    }

    async resolve(
        ctx: RequestContext,
        input: { id: string; resolution: string },
    ): Promise<ErpReconciliationIssue> {
        const repo = this.connection.getRepository(ctx, ErpReconciliationIssue);
        const issue = await repo.findOneOrFail({ where: { id: input.id } });
        issue.status = 'resolved';
        issue.resolution = input.resolution;
        const saved = await repo.save(issue);
        await this.notificationService.resolveBySource(
            ctx,
            { sourceType: 'erp-reconciliation', sourceId: saved.aggregateType },
            input.resolution,
        );
        return saved;
    }

    // recordIssue only runs on mismatch, so a resolved drift would leave a stale open issue forever.
    // Safe to auto-close here: both counts were just re-verified equal, so nothing is guessed.
    async autoResolveIfOpen(ctx: RequestContext, aggregateType: string): Promise<void> {
        const repo = this.connection.getRepository(ctx, ErpReconciliationIssue);
        const existing = await repo.findOne({ where: { aggregateType, status: 'open' } });
        if (!existing) return;
        const resolution = 'Auto-resolved: counts matched on a later reconciliation run.';
        existing.status = 'resolved';
        existing.resolution = resolution;
        await repo.save(existing);
        await this.notificationService.resolveBySource(
            ctx,
            { sourceType: 'erp-reconciliation', sourceId: aggregateType },
            resolution,
        );
    }

    // Persistent drift is re-detected on every scheduled run; update the open issue per aggregateType
    // in place instead of adding a row daily; a new row only after the prior one is resolved.
    async recordIssue(
        ctx: RequestContext,
        params: {
            aggregateType: string;
            issueType?: ErpReconciliationIssueType;
            ourCount: number;
            theirActiveCount: number;
            triggeredBy: ErpReconciliationTrigger;
            triggeredByAdministratorId: string | null;
        },
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, ErpReconciliationIssue);
        const existing = await repo.findOne({
            where: { aggregateType: params.aggregateType, status: 'open' },
        });

        const fields = {
            issueType:
                params.issueType ?? classifyDiscrepancy(params.ourCount, params.theirActiveCount),
            aggregateType: params.aggregateType,
            ourCount: params.ourCount,
            theirActiveCount: params.theirActiveCount,
            detectedAt: new Date(),
            status: 'open' as const,
            resolution: null,
            triggeredBy: params.triggeredBy,
            triggeredByAdministratorId: params.triggeredByAdministratorId,
        };

        if (existing) {
            await repo.save(Object.assign(existing, fields));
        } else {
            await repo.save(new ErpReconciliationIssue(fields));
        }

        // Scheduled runs have no administrator to notify; a re-detected open issue is not re-announced.
        if (!existing && params.triggeredByAdministratorId) {
            await this.notificationService.create(ctx, {
                recipientType: 'administrator',
                recipientId: params.triggeredByAdministratorId,
                kind: 'warning',
                sourceType: 'erp-reconciliation',
                sourceId: params.aggregateType,
                title: 'ERP reconciliation drift detected',
                message: `${fields.issueType} for ${params.aggregateType} (ours=${params.ourCount}, theirs=${params.theirActiveCount})`,
            });
        }
    }
}
