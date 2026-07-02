import { Inject, Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    CustomerService,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { CUSTOMER_PRICING_PLUGIN_OPTIONS, loggerCtx } from './constants';
import { CustomerPriceType } from './entities/customer-price-type.entity';
import { PriceType } from './entities/price-type.entity';
import { CustomerPricingPluginOptions } from './types';

@Injectable()
export class CustomerPricingService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        @Inject(CUSTOMER_PRICING_PLUGIN_OPTIONS) private options: CustomerPricingPluginOptions,
    ) {}

    async findAllPriceTypes(ctx: RequestContext): Promise<PriceType[]> {
        return this.connection.getRepository(ctx, PriceType).find({
            where: { isActive: true },
            order: { name: 'ASC' },
        });
    }

    async upsertPriceType(ctx: RequestContext, code: string, name: string): Promise<PriceType> {
        const repo = this.connection.getRepository(ctx, PriceType);
        let record = await repo.findOne({ where: { code } });
        if (record) {
            record.name = name;
            record.isActive = true;
        } else {
            record = repo.create({ code, name, isActive: true });
        }
        return repo.save(record);
    }

    async getCustomerPriceType(ctx: RequestContext, customerId: ID): Promise<PriceType | null> {
        const record = await this.connection
            .getRepository(ctx, CustomerPriceType)
            .findOne({ where: { customerId } });

        if (record) {
            return record.priceType;
        }

        if (this.options.defaultPriceTypeCode) {
            return this.connection
                .getRepository(ctx, PriceType)
                .findOne({ where: { code: this.options.defaultPriceTypeCode } });
        }

        return null;
    }

    async setCustomerPriceType(
        ctx: RequestContext,
        customerId: ID,
        priceTypeId: ID,
    ): Promise<CustomerPriceType> {
        const customer = await this.customerService.findOne(ctx, customerId);
        if (!customer) {
            throw new UserInputError(`No customer found with id ${customerId}`);
        }

        const priceType = await this.connection
            .getRepository(ctx, PriceType)
            .findOne({ where: { id: priceTypeId } });
        if (!priceType) {
            throw new UserInputError(`No price type found with id ${priceTypeId}`);
        }

        const repo = this.connection.getRepository(ctx, CustomerPriceType);
        let record = await repo.findOne({ where: { customerId } });

        if (record) {
            record.priceType = priceType;
        } else {
            record = repo.create({ customerId, priceType });
        }

        await repo.save(record);
        Logger.verbose(`Set priceType=${priceType.code} for customer ${customerId}`, loggerCtx);

        return record;
    }

    async assignCustomerPriceTypeByCode(
        ctx: RequestContext,
        customerId: ID,
        priceTypeCode: string,
    ): Promise<CustomerPriceType> {
        const priceType = await this.upsertPriceType(ctx, priceTypeCode, priceTypeCode);
        return this.setCustomerPriceType(ctx, customerId, priceType.id);
    }
}
