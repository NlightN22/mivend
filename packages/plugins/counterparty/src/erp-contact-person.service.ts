import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyContactErp } from './entities/counterparty-contact-erp.entity';
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

    // Contacts stored before their counterparty arrived get the link now; existing links are left as they are.
    async linkWaitingContacts(ctx: RequestContext, counterpartyErpId: string): Promise<void> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { erpId: counterpartyErpId }, select: { id: true } });
        if (!counterparty) return;
        const waiting = await this.connection
            .getRepository(ctx, ContactPerson)
            .createQueryBuilder('p')
            .select('p.id', 'id')
            .innerJoin(CounterpartyContactErp, 'e', 'e.erpId = p.erpId')
            .where('e.counterpartyId = :counterpartyErpId AND e.isDeleted = false', {
                counterpartyErpId,
            })
            .getRawMany<{ id: number }>();
        if (waiting.length === 0) return;
        await this.connection
            .getRepository(ctx, CounterpartyContactPerson)
            .createQueryBuilder()
            .insert()
            .values(
                waiting.map(w => ({
                    counterpartyId: counterparty.id as number,
                    contactPersonId: w.id,
                })),
            )
            .orIgnore()
            .execute();
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<number | null> {
        const repo = this.connection.getRepository(ctx, ContactPerson);
        const person = await repo.findOne({ where: { erpId } });
        if (!person) return null;
        await repo.update(person.id, { isActive: false });
        return person.id as number;
    }
}
