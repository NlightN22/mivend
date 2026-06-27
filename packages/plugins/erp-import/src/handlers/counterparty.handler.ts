import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Counterparty } from '@mivend/plugin-counterparty';
import type { CounterpartyRecord } from '../types';

const loggerCtx = 'CounterpartyHandler';

@Injectable()
export class CounterpartyHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: CounterpartyRecord): Promise<void> {
        const repo = this.connection.rawConnection.getRepository(Counterparty);
        let entity = await repo.findOne({ where: { erpId: record.erpId } });
        if (entity) {
            Object.assign(entity, {
                legalName: record.legalName,
                shortName: record.shortName,
                inn: record.inn ?? null,
                creditLimit: record.creditLimit,
                creditBalance: record.creditBalance,
                paymentDelayDays: record.paymentDelayDays,
                priceType: record.priceType,
                isActive: record.isActive,
            });
        } else {
            entity = repo.create({
                erpId: record.erpId,
                legalName: record.legalName,
                shortName: record.shortName,
                inn: record.inn ?? null,
                creditLimit: record.creditLimit,
                creditBalance: record.creditBalance,
                paymentDelayDays: record.paymentDelayDays,
                priceType: record.priceType,
                isActive: record.isActive,
            });
        }
        await repo.save(entity);
        Logger.verbose(`Upserted counterparty erpId=${record.erpId}`, loggerCtx);
    }
}
