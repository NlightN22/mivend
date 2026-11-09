import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { ContactPerson } from './entities/contact-person.entity';
import { CounterpartyContactPerson } from './entities/counterparty-contact-person.entity';

export interface ErpContactPersonFields {
    name: string;
    position: string | null;
    isActive: boolean;
    counterpartyId: number | null;
}

@Injectable()
export class ErpContactPersonService {
    constructor(private readonly connection: TransactionalConnection) {}

    // A person is keyed by its ERP id; the counterparty link is added only once that counterparty exists.
    async upsert(
        ctx: RequestContext,
        erpId: string,
        fields: ErpContactPersonFields,
    ): Promise<number> {
        return withAggregateLock(this.connection, ctx, `contact-person:${erpId}`, async txCtx => {
            const persons = this.connection.getRepository(txCtx, ContactPerson);
            const existing = await persons.findOne({ where: { erpId } });
            const values = {
                name: fields.name,
                position: fields.position,
                isActive: fields.isActive,
            };
            const person = existing
                ? Object.assign(existing, values)
                : persons.create({ ...values, erpId, source: 'erp', tradingPoint: null });
            const saved = await persons.save(person);
            if (fields.counterpartyId !== null) {
                await this.connection.getRepository(txCtx, CounterpartyContactPerson).upsert(
                    {
                        counterpartyId: fields.counterpartyId,
                        contactPersonId: saved.id as number,
                    },
                    ['counterpartyId', 'contactPersonId'],
                );
            }
            return saved.id as number;
        });
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<number | null> {
        const repo = this.connection.getRepository(ctx, ContactPerson);
        const person = await repo.findOne({ where: { erpId } });
        if (!person) return null;
        await repo.update(person.id, { isActive: false });
        return person.id as number;
    }
}
