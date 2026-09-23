import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AdministratorService,
    ForbiddenError,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { AccessScope, AccessScopeService } from '@mivend/plugin-access-control';
import { VersioningService } from '@mivend/plugin-versioning';

import { CounterpartyListFilter } from './counterparty-list-filter';
import { CounterpartyService } from './counterparty.service';
import { Counterparty } from './entities/counterparty.entity';
import { loggerCtx } from './types';

// Keeps one bulk call's row locks, history writes and bind parameters bounded (#136).
export const MAX_BULK_REASSIGN = 2000;

// Changes Counterparty.assignedManagerId — CustomPermission.ReassignCounterpartyManager holders only.
@Injectable()
export class CounterpartyManagerAssignmentService {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
        private accessScopeService: AccessScopeService,
        private administratorService: AdministratorService,
        private versioningService: VersioningService,
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
        const saved = await repo.save(counterparty);
        await this.recordReassignment(ctx, saved.id, previousManagerId, saved.assignedManagerId);
        return saved;
    }

    // Filter-shaped bulk variant; expectedCount rejects the call if the match set drifted.
    async reassignManagerByFilter(
        ctx: RequestContext,
        filter: CounterpartyListFilter,
        administratorId: ID,
        expectedCount: number,
    ): Promise<number> {
        if (expectedCount > MAX_BULK_REASSIGN) {
            throw new UserInputError(
                `Cannot reassign more than ${MAX_BULK_REASSIGN} counterparties at once — narrow the filter`,
            );
        }
        const qb = await this.counterpartyService.visibleFilteredQb(ctx, filter);
        const counterparties = await qb.take(MAX_BULK_REASSIGN + 1).getMany();
        if (counterparties.length !== expectedCount) {
            throw new UserInputError(
                `Filter now matches ${counterparties.length} counterparties, expected ${expectedCount} — refresh the list and retry`,
            );
        }
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        for (const counterparty of counterparties) {
            this.accessScopeService.assertCounterpartyWritableInScope(scope, counterparty);
        }
        await this.assertTargetAdministratorAssignable(ctx, scope, administratorId);

        const to = String(administratorId);
        const changed = await this.updateChangedManagers(
            ctx,
            counterparties.map(c => c.id),
            to,
        );
        for (const { id, previous } of changed) {
            await this.recordReassignment(ctx, id, previous, to);
        }
        Logger.verbose(
            `Reassigned ${changed.length} counterparties to administrator=${to}`,
            loggerCtx,
        );
        return changed.length;
    }

    // Row-locks and reads the previous value in the same statement, so concurrent writers can't
    // skew the recorded "from" or the already-assigned skip.
    private async updateChangedManagers(
        ctx: RequestContext,
        ids: ID[],
        to: string,
    ): Promise<Array<{ id: ID; previous: string | null }>> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const table = `"${repo.metadata.tableName}"`;
        // TypeORM's postgres driver returns [rows, rowCount] for UPDATE.
        const [rows]: [Array<{ id: ID; previous: string | null }>, number] = await repo.query(
            `UPDATE ${table} c SET "assignedManagerId" = $2
             FROM (SELECT id, "assignedManagerId" AS previous FROM ${table}
                   WHERE id = ANY($1) FOR UPDATE) old
             WHERE c.id = old.id AND old.previous IS DISTINCT FROM $2
             RETURNING c.id, old.previous`,
            [ids, to],
        );
        return rows;
    }

    // Branch is the only real scope axis (docs/access-control.md) — departmentId never gates this.
    private async assertTargetAdministratorAssignable(
        ctx: RequestContext,
        scope: AccessScope,
        administratorId: ID,
    ): Promise<void> {
        if (scope.kind !== 'department') return;
        const target = await this.administratorService.findOne(ctx, administratorId);
        const targetBranchId = (target?.customFields as { branchId?: string | null } | undefined)
            ?.branchId;
        if (!target || scope.branchId == null || targetBranchId !== scope.branchId) {
            throw new ForbiddenError();
        }
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
