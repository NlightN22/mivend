import { Injectable, Logger } from '@nestjs/common';
import {
    CustomerService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { Counterparty } from '@mivend/plugin-counterparty';
import type { CustomerCounterpartyRecord } from '../types';

const loggerCtx = 'CustomerCounterpartyHandler';

@Injectable()
export class CustomerCounterpartyHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly customerService: CustomerService,
    ) {}

    async assign(ctx: RequestContext, record: CustomerCounterpartyRecord): Promise<void> {
        const result = await this.customerService.findAll(ctx, {
            filter: { emailAddress: { eq: record.customerEmail } },
            take: 1,
        });
        const customer = result.items[0];
        if (!customer)
            throw new UserInputError(`Customer not found: email=${record.customerEmail}`);

        const counterparty = await this.connection.rawConnection
            .getRepository(Counterparty)
            .findOne({ where: { erpId: record.counterpartyErpId } });
        if (!counterparty)
            throw new UserInputError(`Counterparty not found: erpId=${record.counterpartyErpId}`);

        await this.customerService.update(ctx, {
            id: customer.id,
            customFields: { counterpartyId: counterparty.id } as Record<string, unknown>,
        });
        Logger.verbose(
            `Assigned customer ${record.customerEmail} → counterparty ${record.counterpartyErpId}`,
            loggerCtx,
        );
    }
}
