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

export const MANAGER_REASSIGN_OPERATION = 'counterparty-manager-reassign';

const skip = (code: string, message: string, label: string | null): BulkRecordVerdict => ({
    outcome: 'skipped',
    reasonCode: code,
    message,
    label,
});

const isId = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value);

// Parameters are either { administratorId } (the change) or { restore: true } (its undo, where each
// record's input is { from, to }: put `from` back only while `to` is still the manager).
@Injectable()
export class CounterpartyManagerReassignExecutor implements BulkExecutor, OnModuleInit {
    readonly type = MANAGER_REASSIGN_OPERATION;
    readonly title = 'Change manager';
    readonly description = 'Move many counterparties to another responsible manager.';
    readonly area = 'customers';
    readonly permission = CustomPermission.ReassignCounterpartyManager.Permission;

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
        if (!isId(parameters.administratorId)) {
            throw new UserInputError('A target manager is required');
        }
        return { administratorId: parameters.administratorId };
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
        const target = this.targetOf(parameters, input);
        if (!target.ok) return skip(target.code, target.message, label);
        if (target.expectedCurrent && counterparty.assignedManagerId !== target.expectedCurrent) {
            return skip('changed_since', 'The manager was changed after this batch', label);
        }
        if (counterparty.assignedManagerId === target.administratorId) {
            return skip('already_assigned', 'Already assigned to this manager', label);
        }
        const scope = await this.accessScope.resolveCounterpartyScope(ctx);
        if (!(await this.assignment.isTargetAssignable(ctx, scope, target.administratorId))) {
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
        const target = this.targetOf(parameters, input);
        if (!target.ok) return skip(target.code, target.message, label);
        try {
            const { previous, changed } = await this.assignment.reassignOne(
                ctx,
                counterparty.id,
                target.administratorId,
                target.expectedCurrent,
            );
            if (!changed)
                return skip('already_assigned', 'Already assigned to this manager', label);
            return {
                outcome: 'applied',
                reasonCode: null,
                message: null,
                label,
                undoData: previous ? { from: previous, to: target.administratorId } : null,
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
                return skip('changed_since', 'The manager was changed after this batch', label);
            }
            throw e;
        }
    }

    visibleTargets(ctx: RequestContext, targetIds: string[]): Promise<Set<string>> {
        return visibleCounterpartyTargets(this.connection, this.accessScope, ctx, targetIds);
    }

    private targetOf(
        parameters: BulkParameters,
        input: BulkParameters | null,
    ):
        | { ok: true; administratorId: string; expectedCurrent?: string }
        | { ok: false; code: string; message: string } {
        if (parameters.restore !== true) {
            return { ok: true, administratorId: String(parameters.administratorId) };
        }
        if (!isId(input?.from) || !isId(input?.to)) {
            return {
                ok: false,
                code: 'nothing_to_restore',
                message: 'There was no previous manager',
            };
        }
        return { ok: true, administratorId: input.from, expectedCurrent: input.to };
    }
}
