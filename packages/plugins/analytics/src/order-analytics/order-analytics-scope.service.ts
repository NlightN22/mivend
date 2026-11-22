import { Injectable } from '@nestjs/common';
import { Administrator, RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { getManyBounded } from 'shared';

export const MAX_VISIBLE_CUSTOMERS = 20_000;
const MAX_VISIBLE_MANAGERS = 5_000;

interface AdministratorCustomFields {
    erpId?: string | null;
}

// What the viewer may see, as ERP ids for the analytics service; null means no restriction.
@Injectable()
export class OrderAnalyticsScopeService {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly accessScopeService: AccessScopeService,
        private readonly connection: TransactionalConnection,
    ) {}

    visibleCustomerErpIds(ctx: RequestContext): Promise<string[] | null> {
        return this.counterpartyService.visibleErpIds(ctx, MAX_VISIBLE_CUSTOMERS);
    }

    // Same people the team directory shows: all, the viewer's own department plus grants, or only the viewer.
    async visibleManagerErpIds(ctx: RequestContext): Promise<string[] | null> {
        const scope = await this.accessScopeService.resolveTeamVisibilityScope(ctx);
        if (scope.kind === 'all') return null;
        const qb = this.connection
            .getRepository(ctx, Administrator)
            .createQueryBuilder('a')
            .where('a.deletedAt IS NULL');
        if (scope.kind === 'own') {
            qb.andWhere('a.id = :adminId', { adminId: scope.administratorId });
        } else {
            const granted = scope.grantedManagerIds ?? [];
            qb.andWhere(
                `(a.customFields.departmentId = :departmentId${granted.length ? ' OR a.id IN (:...granted)' : ''})`,
                { departmentId: scope.departmentId ?? null, granted },
            );
        }
        const admins = await getManyBounded(qb, MAX_VISIBLE_MANAGERS);
        return admins
            .map(a => (a.customFields as AdministratorCustomFields).erpId)
            .filter((id): id is string => !!id);
    }
}
