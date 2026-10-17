import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { In, IsNull } from 'typeorm';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceWithdrawService } from './proforma-invoice-withdraw.service';

let connection: TransactionalConnection;
let withdrawService: ProformaInvoiceWithdrawService;

// Any path into Cancelled withdraws the order's open proformas in its transaction; a proforma
// with a payment in progress makes withdraw throw, which aborts the cancel instead of leaving it open.
export const proformaInvoiceCancelProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
        withdrawService = injector.get(ProformaInvoiceWithdrawService);
    },
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'Cancelled') return;
        const open = await connection.getRepository(ctx, ProformaInvoice).find({
            where: {
                orderId: Number(order.id),
                status: In(['issued', 'pending']),
                supersededById: IsNull(),
            },
        });
        for (const invoice of open) await withdrawService.withdraw(ctx, invoice.id);
    },
};
