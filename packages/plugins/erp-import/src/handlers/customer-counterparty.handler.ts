import { Injectable } from '@nestjs/common';
import { CustomerService, RequestContext, UserInputError } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import type { CustomerCounterpartyRecord } from '../types';

@Injectable()
export class CustomerCounterpartyHandler {
    constructor(
        private readonly customerService: CustomerService,
        private readonly counterpartyService: CounterpartyService,
    ) {}

    async assign(ctx: RequestContext, record: CustomerCounterpartyRecord): Promise<void> {
        const result = await this.customerService.findAll(ctx, {
            filter: { emailAddress: { eq: record.customerEmail } },
            take: 1,
        });
        const customer = result.items[0];
        if (!customer)
            throw new UserInputError(`Customer not found: email=${record.customerEmail}`);

        await this.counterpartyService.setCustomerCounterparty(
            ctx,
            customer.id,
            record.counterpartyErpId,
        );
    }
}
