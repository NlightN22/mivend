import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { CounterpartyErp } from './entities/counterparty-erp.entity';
import { Counterparty } from './entities/counterparty.entity';

export type CounterpartyMirrorFields = Partial<
    Omit<CounterpartyErp, 'id' | 'erpId' | 'createdAt' | 'updatedAt'>
>;

// The only writer of counterparty_erp, called by the stream handler with exactly what the event carried.
@Injectable()
export class CounterpartyErpMirrorService {
    constructor(private readonly connection: TransactionalConnection) {}

    // undefined keeps the mirrored value (a partial event); null stores that the ERP sent it empty.
    async write(
        ctx: RequestContext,
        erpId: string,
        fields: CounterpartyMirrorFields,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, CounterpartyErp);
        const row = (await repo.findOne({ where: { erpId } })) ?? repo.create({ erpId });
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        await repo.save(row);
    }

    // Fills the portal-owned phone and e-mail only while they are empty: the ERP value seeds, a person's edit wins.
    async seedContactFromMirror(ctx: RequestContext, erpId: string): Promise<void> {
        await this.connection.getRepository(ctx, Counterparty).query(
            `UPDATE counterparty c SET
                 phone = COALESCE(NULLIF(c.phone, ''), m.phone),
                 "officialEmail" = COALESCE(NULLIF(c."officialEmail", ''), m."officialEmail")
               FROM counterparty_erp m
              WHERE m."erpId" = c."erpId" AND c."erpId" = $1
                AND ((COALESCE(c.phone, '') = '' AND m.phone IS NOT NULL)
                  OR (COALESCE(c."officialEmail", '') = '' AND m."officialEmail" IS NOT NULL))`,
            [erpId],
        );
    }
}
