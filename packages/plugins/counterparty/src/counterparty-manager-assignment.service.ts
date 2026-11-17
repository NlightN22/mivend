import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import {
    AccessScope,
    AccessScopeService,
    BranchAssignmentService,
    TeamAdministratorService,
} from '@mivend/plugin-access-control';
import { VersioningService } from '@mivend/plugin-versioning';
import { withAggregateLock } from 'shared';

import { CounterpartyVersionService } from './counterparty-version.service';
import { Counterparty } from './entities/counterparty.entity';

export class ManagerChangedSinceError extends Error {}

// Changes Counterparty.assignedManagerId — CustomPermission.ReassignCounterpartyManager holders only.
@Injectable()
export class CounterpartyManagerAssignmentService {
    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
        private teamAdministratorService: TeamAdministratorService,
        private versioningService: VersioningService,
        private branchAssignment: BranchAssignmentService,
        private versions: CounterpartyVersionService,
    ) {}

    async reassignManager(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorId: ID,
    ): Promise<Counterparty> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const counterparty = await repo.findOne({ where: { id: counterpartyId } });
        if (!counterparty) throw new UserInputError(`Counterparty not found: id=${counterpartyId}`);

        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        this.accessScopeService.assertCounterpartyWritableInScope(scope, counterparty);
        await this.assertTargetAdministratorAssignable(ctx, scope, administratorId);

        const previousManagerId = counterparty.assignedManagerId;
        counterparty.assignedManagerId = String(administratorId);
        await repo.update(counterparty.id, { assignedManagerId: counterparty.assignedManagerId });
        if (previousManagerId !== counterparty.assignedManagerId) {
            await this.versions.bump(ctx, counterparty.id);
        }
        const saved = counterparty;
        await this.recordReassignment(ctx, saved.id, previousManagerId, saved.assignedManagerId);
        await this.branchAssignment.assignCounterparties(ctx, { ids: [String(saved.id)] });
        return saved;
    }

    // One record of a bulk batch: re-validates scope and target under the row lock, returns the old manager.
    // A null target leaves the counterparty without a primary manager; a null expectedCurrent requires that state.
    async reassignOne(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorId: ID | null,
        expectedCurrent?: string | null,
    ): Promise<{ previous: string | null; changed: boolean }> {
        return withAggregateLock(
            this.connection,
            ctx,
            `counterparty-manager:${counterpartyId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, Counterparty);
                const counterparty = await repo.findOne({ where: { id: counterpartyId } });
                if (!counterparty) {
                    throw new UserInputError(`Counterparty not found: id=${counterpartyId}`);
                }
                const scope = await this.accessScopeService.resolveCounterpartyScope(txCtx);
                this.accessScopeService.assertCounterpartyWritableInScope(scope, counterparty);
                if (
                    administratorId !== null &&
                    !(await this.isTargetAssignable(txCtx, scope, administratorId))
                ) {
                    throw new ForbiddenError();
                }
                const previous = counterparty.assignedManagerId;
                if (expectedCurrent !== undefined && previous !== expectedCurrent) {
                    throw new ManagerChangedSinceError();
                }
                const next = administratorId === null ? null : String(administratorId);
                if (previous === next) return { previous, changed: false };
                await repo.update(counterparty.id, { assignedManagerId: next });
                await this.versions.bump(txCtx, counterparty.id);
                await this.recordReassignment(txCtx, counterparty.id, previous, next);
                await this.branchAssignment.assignCounterparties(txCtx, {
                    ids: [String(counterparty.id)],
                });
                return { previous, changed: true };
            },
        );
    }

    // A live administrator; for a department head also one of their own branch (never a deactivated one).
    async isTargetAssignable(
        ctx: RequestContext,
        scope: AccessScope,
        administratorId: ID,
    ): Promise<boolean> {
        if (scope.kind === 'department') {
            if (scope.branchId == null) return false;
            return (
                (await this.teamAdministratorService.findInBranch(
                    ctx,
                    scope.branchId,
                    administratorId,
                )) !== undefined
            );
        }
        return (await this.teamAdministratorService.findLive(ctx, administratorId)) !== undefined;
    }

    // Branch is the only real scope axis (docs/access-control.md) — departmentId never gates this.
    private async assertTargetAdministratorAssignable(
        ctx: RequestContext,
        scope: AccessScope,
        administratorId: ID,
    ): Promise<void> {
        if (scope.kind !== 'department') return;
        if (scope.branchId == null) throw new ForbiddenError();
        const target = await this.teamAdministratorService.findInBranch(
            ctx,
            scope.branchId,
            administratorId,
        );
        if (!target) throw new ForbiddenError();
    }

    private async recordReassignment(
        ctx: RequestContext,
        entityId: ID,
        from: string | null,
        to: string | null,
    ): Promise<void> {
        await this.versioningService.recordChange(ctx, {
            entityName: 'Counterparty',
            entityId,
            action: 'update',
            changedFields: { assignedManagerId: { from, to } },
        });
    }
}
