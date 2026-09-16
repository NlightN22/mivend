import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { Manufacturer } from './entities/manufacturer.entity';

// Finds-or-creates a Manufacturer by its 1C directory GUID (issue #116). Name is backfilled
// opportunistically whenever a real one is available (from the 'Производитель' attribute
// alongside the same ProductChanged event) and is never cleared back to null just because a
// later event happens not to carry it — the name is genuinely optional on the wire, absence
// doesn't mean "no longer has a name."
@Injectable()
export class ManufacturerService {
    constructor(private connection: TransactionalConnection) {}

    async upsert(
        ctx: RequestContext,
        externalId: string,
        name: string | undefined,
    ): Promise<Manufacturer> {
        const repo = this.connection.getRepository(ctx, Manufacturer);
        const existing = await repo.findOne({ where: { externalId } });
        if (existing) {
            if (name && existing.name !== name) {
                existing.name = name;
                return repo.save(existing);
            }
            return existing;
        }
        return repo.save(repo.create({ externalId, name: name ?? null }));
    }
}
