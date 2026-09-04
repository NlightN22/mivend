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

    async findPriceTypeByExternalId(
        ctx: RequestContext,
        externalId: string,
    ): Promise<PriceType | null> {
        return this.connection.getRepository(ctx, PriceType).findOne({ where: { externalId } });
    }

    // Used by erp-integration's PriceTypeStreamHandler (issue #63). `code` is never touched on
    // update — an admin may have already renamed it via the admin-facing upsertPriceType
    // mutation, and 1C's name is not the source of truth for the business code after creation.
    async upsertPriceTypeByExternalId(
        ctx: RequestContext,
        externalId: string,
        name: string,
        isActive: boolean,
    ): Promise<PriceType> {
        const repo = this.connection.getRepository(ctx, PriceType);
        const existing = await repo.findOne({ where: { externalId } });
        if (existing) {
            existing.name = name;
            existing.isActive = isActive;
            return repo.save(existing);
        }
        const code = await this.generateUniqueCode(ctx, name);
        const created = repo.create({ externalId, code, name, isActive });
        return repo.save(created);
    }

    private async generateUniqueCode(ctx: RequestContext, name: string): Promise<string> {
        const repo = this.connection.getRepository(ctx, PriceType);
        const base = slugify(name) || 'price-type';
        let candidate = base;
        let suffix = 2;
        while (await repo.findOne({ where: { code: candidate } })) {
            candidate = `${base}-${suffix}`;
            suffix += 1;
        }
        return candidate;
    }
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
};

function slugify(value: string): string {
    const transliterated = value
        .toLowerCase()
        .split('')
        .map(char => CYRILLIC_TO_LATIN[char] ?? char)
        .join('');
    return transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
