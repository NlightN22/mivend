import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Permission } from '@vendure/common/lib/generated-types';
import {
    AdministratorService,
    ForbiddenError,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { createActor } from 'xstate';

import { buildApprovalMachine, stepIndexFromStateValue } from './approval-machine';
import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';
import {
    ApprovalConcurrencyError,
    ApprovalStepDecision,
    WorkflowStepDefinition,
    loggerCtx,
} from './types';
import { WorkflowDefinitionService } from './workflow-definition.service';

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

    // Rehydrates a fresh actor from the persisted snapshot on every call — never keeps a
    // long-lived actor across requests. The ApprovalRequest row is the single source of
    // truth; the XState actor is a stateless transition function invoked once per decision.
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

        // This guarded UPDATE is what actually enforces optimistic locking. TypeORM's
        // @VersionColumn does NOT reject a plain repo.save() of a stale in-memory entity by
        // itself — only an explicit `WHERE version = :expected` guard does (verified against
        // this project's actual TypeORM version via the concurrency integration test; a
        // bare repo.save() let two concurrent decide() calls both succeed).
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
        const targetAdmin = await this.administratorService.findOne(
            ctx,
            escalateToAdministratorId,
            ['user.roles'],
        );
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

    private async getAdministratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }
}
