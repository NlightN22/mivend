import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In, Not } from 'typeorm';
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
    async linkWaitingContacts(ctx: RequestContext, counterpartyErpId: string): Promise<void> {
        const waiting = await this.connection.getRepository(ctx, CounterpartyContactErp).find({
            where: { counterpartyId: counterpartyErpId, isDeleted: false },
            select: { erpId: true },
        });
        if (waiting.length === 0) return;
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { erpId: counterpartyErpId }, select: { id: true } });
        if (!counterparty) return;
        const persons = await this.connection.getRepository(ctx, ContactPerson).find({
            where: { erpId: In(waiting.map(w => w.erpId)) },
            select: { id: true },
        });
        if (persons.length === 0) return;
        const links = this.connection.getRepository(ctx, CounterpartyContactPerson);
        await links.delete({
            contactPersonId: In(persons.map(p => p.id as number)),
            counterpartyId: Not(counterparty.id as number),
        });
        await links
            .createQueryBuilder()
            .insert()
            .values(
                persons.map(p => ({
                    counterpartyId: counterparty.id as number,
                    contactPersonId: p.id as number,
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
