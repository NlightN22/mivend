import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Permission } from '@vendure/common/lib/generated-types';
import {
    AdministratorService,
    Logger,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Brackets, SelectQueryBuilder } from 'typeorm';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';
import { ApprovalListOptions, loggerCtx } from './types';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { applyPriceTypeGate } from './payload-price-type-gate';

@Injectable()
export class ApprovalRequestQueryService {
    constructor(
        private connection: TransactionalConnection,
        private workflowDefinitionService: WorkflowDefinitionService,
        private administratorService: AdministratorService,
    ) {}

    // Aggregated for the manager portal dashboard (see docs/ai/manager-portal-pages/01-dashboard.md)
    // so the page fires one query instead of separately paginating + counting.
    async getMySummary(
        ctx: RequestContext,
        recentLimit: number,
        allowedPriceTypeCodes?: string[],
    ): Promise<{ pendingCount: number; recent: ApprovalRequest[] }> {
        const adminId = await this.getAdministratorId(ctx);
        if (!adminId) {
            return { pendingCount: 0, recent: [] };
        }
        const repo = this.connection.getRepository(ctx, ApprovalRequest);
        const own = (): SelectQueryBuilder<ApprovalRequest> => {
            const qb = repo
                .createQueryBuilder('request')
                .where('request.requestedByAdministratorId = :adminId', { adminId });
            if (allowedPriceTypeCodes) applyPriceTypeGate(qb, allowedPriceTypeCodes);
            return qb;
        };
        const [pendingCount, recent] = await Promise.all([
            own().andWhere('request.status = :pending', { pending: 'pending' }).getCount(),
            own().orderBy('request.createdAt', 'DESC').take(recentLimit).getMany(),
        ]);
        return { pendingCount, recent };
    }

    // Only priceAdjustmentApproval payloads reference a specific order;
    // discountGrantApproval and creditTermApproval are standing-policy requests, not per-order.
    async findPendingPriceAdjustmentOrderIds(ctx: RequestContext): Promise<string[]> {
        const repo = this.connection.getRepository(ctx, ApprovalRequest);
        const rows = await repo.find({
            where: { requestType: 'priceAdjustmentApproval', status: 'pending' },
        });
        const orderIds = new Set<string>();
        for (const row of rows) {
            try {
                const payload = JSON.parse(row.payload) as { orderId?: string };
                if (payload.orderId) orderIds.add(payload.orderId);
            } catch {
                Logger.warn(`ApprovalRequest ${row.id} has invalid JSON payload`, loggerCtx);
            }
        }
        return [...orderIds];
    }

    // Returns all statuses, not just pending: the page shows history, not outstanding items.
    // Not scoped by department/branch: callers only pass orders already loaded via visibleOrders.
    async findPriceAdjustmentRequestsForOrder(
        ctx: RequestContext,
        orderId: ID,
    ): Promise<ApprovalRequest[]> {
        const repo = this.connection.getRepository(ctx, ApprovalRequest);
        const rows = await repo.find({
            where: { requestType: 'priceAdjustmentApproval' },
            order: { createdAt: 'DESC' },
        });
        return rows.filter(row => {
            try {
                const payload = JSON.parse(row.payload) as { orderId?: string };
                return payload.orderId === String(orderId);
            } catch {
                Logger.warn(`ApprovalRequest ${row.id} has invalid JSON payload`, loggerCtx);
                return false;
            }
        });
    }

    // DiscountRule rows exist only after approval, so pending/rejected entries must come from here.
    // Not scoped by department/branch: discount grants are company-wide policy by price type.
    async findByRequestType(
        ctx: RequestContext,
        requestType: string,
        options: ApprovalListOptions = {},
    ): Promise<PaginatedList<ApprovalRequest>> {
        const qb = this.connection
            .getRepository(ctx, ApprovalRequest)
            .createQueryBuilder('request')
            .where('request.requestType = :requestType', { requestType });
        this.applyListFilters(qb, options);
        qb.orderBy('request.createdAt', 'DESC');

        const totalItems = await qb.getCount();
        const items = await qb
            .take(options.take ?? 50)
            .skip(options.skip ?? 0)
            .getMany();
        return { items, totalItems };
    }

    // canDecideStep() depends only on the caller and the step's permission, so the eligible pairs
    // come from the small fixed workflow set and go into SQL, not an in-code filter over all rows.
    private async getEligibleStepPairs(
        ctx: RequestContext,
    ): Promise<{ requestType: string; stepIndex: number }[]> {
        const definitions = await this.workflowDefinitionService.getAllDefinitions(ctx);
        const pairs: { requestType: string; stepIndex: number }[] = [];
        for (const definition of definitions) {
            definition.steps.forEach((step, stepIndex) => {
                if (ctx.userHasPermissions([step.requiredPermission as Permission])) {
                    pairs.push({ requestType: definition.requestType, stepIndex });
                }
            });
        }
        return pairs;
    }

