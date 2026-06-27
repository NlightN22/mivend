import { Injectable, Logger } from '@nestjs/common';
import { CustomerService, RequestContext } from '@vendure/core';
import type { CustomerRecord } from '../types';

const loggerCtx = 'ErpCustomerHandler';

@Injectable()
export class CustomerHandler {
    constructor(private readonly customerService: CustomerService) {}

    async upsert(ctx: RequestContext, record: CustomerRecord): Promise<void> {
        const existing = await this.customerService.findAll(ctx, {
            filter: { emailAddress: { eq: record.email } },
            take: 1,
        });

        if (existing.items.length > 0) {
            Logger.verbose(`Customer already exists email=${record.email}`, loggerCtx);
            return;
        }

        const result = await this.customerService.create(
            ctx,
            {
                emailAddress: record.email,
                firstName: record.firstName,
                lastName: record.lastName,
            },
            record.password,
        );

        if ('errorCode' in result) {
            throw new Error(`${result.errorCode}: ${result.message}`);
        }

        Logger.verbose(`Created customer email=${record.email}`, loggerCtx);
    }
}
