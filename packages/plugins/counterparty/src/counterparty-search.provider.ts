import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Permission } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { likeTerm } from 'shared';
import { CustomPermission } from '@mivend/plugin-access-control';
import { StaffSearchRegistry, type GlobalSearchHit } from '@mivend/plugin-staff-search';

import { CounterpartyService } from './counterparty.service';

export const COUNTERPARTY_SEARCH_KIND = 'counterparty';

// Built on the list's own visible query, so the scope is the list's scope.
@Injectable()
export class CounterpartySearchProvider implements OnApplicationBootstrap {
    constructor(
        private readonly registry: StaffSearchRegistry,
        private readonly counterparties: CounterpartyService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register({
            kind: COUNTERPARTY_SEARCH_KIND,
            position: 10,
            permissions: [
                Permission.ReadCustomer,
                CustomPermission.ReadCounterparty.Permission as Permission,
            ],
            search: (ctx, term, limit) => this.search(ctx, term, limit),
        });
    }

    async search(ctx: RequestContext, term: string, limit: number): Promise<GlobalSearchHit[]> {
        const qb = await this.counterparties.visibleFilteredQb(ctx, {});
        const rows = await qb
            .andWhere(
                '(c.shortName ILIKE :gsTerm OR c.legalName ILIKE :gsTerm OR c.inn ILIKE :gsTerm)',
                { gsTerm: likeTerm(term) },
            )
            .take(limit)
            .getMany();
        return rows.map(c => ({
            id: String(c.id),
            number: c.inn ?? '',
            title: c.shortName,
            subtitle: c.legalName,
            status: c.isActive ? 'active' : 'inactive',
            counterpartyId: String(c.id),
        }));
    }
}
