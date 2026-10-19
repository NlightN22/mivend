import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Permission } from '@vendure/common/lib/generated-types';
import {
    Administrator,
    AdministratorService,
    ForbiddenError,
    Logger,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { Brackets, IsNull, SelectQueryBuilder } from 'typeorm';
import { createActor } from 'xstate';

import { buildApprovalMachine, stepIndexFromStateValue } from './approval-machine';
import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';
import {
    ApprovalConcurrencyError,
    ApprovalListOptions,
    ApprovalStepDecision,
    WorkflowStepDefinition,
    loggerCtx,
} from './types';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { applyPriceTypeGate } from './payload-price-type-gate';

@Injectable()
export class ApprovalRequestService {
    constructor(
        private connection: TransactionalConnection,
        private workflowDefinitionService: WorkflowDefinitionService,
        private administratorService: AdministratorService,
    ) {}

    async createRequest(
        ctx: RequestContext,
        requestType: string,
        payload: Record<string, unknown>,
    ): Promise<ApprovalRequest> {
        const definition = await this.workflowDefinitionService.getDefinition(ctx, requestType);
        const machine = buildApprovalMachine(definition.steps);
        const actor = createActor(machine);
        actor.start();
        const snapshot = actor.getPersistedSnapshot();
        actor.stop();

        const adminId = await this.getAdministratorId(ctx);
        const repo = this.connection.getRepository(ctx, ApprovalRequest);
        const request = repo.create({
            requestType,
            payload: JSON.stringify(payload),
            status: 'pending',
            currentStepIndex: 0,
            requestedByAdministratorId: adminId,
            xstateSnapshot: JSON.stringify(snapshot),
        });
        const saved = await repo.save(request);
        Logger.verbose(`Created ApprovalRequest ${saved.id} (${requestType})`, loggerCtx);
        return saved;
    }

    // Actor is rehydrated from the persisted ApprovalRequest row on each call; never reused.
    // The row is the only source of truth; the XState actor is a stateless transition function.
    async decide(
        ctx: RequestContext,
        requestId: ID,
        decision: ApprovalStepDecision,
        comment?: string,
    ): Promise<ApprovalRequest> {
        const repo = this.connection.getRepository(ctx, ApprovalRequest);
        const request = await repo.findOneOrFail({ where: { id: requestId } });
        if (request.status !== 'pending') {
            throw new UserInputError(`ApprovalRequest ${requestId} is already "${request.status}"`);
        }
        const definition = await this.workflowDefinitionService.getDefinition(
            ctx,
            request.requestType,
        );
        const stepDef = definition.steps[request.currentStepIndex];
        if (!stepDef) {
            throw new UserInputError(`Invalid currentStepIndex on ApprovalRequest ${requestId}`);
        }

        const stepRepo = this.connection.getRepository(ctx, ApprovalStep);
        let stepRow = await stepRepo.findOne({
            where: { approvalRequestId: String(request.id), stepIndex: request.currentStepIndex },
        });

        const adminId = await this.getAdministratorId(ctx);
        if (!this.canDecideStep(ctx, stepDef, stepRow, adminId)) {
            throw new ForbiddenError();
        }

        const actor = createActor(buildApprovalMachine(definition.steps), {
            snapshot: request.xstateSnapshot ? JSON.parse(request.xstateSnapshot) : undefined,
        });
        actor.start();
        actor.send({ type: decision === 'approved' ? 'APPROVE' : 'REJECT' });
        const nextValue = String(actor.getSnapshot().value);
        const nextSnapshot = actor.getPersistedSnapshot();
        actor.stop();

        const nextStepIndex = stepIndexFromStateValue(nextValue);
        const nextStatus =
            nextValue === 'approved' || nextValue === 'rejected' ? nextValue : 'pending';
        const nextDecidedAt = nextStatus !== 'pending' ? new Date() : null;

        // @VersionColumn does not reject a stale repo.save() by itself;
        // only an explicit `WHERE version = :expected` guard in the UPDATE enforces optimistic locking.
        const updateResult = await repo
            .createQueryBuilder()
            .update()
            .set({
                currentStepIndex: nextStepIndex ?? request.currentStepIndex,
                status: nextStatus,
                xstateSnapshot: JSON.stringify(nextSnapshot),
                decidedAt: nextDecidedAt,
                version: () => 'version + 1',
            })
            .where('id = :id AND version = :version', { id: request.id, version: request.version })
            .execute();

        if (updateResult.affected === 0) {
            throw new ApprovalConcurrencyError(String(requestId));
        }

        // Only the call that won the race above gets to write the step-decision audit row.
        if (stepRow) {
            stepRow.decision = decision;
            stepRow.comment = comment ?? null;
            stepRow.decidedAt = new Date();
            stepRow.approverAdministratorId = adminId;
        } else {
            stepRow = stepRepo.create({
                approvalRequestId: String(request.id),
                stepIndex: request.currentStepIndex,
                requiredRole: stepDef.role,
                decision,
                comment: comment ?? null,
                decidedAt: new Date(),
                approverAdministratorId: adminId,
            });
        }
        await stepRepo.save(stepRow);

        request.currentStepIndex = nextStepIndex ?? request.currentStepIndex;
        request.status = nextStatus;
        request.xstateSnapshot = JSON.stringify(nextSnapshot);
        request.decidedAt = nextDecidedAt;
        request.version += 1;
        Logger.verbose(
            `ApprovalRequest ${requestId} decided "${decision}" -> ${request.status}`,
            loggerCtx,
        );
        return request;
    }

    // Only the request's original creator may escalate, and only to an administrator whose
    // role is in the current step's escalatesTo list — never to an arbitrary person.
    async escalate(
        ctx: RequestContext,
        requestId: ID,
        escalateToAdministratorId: ID,
    ): Promise<ApprovalRequest> {
        const repo = this.connection.getRepository(ctx, ApprovalRequest);
        const request = await repo.findOneOrFail({ where: { id: requestId } });
        if (request.status !== 'pending') {
            throw new UserInputError(`ApprovalRequest ${requestId} is already "${request.status}"`);
        }
        const adminId = await this.getAdministratorId(ctx);
        if (!adminId || String(adminId) !== String(request.requestedByAdministratorId)) {
            throw new ForbiddenError();
        }
        const definition = await this.workflowDefinitionService.getDefinition(
            ctx,
            request.requestType,
        );
        const stepDef = definition.steps[request.currentStepIndex];
        if (!stepDef) {
            throw new UserInputError(`Invalid currentStepIndex on ApprovalRequest ${requestId}`);
        }
        // Not AdministratorService.findOne: since Vendure 3.7.3 it hides admins whose roles the requester can't grant.
        const targetAdmin = await this.connection.getRepository(ctx, Administrator).findOne({
            where: { id: escalateToAdministratorId, deletedAt: IsNull() },
            relations: ['user', 'user.roles'],
        });
        if (!targetAdmin) {
            throw new UserInputError('Administrator not found');
        }
        const targetRoleCodes = targetAdmin.user.roles.map(role => role.code);
        if (!stepDef.escalatesTo.some(role => targetRoleCodes.includes(role))) {
            throw new UserInputError(
                `Administrator's roles do not match the escalatesTo list for step ${request.currentStepIndex}`,
            );
        }

        const stepRepo = this.connection.getRepository(ctx, ApprovalStep);
        let stepRow = await stepRepo.findOne({
            where: { approvalRequestId: String(request.id), stepIndex: request.currentStepIndex },
        });
        if (!stepRow) {
            stepRow = stepRepo.create({
                approvalRequestId: String(request.id),
                stepIndex: request.currentStepIndex,
                requiredRole: stepDef.role,
            });
        }
        stepRow.wasEscalated = true;
        stepRow.escalatedByAdministratorId = String(adminId);
        stepRow.escalatedToAdministratorId = String(escalateToAdministratorId);
        await stepRepo.save(stepRow);
        Logger.verbose(
            `ApprovalRequest ${requestId} escalated to administrator ${escalateToAdministratorId}`,
            loggerCtx,
        );
        return request;
    }

    private canDecideStep(
        ctx: RequestContext,
        stepDef: WorkflowStepDefinition,
        stepRow: ApprovalStep | null,
        adminId: string | null,
    ): boolean {
        if (ctx.userHasPermissions([stepDef.requiredPermission as Permission])) {
            return true;
        }
        if (stepRow?.wasEscalated && stepRow.escalatedToAdministratorId && adminId) {
            return String(stepRow.escalatedToAdministratorId) === String(adminId);
        }
        return false;
    }

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

    // Current step's definition for a request — used by the ApprovalRequest.escalatesTo/
    // totalSteps resolver fields (see approval-workflow.resolver.ts).
    async getCurrentStepDefinition(
        ctx: RequestContext,
        request: ApprovalRequest,
    ): Promise<{ stepDef: WorkflowStepDefinition | undefined; totalSteps: number }> {
        const definition = await this.workflowDefinitionService.getDefinition(
            ctx,
            request.requestType,
        );
        return {
            stepDef: definition.steps[request.currentStepIndex],
            totalSteps: definition.steps.length,
        };
    }

    private async getAdministratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }
}
