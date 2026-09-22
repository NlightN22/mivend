import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Zone } from '@vendure/core';

import { DEFAULT_TAX_ZONE_NAME } from './types';

// Issue #141: find-or-create for the single default tax Zone. Zone has no natural external-id
// field in Vendure core, so this keys by name — the only stable, human-visible handle it offers —
// rather than inventing a customField for a single-zone-today setup (AGENTS.md: no speculative
// abstraction). Shared by the product-side auto-create path and VatRateStreamHandler so both key
// off the exact same row regardless of arrival order.
@Injectable()
export class TaxZoneService {
    constructor(private readonly connection: TransactionalConnection) {}

    async findOrCreateDefaultZone(ctx: RequestContext): Promise<Zone> {
        const repo = this.connection.getRepository(ctx, Zone);
        const existing = await repo.findOne({ where: { name: DEFAULT_TAX_ZONE_NAME } });
        if (existing) return existing;

        return repo.save(repo.create({ name: DEFAULT_TAX_ZONE_NAME }));
    }
}
