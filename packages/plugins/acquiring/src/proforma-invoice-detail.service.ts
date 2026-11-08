import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { ProformaInvoice } from './entities/proforma-invoice.entity';

// A document with hundreds of payments must not return an unbounded list.
export const PAYMENTS_CAP = 50;

// Children of an already scope-checked proforma invoice: they inherit its visibility.
@Injectable()
export class ProformaInvoiceDetailService {
    constructor(private connection: TransactionalConnection) {}

    payments(ctx: RequestContext, proformaInvoiceId: number): Promise<PaymentAttempt[]> {
        return this.connection.getRepository(ctx, PaymentAttempt).find({
            where: { proformaInvoiceId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: PAYMENTS_CAP,
        });
    }

    async versions(
        ctx: RequestContext,
        proformaInvoice: ProformaInvoice,
    ): Promise<ProformaInvoice[]> {
        if (proformaInvoice.orderId == null) return [proformaInvoice];
        return this.connection.getRepository(ctx, ProformaInvoice).find({
            where: {
                orderId: proformaInvoice.orderId,
                organizationId: proformaInvoice.organizationId,
            },
            order: { version: 'DESC' },
        });
    }
}
