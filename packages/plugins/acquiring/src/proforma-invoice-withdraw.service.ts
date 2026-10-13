import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { ProformaInvoice } from './entities/proforma-invoice.entity';

// Manager withdrawal: a current proforma invoice becomes `cancelled` without a replacement.
@Injectable()
export class ProformaInvoiceWithdrawService {
    constructor(private connection: TransactionalConnection) {}

    async withdraw(ctx: RequestContext, proformaInvoiceId: number): Promise<ProformaInvoice> {
        const orderId = (
            await this.connection
                .getRepository(ctx, ProformaInvoice)
                .findOneOrFail({ where: { id: proformaInvoiceId } })
        ).orderId;
        return withAggregateLock(
            this.connection,
            ctx,
            `proformaInvoices-for-order:${orderId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, ProformaInvoice);
                const invoice = await repo.findOneOrFail({
                    where: { id: proformaInvoiceId },
                    lock: { mode: 'pessimistic_write' },
                });
                if (invoice.status === 'cancelled') return invoice;
                if (invoice.status === 'superseded' || invoice.supersededById != null) {
                    throw new UserInputError('Only the current version can be withdrawn');
                }
                if (invoice.status === 'paid') {
                    throw new UserInputError(
                        'A proforma invoice with a recorded payment cannot be withdrawn',
                    );
                }
                await repo.update({ id: invoice.id }, { status: 'cancelled' });
                return repo.findOneOrFail({ where: { id: proformaInvoiceId } });
            },
        );
    }
}
