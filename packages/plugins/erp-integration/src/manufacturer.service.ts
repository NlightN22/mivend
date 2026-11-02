import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { Manufacturer } from './entities/manufacturer.entity';
import { ManufacturerFacetService } from './manufacturer-facet.service';

// Manufacturers are keyed by the ERP directory GUID. Names and the filter facet value come only
// from the manufacturer stream (upsert); products just reference the GUID (ensureReference).
@Injectable()
export class ManufacturerService {
    constructor(
        private connection: TransactionalConnection,
        private facetService: ManufacturerFacetService,
    ) {}

    async ensureReference(ctx: RequestContext, externalId: string): Promise<Manufacturer> {
        const repo = this.connection.getRepository(ctx, Manufacturer);
        const existing = await repo.findOne({ where: { externalId } });
        return existing ?? repo.save(repo.create({ externalId, name: null }));
    }

    async upsert(
        ctx: RequestContext,
        externalId: string,
        name: string | undefined,
        isActive: boolean,
    ): Promise<Manufacturer | null> {
        const repo = this.connection.getRepository(ctx, Manufacturer);
        const existing = await repo.findOne({ where: { externalId } });
        if (!existing && !name) return null;
        let saved: Manufacturer;
        if (!existing) {
            saved = await repo.save(repo.create({ externalId, name: name ?? null, isActive }));
        } else if (existing.isActive !== isActive || (name && existing.name !== name)) {
            saved = await repo.save(
                Object.assign(existing, { isActive, ...(name ? { name } : {}) }),
            );
        } else {
            saved = existing;
        }
        await this.facetService.ensureValue(ctx, externalId, saved.name);
        return saved;
    }
}
