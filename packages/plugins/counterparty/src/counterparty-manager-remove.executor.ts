import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';
import {
    BulkExecutorRegistry,
    type BulkExecutor,
    type BulkParameters,
    type BulkRecordVerdict,
    type BulkUndoPlan,
} from '@mivend/plugin-bulk-operations';

import { parseCounterpartyMatching, resolveCounterpartyIds } from './counterparty-bulk-matching';
import {
    findCounterpartyTarget,
    isCounterpartyWritable,
    visibleCounterpartyTargets,
} from './counterparty-bulk-targets';
import {
    CounterpartyManagerAssignmentService,
    ManagerChangedSinceError,
} from './counterparty-manager-assignment.service';
import { CounterpartyService } from './counterparty.service';

export const MANAGER_REMOVE_OPERATION = 'counterparty-manager-remove';

const skip = (code: string, message: string, label: string | null): BulkRecordVerdict => ({
    outcome: 'skipped',
    reasonCode: code,
    message,
    label,
});

const isId = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value);

// Parameters are { confirmed: true } (the removal) or { restore: true } (its undo, where each record's
// input is { from, to: null }: put `from` back only while the counterparty is still without a manager).
@Injectable()
export class CounterpartyManagerRemoveExecutor implements BulkExecutor, OnModuleInit {
    readonly type = MANAGER_REMOVE_OPERATION;
    readonly title = 'Remove manager';
    readonly description =
        'Leave counterparties without a primary manager; they follow the ERP manager again.';
    readonly area = 'customers';
    readonly permission = CustomPermission.RemoveCounterpartyManager.Permission;

    constructor(
        private registry: BulkExecutorRegistry,
        private connection: TransactionalConnection,
        private accessScope: AccessScopeService,
        private assignment: CounterpartyManagerAssignmentService,
        private counterparties: CounterpartyService,
    ) {}

    onModuleInit(): void {
        this.registry.register(this);
    }

    validate(parameters: BulkParameters): BulkParameters {
        if (parameters.restore === true) return { restore: true };
        if (parameters.confirmed !== true) {
            throw new UserInputError('Removing managers must be confirmed');
        }
        return { confirmed: true };
    }

    undoPlan(parameters: BulkParameters): BulkUndoPlan | null {
        return parameters.restore === true
            ? null
            : { type: this.type, parameters: { restore: true } };
    }

    resolveMatching(
        ctx: RequestContext,
        matching: Record<string, unknown>,
        limit: number,
    ): Promise<string[]> {
        return resolveCounterpartyIds(
            this.counterparties,
            ctx,
            parseCounterpartyMatching(matching),
            limit,
        );
    }

    async inspect(
        ctx: RequestContext,
        targetId: string,
        parameters: BulkParameters,
        input: BulkParameters | null,
    ): Promise<BulkRecordVerdict> {
        const counterparty = await findCounterpartyTarget(this.connection, ctx, targetId);
        if (!counterparty) return skip('not_found', 'Counterparty not found', null);
        const label = counterparty.shortName;
        if (!(await isCounterpartyWritable(this.accessScope, ctx, counterparty))) {
            return skip('out_of_scope', 'Outside your scope', label);
        }
        const restoreTo = this.restoreTarget(parameters, input);
        if (restoreTo === undefined) {
            return skip('nothing_to_restore', 'There was no previous manager', label);
        }
        if (restoreTo === null) {
            return counterparty.assignedManagerId
                ? { outcome: 'applied', reasonCode: null, message: null, label }
                : skip('no_manager', 'Already without a manager', label);
        }
        if (counterparty.assignedManagerId) {
            return skip('changed_since', 'A manager was assigned after this batch', label);
        }
        const scope = await this.accessScope.resolveCounterpartyScope(ctx);
        if (!(await this.assignment.isTargetAssignable(ctx, scope, restoreTo))) {
            return skip('target_not_allowed', 'The manager is not in your branch', label);
        }
        return { outcome: 'applied', reasonCode: null, message: null, label };
    }

    async apply(
        ctx: RequestContext,
        targetId: string,
        parameters: BulkParameters,
        input: BulkParameters | null,
    ): Promise<BulkRecordVerdict> {
        const counterparty = await findCounterpartyTarget(this.connection, ctx, targetId);
        if (!counterparty) return skip('not_found', 'Counterparty not found', null);
        const label = counterparty.shortName;
        const restoreTo = this.restoreTarget(parameters, input);
        if (restoreTo === undefined) {
            return skip('nothing_to_restore', 'There was no previous manager', label);
        }
        try {
            const { previous, changed } = await this.assignment.reassignOne(
                ctx,
                counterparty.id,
                restoreTo,
                restoreTo === null ? undefined : null,
            );
            if (!changed) return skip('no_manager', 'Already without a manager', label);
            return {
                outcome: 'applied',
                reasonCode: null,
                message: null,
                label,
                undoData: restoreTo === null && previous ? { from: previous, to: null } : null,
            };
        } catch (e) {
            if (e instanceof ForbiddenError) {
                return skip(
                    'out_of_scope',
                    'Outside your scope or the manager is not allowed',
                    label,
                );
            }
            if (e instanceof ManagerChangedSinceError) {
                return skip('changed_since', 'A manager was assigned after this batch', label);
            }
            throw e;
        }
    }

    visibleTargets(ctx: RequestContext, targetIds: string[]): Promise<Set<string>> {
        return visibleCounterpartyTargets(this.connection, this.accessScope, ctx, targetIds);
    }

    // null = remove; an id = restore that manager; undefined = a restore with no recorded manager.
    private restoreTarget(
        parameters: BulkParameters,
        input: BulkParameters | null,
    ): string | null | undefined {
        if (parameters.restore !== true) return null;
        return isId(input?.from) ? input.from : undefined;
    }
}
