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

import { Counterparty } from './entities/counterparty.entity';
import { findLinkedInnDuplicate, normalizeInn } from './counterparty-inn-guard';
import { applyCounterpartyVisibilityScope } from './counterparty-visibility';
import {
    CounterpartyPortalAccessService,
    PortalAccessPreconditionError,
    type PortalAccessAction,
} from './counterparty-portal-access.service';

export const PORTAL_ACCESS_OPERATION = 'counterparty-portal-access';
const ID_CHUNK = 5000;

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

// Grant or revoke customer portal access for many counterparties, one record at a time.
@Injectable()
export class CounterpartyPortalAccessExecutor implements BulkExecutor, OnModuleInit {
    readonly type = PORTAL_ACCESS_OPERATION;
    readonly title = 'Activate customers';
    readonly description =
        'Grant or revoke customer portal access for many counterparties at once.';
    readonly area = 'customers';
    readonly permission = CustomPermission.ManageCounterpartyPortalAccess.Permission;

    constructor(
        private registry: BulkExecutorRegistry,
        private connection: TransactionalConnection,
        private accessScope: AccessScopeService,
        private portalAccess: CounterpartyPortalAccessService,
    ) {}

    onModuleInit(): void {
        this.registry.register(this);
    }

    validate(parameters: BulkParameters): BulkParameters {
        const action = parameters.action;
        if (action !== 'activate' && action !== 'deactivate') {
            throw new UserInputError(`Invalid portal access action: ${String(action)}`);
        }
        return { action };
    }

    // A revoke cannot be reversed: the customer is soft-deleted and a re-grant would create a new account.
    undoPlan(parameters: BulkParameters): BulkUndoPlan | null {
        return parameters.action === 'activate'
            ? { type: this.type, parameters: { action: 'deactivate' } }
            : null;
    }

    async inspect(
        ctx: RequestContext,
        targetId: string,
        parameters: BulkParameters,
    ): Promise<BulkRecordVerdict> {
        const counterparty = await this.find(ctx, targetId);
        if (!counterparty) return skip('not_found', 'Counterparty not found', null);
        if (!(await this.writable(ctx, counterparty))) {
            return skip('out_of_scope', 'Outside your scope', null);
        }
        const label = counterparty.shortName;
        const linked = await this.portalAccess.linkedCustomerId(ctx, counterparty.id);
        if ((parameters.action as PortalAccessAction) === 'deactivate') {
            return linked
                ? applied(label)
                : skip('no_portal_access', 'No portal access to revoke', label);
        }
        // Same order as the service's checks, so the review and the run give the same reason.
        if (!counterparty.isActive) return skip('inactive', 'Inactive in the ERP', label);
        if (!counterparty.phone || !counterparty.officialEmail) {
            return skip('no_contact', 'Phone or e-mail is missing', label);
        }
        if (linked) return skip('already_active', 'Portal access already granted', label);
        const inn = normalizeInn(counterparty.inn);
        if (!inn) return skip('no_inn', 'INN is missing in the ERP', label);
        const twin = await findLinkedInnDuplicate(this.connection, ctx, counterparty.id, inn);
        if (twin)
            return skip(
                'inn_duplicate',
                'INN is used by another counterparty with portal access',
                label,
            );
        return applied(label);
    }

    async apply(
        ctx: RequestContext,
        targetId: string,
        parameters: BulkParameters,
    ): Promise<BulkRecordVerdict> {
        const counterparty = await this.find(ctx, targetId);
        if (!counterparty) return skip('not_found', 'Counterparty not found', null);
        const label = counterparty.shortName;
        try {
            if ((parameters.action as PortalAccessAction) === 'deactivate') {
                await this.portalAccess.revoke(ctx, counterparty.id);
            } else {
                await this.portalAccess.activate(ctx, counterparty.id);
            }
            return applied(label);
        } catch (e) {
            if (e instanceof ForbiddenError)
                return skip('out_of_scope', 'Outside your scope', null);
            if (e instanceof PortalAccessPreconditionError) return skip(e.code, e.message, label);
            throw e;
        }
    }

    async visibleTargets(ctx: RequestContext, targetIds: string[]): Promise<Set<string>> {
        const numeric = [...new Set(targetIds.filter(id => /^\d+$/.test(id)))];
        const visible = new Set<string>();
        for (let i = 0; i < numeric.length; i += ID_CHUNK) {
            const qb = this.connection
                .getRepository(ctx, Counterparty)
                .createQueryBuilder('c')
                .select('c.id', 'id')
                .where('c.id IN (:...ids)', { ids: numeric.slice(i, i + ID_CHUNK) });
            const rows = await (
                await applyCounterpartyVisibilityScope(this.accessScope, ctx, qb)
            ).getRawMany<{ id: number }>();
            for (const row of rows) visible.add(String(row.id));
        }
        return visible;
    }

    private async find(ctx: RequestContext, targetId: string): Promise<Counterparty | null> {
        if (!/^\d+$/.test(targetId)) return null;
        return this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: targetId } });
    }

    private async writable(ctx: RequestContext, counterparty: Counterparty): Promise<boolean> {
        try {
            await this.accessScope.assertCounterpartyWritable(ctx, counterparty);
            return true;
        } catch (e) {
            if (e instanceof ForbiddenError) return false;
            throw e;
        }
    }
}
