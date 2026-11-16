import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    CustomerService,
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
} from '@mivend/plugin-bulk-operations';

import { withAggregateLock } from 'shared';

import { parseCounterpartyMatching, resolveCounterpartyIds } from './counterparty-bulk-matching';
import {
    findCounterpartyTarget,
    isCounterpartyWritable,
    visibleCounterpartyTargets,
} from './counterparty-bulk-targets';
import { CounterpartyPortalAccessService } from './counterparty-portal-access.service';
import { CounterpartyService } from './counterparty.service';

export const PASSWORD_RESET_OPERATION = 'counterparty-password-reset';

const skip = (code: string, message: string, label: string | null): BulkRecordVerdict => ({
    outcome: 'skipped',
    reasonCode: code,
    message,
    label,
});
const applied = (label: string | null): BulkRecordVerdict => ({
    outcome: 'applied',
    reasonCode: null,
    message: null,
    label,
});

// Sends the live portal login a set-password mail; a mail cannot be taken back, so there is no undo.
@Injectable()
export class CounterpartyPasswordResetExecutor implements BulkExecutor, OnModuleInit {
    readonly type = PASSWORD_RESET_OPERATION;
    readonly title = 'Reset passwords';
    readonly description =
        'Send the portal login of many counterparties a mail to set a new password.';
    readonly area = 'customers';
    readonly permission = CustomPermission.ManageCounterpartyPortalAccess.Permission;

    constructor(
        private registry: BulkExecutorRegistry,
        private connection: TransactionalConnection,
        private accessScope: AccessScopeService,
        private portalAccess: CounterpartyPortalAccessService,
        private counterparties: CounterpartyService,
        private customers: CustomerService,
    ) {}

    onModuleInit(): void {
        this.registry.register(this);
    }

    validate(parameters: BulkParameters): BulkParameters {
        if (Object.keys(parameters).length > 0) {
            throw new UserInputError('The password reset takes no parameters');
        }
        return {};
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

    async inspect(ctx: RequestContext, targetId: string): Promise<BulkRecordVerdict> {
        const counterparty = await findCounterpartyTarget(this.connection, ctx, targetId);
        if (!counterparty) return skip('not_found', 'Counterparty not found', null);
        if (!(await isCounterpartyWritable(this.accessScope, ctx, counterparty))) {
            return skip('out_of_scope', 'Outside your scope', null);
        }
        const label = counterparty.shortName;
        const linked = await this.portalAccess.linkedCustomerId(ctx, counterparty.id);
        return linked ? applied(label) : skip('no_login', 'No portal login to reset', label);
    }

    // Under the portal-access lock, so a revoke or a grant cannot change the login mid-send.
    async apply(ctx: RequestContext, targetId: string): Promise<BulkRecordVerdict> {
        const counterparty = await findCounterpartyTarget(this.connection, ctx, targetId);
        if (!counterparty) return skip('not_found', 'Counterparty not found', null);
        const label = counterparty.shortName;
        if (!(await isCounterpartyWritable(this.accessScope, ctx, counterparty))) {
            return skip('out_of_scope', 'Outside your scope', null);
        }
        return withAggregateLock(
            this.connection,
            ctx,
            `portal-access:${counterparty.id}`,
            async txCtx => {
                const customerId = await this.portalAccess.linkedCustomerId(txCtx, counterparty.id);
                const customer = customerId
                    ? await this.customers.findOne(txCtx, customerId)
                    : null;
                if (!customer?.emailAddress)
                    return skip('no_login', 'No portal login to reset', label);
                await this.customers.requestPasswordReset(txCtx, customer.emailAddress);
                return applied(label);
            },
        );
    }

    visibleTargets(ctx: RequestContext, targetIds: string[]): Promise<Set<string>> {
        return visibleCounterpartyTargets(this.connection, this.accessScope, ctx, targetIds);
    }
}
