import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    CustomerService,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyUpsertPayload, loggerCtx } from './types';

@Injectable()
export class CounterpartyService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private customerPricingService: CustomerPricingService,
    ) {}

    async upsert(ctx: RequestContext, payload: CounterpartyUpsertPayload): Promise<Counterparty> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        let record = await repo.findOne({ where: { erpId: payload.erpId } });
        if (record) {
            Object.assign(record, payload);
        } else {
            record = repo.create(payload);
        }
        const saved = await repo.save(record);
        Logger.verbose(`Upserted counterparty erpId=${payload.erpId}`, loggerCtx);
        return saved;
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<void> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        await repo.update({ erpId }, { isActive: false });
        Logger.verbose(`Deactivated counterparty erpId=${erpId}`, loggerCtx);
    }

    async updateCredit(
        ctx: RequestContext,
        erpId: string,
        creditLimit: number,
        creditBalance: number,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        await repo.update({ erpId }, { creditLimit, creditBalance });
        Logger.verbose(`Updated credit for erpId=${erpId}`, loggerCtx);
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<Counterparty | null> {
        return this.connection.getRepository(ctx, Counterparty).findOne({ where: { erpId } });
    }

    async findAll(ctx: RequestContext): Promise<Counterparty[]> {
        return this.connection
            .getRepository(ctx, Counterparty)
            .find({ order: { shortName: 'ASC' } });
    }

    async getForCustomer(ctx: RequestContext, customerId: ID): Promise<Counterparty | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT c.* FROM counterparty c
             INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
             WHERE cu.id = $1`,
            [customerId],
        );
        return result[0] ?? null;
    }

    async setCustomerCounterparty(
        ctx: RequestContext,
        customerId: ID,
        erpId: string,
    ): Promise<void> {
        const counterparty = await this.findByErpId(ctx, erpId);
        if (!counterparty) throw new UserInputError(`Counterparty not found: erpId=${erpId}`);
        await this.customerService.update(ctx, {
            id: customerId,
            customFields: { counterpartyId: counterparty.id } as Record<string, unknown>,
        });
        await this.assignPriceType(ctx, customerId, counterparty.priceType);
    }

    async setCustomerRole(ctx: RequestContext, customerId: ID, role: string): Promise<void> {
        await this.customerService.update(ctx, {
            id: customerId,
            customFields: { portalRole: role } as Record<string, unknown>,
        });
    }

    private async assignPriceType(
        ctx: RequestContext,
        customerId: ID,
        priceType: string,
    ): Promise<void> {
        await this.customerPricingService.assignCustomerPriceTypeByCode(ctx, customerId, priceType);
        Logger.verbose(`Assigned customer ${customerId} to price type "${priceType}"`, loggerCtx);
    }
}
