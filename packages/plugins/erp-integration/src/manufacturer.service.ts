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
    ): Promise<Manufacturer> {
        const repo = this.connection.getRepository(ctx, Manufacturer);
        const existing = await repo.findOne({ where: { externalId } });
        let manufacturer = existing;
        if (!manufacturer) {
            manufacturer = await repo.save(repo.create({ externalId, name: name ?? null }));
        } else if (name && manufacturer.name !== name) {
            manufacturer.name = name;
            manufacturer = await repo.save(manufacturer);
        }
        await this.facetService.ensureValue(ctx, externalId, manufacturer.name);
        return manufacturer;
    }
}
