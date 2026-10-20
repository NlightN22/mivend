import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { EntityVersionScopeRegistry } from '@mivend/plugin-versioning';

import { CounterpartyService } from './counterparty.service';
import { TradingPointService } from './trading-point.service';

const GRANT_MANAGERS = [
    CustomPermission.ManageVisibilityGrants.Permission,
    CustomPermission.ManageAccessControl.Permission,
];

// History of counterparty-owned entities follows the counterparty visibility scope.
@Injectable()
export class EntityVersionScopeRegistrar implements OnApplicationBootstrap {
    constructor(
        private readonly registry: EntityVersionScopeRegistry,
        private readonly counterparties: CounterpartyService,
        private readonly tradingPoints: TradingPointService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register('Counterparty', (ctx, ids) => this.visibleCounterparties(ctx, ids));
        this.registry.register('TradingPoint', (ctx, ids) => this.visiblePoints(ctx, ids));
        this.registry.register('VisibilityGrant', async (ctx, ids) =>
            ctx.userHasPermissions(GRANT_MANAGERS) ? new Set(ids) : new Set(),
        );
    }

    private async visibleCounterparties(ctx: RequestContext, ids: string[]): Promise<Set<string>> {
        const rows = await Promise.all(ids.map(id => this.counterparties.findOneVisible(ctx, id)));
        return new Set(ids.filter((_, i) => rows[i]));
    }

    private async visiblePoints(ctx: RequestContext, ids: string[]): Promise<Set<string>> {
        const points = await Promise.all(ids.map(id => this.tradingPoints.findById(ctx, id)));
        const owners = await this.visibleCounterparties(ctx, [
            ...new Set(points.flatMap(p => (p ? [String(p.counterpartyId)] : []))),
        ]);
        return new Set(
            ids.filter((_, i) => points[i] && owners.has(String(points[i]?.counterpartyId))),
        );
    }
}
