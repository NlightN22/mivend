import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductTaxCodeFlag } from './entities/product-tax-code-flag.entity';
import type { VatCodeFlag } from './vat-code-resolver';

const RECENT_FLAGS_MAX_TAKE = 100;

export interface ProductTaxCodeFlagListOptions {
    take?: number;
    skip?: number;
}

// VAT-code review flags are non-blocking and report-only; there is no resolution workflow.
// Scope matches ReservationReconciliationIssueService: detecting the issue is the whole job.
@Injectable()
export class ProductTaxCodeFlagService {
    constructor(private connection: TransactionalConnection) {}

    async report(
        ctx: RequestContext,
        externalProductId: string,
        rawVatCode: string,
        flag: VatCodeFlag,
    ): Promise<ProductTaxCodeFlag> {
        const repo = this.connection.getRepository(ctx, ProductTaxCodeFlag);
        return repo.save(
            repo.create({
                externalProductId,
                rawVatCode,
                reason: flag.reason,
                detail: flag.detail,
                detectedAt: new Date(),
            }),
        );
    }

    async findRecent(
        ctx: RequestContext,
        options?: ProductTaxCodeFlagListOptions,
    ): Promise<PaginatedList<ProductTaxCodeFlag>> {
        const take = Math.min(options?.take ?? 20, RECENT_FLAGS_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const [items, totalItems] = await this.connection
            .getRepository(ctx, ProductTaxCodeFlag)
            .createQueryBuilder('flag')
            .orderBy('flag.detectedAt', 'DESC')
            .addOrderBy('flag.id', 'DESC')
            .take(take)
            .skip(skip)
            .getManyAndCount();

        return { items, totalItems };
    }
}
