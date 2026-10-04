import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { Manufacturer } from './entities/manufacturer.entity';
import { ManufacturerFacetService } from './manufacturer-facet.service';

// Finds-or-creates a Manufacturer by its the ERP directory GUID (issue #116). Name is backfilled
// opportunistically whenever a real one is available (from the 'Производитель' attribute
// alongside the same ProductChanged event) and is never cleared back to null just because a
// later event happens not to carry it — the name is genuinely optional on the wire, absence
// doesn't mean "no longer has a name."
@Injectable()
export class ManufacturerService {
    constructor(
        private connection: TransactionalConnection,
        private facetService: ManufacturerFacetService,
    ) {}

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
