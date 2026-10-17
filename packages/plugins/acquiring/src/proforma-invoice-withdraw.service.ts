import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';

const ACTIVE_ATTEMPT_STATUSES = ['pending', 'authorized'];

// Manager withdrawal: a current, unpaid proforma invoice becomes `cancelled` without a replacement.
// No outward event: the ERP does not know proformas yet (docs/payments.md).
@Injectable()
export class ProformaInvoiceWithdrawService {
    constructor(private connection: TransactionalConnection) {}

    async withdraw(
        ctx: RequestContext,
        proformaInvoiceId: number,
        administratorId: string | null = null,
    ): Promise<ProformaInvoice> {
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
                const settled = await this.connection
                    .getRepository(txCtx, SettlementEntry)
                    .createQueryBuilder('entry')
                    .select('COALESCE(SUM(entry.amount), 0)', 'total')
                    .where('entry.proformaInvoiceId = :id', { id: invoice.id })
                    .getRawOne<{ total: string }>();
                if (Number(settled?.total ?? 0) > 0) {
                    throw new UserInputError(
                        'A proforma invoice with a recorded payment cannot be withdrawn',
                    );
                }
                const activeAttempts = await this.connection
                    .getRepository(txCtx, PaymentAttempt)
                    .createQueryBuilder('attempt')
                    .where('attempt.proformaInvoiceId = :id', { id: invoice.id })
                    .andWhere('attempt.paymentStatus IN (:...statuses)', {
                        statuses: ACTIVE_ATTEMPT_STATUSES,
                    })
                    .getCount();
                if (activeAttempts > 0) {
                    throw new UserInputError(
                        'A proforma invoice with a payment in progress cannot be withdrawn',
                    );
                }
                await repo.update(
                    { id: invoice.id },
                    {
                        status: 'cancelled',
                        withdrawnAt: new Date(),
                        withdrawnByAdministratorId: administratorId,
                    },
                );
                return repo.findOneOrFail({ where: { id: proformaInvoiceId } });
            },
        );
    }
}