    // Must match canDecideStep(): inbox visibility and decide() eligibility can never drift apart.
    // Current-step permission pairs OR an escalated-to-me correlated subquery on ApprovalStep.
    private buildAwaitingDecisionBracket(
        ctx: RequestContext,
        pairs: { requestType: string; stepIndex: number }[],
        adminId: string | null,
    ): Brackets {
        return new Brackets(outer => {
            outer.where('request.status = :awaitingStatus', { awaitingStatus: 'pending' });
            outer.andWhere(
                new Brackets(eligible => {
                    let hasAny = false;
                    pairs.forEach((pair, i) => {
                        const clause = `(request.requestType = :eligibleType${i} AND request.currentStepIndex = :eligibleStep${i})`;
                        const params = {
                            [`eligibleType${i}`]: pair.requestType,
                            [`eligibleStep${i}`]: pair.stepIndex,
                        };
                        if (hasAny) eligible.orWhere(clause, params);
                        else eligible.where(clause, params);
                        hasAny = true;
                    });
                    if (adminId) {
                        // Must use connection.getRepository(), not qb.subQuery().from(ApprovalStep): that class is
                        // hard-wired to the real entity, so tests cannot swap in the connectionShim double.
                        const escalatedToMeSubQuery = this.connection
                            .getRepository(ctx, ApprovalStep)
                            .createQueryBuilder('step')
                            .select('step.approvalRequestId')
                            .where('step.stepIndex = request.currentStepIndex')
                            .andWhere('step.escalatedToAdministratorId = :escalatedAdminId')
                            .getQuery();
                        const clause = `CAST(request.id AS TEXT) IN (${escalatedToMeSubQuery})`;
                        if (hasAny) eligible.orWhere(clause, { escalatedAdminId: adminId });
                        else eligible.where(clause, { escalatedAdminId: adminId });
                        hasAny = true;
                    }
                    if (!hasAny) eligible.where('1 = 0');
                }),
            );
        });
    }

    private applyListFilters(
        qb: SelectQueryBuilder<ApprovalRequest>,
        options: ApprovalListOptions,
    ): void {
        if (options.allowedPriceTypeCodes) applyPriceTypeGate(qb, options.allowedPriceTypeCodes);
        if (options.requestType) {
            qb.andWhere('request.requestType = :filterRequestType', {
                filterRequestType: options.requestType,
            });
        }
        if (options.statuses && options.statuses.length > 0) {
            qb.andWhere('request.status IN (:...filterStatuses)', {
                filterStatuses: options.statuses,
            });
        } else if (options.status) {
            qb.andWhere('request.status = :filterStatus', { filterStatus: options.status });
        }
        if (options.search) {
            qb.andWhere('CAST(request.id AS TEXT) ILIKE :filterSearch', {
                filterSearch: `%${options.search}%`,
            });
        }
    }

    // Same eligibility rule decide() enforces, pushed into SQL so cost does not grow with the
    // total number of pending requests company-wide.
    async findAwaitingMyDecision(
        ctx: RequestContext,
        options: ApprovalListOptions = {},
    ): Promise<PaginatedList<ApprovalRequest>> {
        const adminId = await this.getAdministratorId(ctx);
        const pairs = await this.getEligibleStepPairs(ctx);
        const qb = this.connection
            .getRepository(ctx, ApprovalRequest)
            .createQueryBuilder('request');
        qb.where(this.buildAwaitingDecisionBracket(ctx, pairs, adminId));
        this.applyListFilters(qb, options);
        qb.orderBy('request.createdAt', 'DESC');

        const totalItems = await qb.getCount();
        const items = await qb
            .take(options.take ?? 50)
            .skip(options.skip ?? 0)
            .getMany();
        return { items, totalItems };
    }

    // History, not a to-do list: every status is included, so no status filter is applied.
    // Union of submitted, decided or escalated-on, and awaiting-my-decision requests.
    async findAllInvolving(
        ctx: RequestContext,
        options: ApprovalListOptions = {},
    ): Promise<PaginatedList<ApprovalRequest>> {
        const adminId = await this.getAdministratorId(ctx);
        if (!adminId) return { items: [], totalItems: 0 };

        const pairs = await this.getEligibleStepPairs(ctx);
        const qb = this.connection
            .getRepository(ctx, ApprovalRequest)
            .createQueryBuilder('request');

        const stepRepo = this.connection.getRepository(ctx, ApprovalStep);
        qb.where(
            new Brackets(outer => {
                outer.where('request.requestedByAdministratorId = :involvedAdminId', {
                    involvedAdminId: adminId,
                });
                const decidedByMeSubQuery = stepRepo
                    .createQueryBuilder('step')
                    .select('step.approvalRequestId')
                    .where('step.approverAdministratorId = :involvedAdminId')
                    .getQuery();
                outer.orWhere(`CAST(request.id AS TEXT) IN (${decidedByMeSubQuery})`, {
                    involvedAdminId: adminId,
                });
                // Escalated-to-me on ANY step, regardless of status or stepIndex, so past escalations stay visible.
                // Deliberately broader than buildAwaitingDecisionBracket, which checks only the current step.
                const escalatedToMeAnyStepSubQuery = stepRepo
                    .createQueryBuilder('step')
                    .select('step.approvalRequestId')
                    .where('step.escalatedToAdministratorId = :involvedAdminId')
                    .getQuery();
                outer.orWhere(`CAST(request.id AS TEXT) IN (${escalatedToMeAnyStepSubQuery})`, {
                    involvedAdminId: adminId,
                });
                outer.orWhere(this.buildAwaitingDecisionBracket(ctx, pairs, adminId));
            }),
        );
        this.applyListFilters(qb, options);
        qb.orderBy('request.createdAt', 'DESC');

        const totalItems = await qb.getCount();
        const items = await qb
            .take(options.take ?? 50)
            .skip(options.skip ?? 0)
            .getMany();
        return { items, totalItems };
    }

    private async getAdministratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }
}
