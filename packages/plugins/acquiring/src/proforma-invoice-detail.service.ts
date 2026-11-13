import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CtxLoader, ctxQueryBounded, findBounded } from 'shared';
import { In } from 'typeorm';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { ProformaInvoice } from './entities/proforma-invoice.entity';

// Versions of one order and organization: a generous ceiling; past it the read fails loudly.
export const MAX_VERSIONS_PER_ORDER = 100;

// A document with hundreds of payments must not return an unbounded list.
export const PAYMENTS_CAP = 50;

// Children of an already scope-checked proforma invoice: they inherit its visibility.
// Batched per request so a list that asks for them is not an N+1 (card-only fields in practice).
@Injectable()
export class ProformaInvoiceDetailService {
    constructor(private connection: TransactionalConnection) {}

    private paymentLoader = new CtxLoader<PaymentAttempt[]>((ctx, keys) =>
        this.loadPayments(ctx, keys),
    );
    private versionLoader = new CtxLoader<ProformaInvoice[]>((ctx, keys) =>
        this.loadVersions(ctx, keys),
    );

    payments(ctx: RequestContext, proformaInvoiceId: number): Promise<PaymentAttempt[]> {
        return this.paymentLoader.load(ctx, proformaInvoiceId);
    }

    versions(ctx: RequestContext, proformaInvoice: ProformaInvoice): Promise<ProformaInvoice[]> {
        if (proformaInvoice.orderId == null) return Promise.resolve([proformaInvoice]);
        return this.versionLoader.load(
            ctx,
            `${proformaInvoice.orderId}:${proformaInvoice.organizationId}`,
        );
    }

    private async loadPayments(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<PaymentAttempt[][]> {
        const rows = await ctxQueryBounded<{ id: number }>(
            this.connection,
            ctx,
            `SELECT id FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY "proformaInvoiceId" ORDER BY "createdAt" DESC, id DESC
                ) AS rn
                FROM payment_attempt WHERE "proformaInvoiceId" = ANY($1::int[])
            ) ranked WHERE rn <= $2`,
            [keys.map(Number), PAYMENTS_CAP],
            Math.max(1, keys.length) * PAYMENTS_CAP,
        );
        const payments = await findBounded(
            this.connection.getRepository(ctx, PaymentAttempt),
            {
                where: { id: In(rows.map(r => r.id)) },
                order: { createdAt: 'DESC', id: 'DESC' },
            },
            Math.max(1, rows.length),
        );
        return keys.map(key => payments.filter(p => String(p.proformaInvoiceId) === key));
    }

    private async loadVersions(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<ProformaInvoice[][]> {
        const orderIds = [...new Set(keys.map(key => Number(key.split(':')[0])))];
        const all = await findBounded(
            this.connection.getRepository(ctx, ProformaInvoice),
            { where: { orderId: In(orderIds) }, order: { version: 'DESC' } },
            Math.max(1, orderIds.length) * MAX_VERSIONS_PER_ORDER,
        );
        return keys.map(key => {
            const [orderId, organizationId] = key.split(':').map(Number);
            return all.filter(v => v.orderId === orderId && v.organizationId === organizationId);
        });
    }
}
