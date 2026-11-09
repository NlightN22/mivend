import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Not } from 'typeorm';
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
                await this.connection.getRepository(txCtx, CounterpartyContactPerson).delete({
                    contactPersonId: saved.id as number,
                    counterpartyId: Not(fields.counterpartyId),
                });
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

    // Contacts stored before their counterparty arrived get the link now; a person moved here loses its other links.
    // One statement: this runs for every counterparty event, and usually finds nothing waiting.
    async linkWaitingContacts(ctx: RequestContext, counterpartyErpId: string): Promise<void> {
        await this.connection.getRepository(ctx, CounterpartyContactPerson).query(
            `WITH waiting AS (
                 SELECT p.id FROM contact_person p
                   JOIN counterparty_contact_erp e ON e."erpId" = p."erpId"
                  WHERE e."counterpartyId" = $1 AND e."isDeleted" = false),
             owner AS (SELECT id FROM counterparty WHERE "erpId" = $1),
             moved AS (
                 DELETE FROM counterparty_contact_person l USING waiting w, owner o
                  WHERE l."contactPersonId" = w.id AND l."counterpartyId" <> o.id)
             INSERT INTO counterparty_contact_person ("counterpartyId", "contactPersonId")
             SELECT o.id, w.id FROM waiting w, owner o
             ON CONFLICT ("counterpartyId", "contactPersonId") DO NOTHING`,
            [counterpartyErpId],
        );
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<number | null> {
        const repo = this.connection.getRepository(ctx, ContactPerson);
        const person = await repo.findOne({ where: { erpId } });
        if (!person) return null;
        await repo.update(person.id, { isActive: false });
        return person.id as number;
    }
}
