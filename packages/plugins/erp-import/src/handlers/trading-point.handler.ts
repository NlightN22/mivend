import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { Counterparty, TradingPoint, ContactPerson } from '@mivend/plugin-counterparty';
import type { TradingPointRecord } from '../types';

const loggerCtx = 'TradingPointHandler';

@Injectable()
export class TradingPointHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: TradingPointRecord): Promise<void> {
        const counterparty = await this.connection.rawConnection
            .getRepository(Counterparty)
            .findOne({ where: { erpId: record.counterpartyErpId } });
        if (!counterparty) {
            throw new UserInputError(`Counterparty not found: erpId=${record.counterpartyErpId}`);
        }

        const repo = this.connection.rawConnection.getRepository(TradingPoint);
        const cpRepo = this.connection.rawConnection.getRepository(ContactPerson);

        let entity = await repo.findOne({
            where: { erpId: record.erpId },
            relations: ['contacts'],
        });
        if (entity) {
            entity.name = record.name;
            entity.address = record.address;
            entity.workingHours = record.workingHours ?? null;
            entity.isActive = record.isActive;
            entity.counterpartyId = counterparty.id;
        } else {
            entity = repo.create({
                erpId: record.erpId,
                counterpartyId: counterparty.id,
                name: record.name,
                address: record.address,
                workingHours: record.workingHours ?? null,
                isActive: record.isActive,
                contacts: [],
            });
        }

        if (record.contactName) {
            if (entity.id) await cpRepo.delete({ tradingPoint: { id: entity.id } });
            entity.contacts = [
                cpRepo.create({
                    name: record.contactName,
                    phone: record.contactPhone ?? null,
                    isPrimary: true,
                }),
            ];
        }

        await repo.save(entity);
        Logger.verbose(`Upserted trading point erpId=${record.erpId}`, loggerCtx);
    }
}
