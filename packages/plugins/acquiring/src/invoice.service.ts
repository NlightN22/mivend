import { Injectable } from '@nestjs/common';
import { EntityHydrator, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { Invoice } from './entities/invoice.entity';

interface OrganizationTotal {
    organizationId: number;
    amount: number;
}

// Splits one aggregate storefront Order into one Invoice per organization it touches — decided
// direction in docs/payments.md "Organizations": the split must be known *before* an online
// payment is requested (a split-payment acquirer needs the full recipient/amount breakdown
// upfront), so this runs at checkout time, not from an async ERP callback. organizationId comes
// from ProductVariant.customFields.organizationId (ERP-imported catalog master data, mirroring
// PriceEntry) — not yet backed by a real 1C export, see docs/payments.md.
@Injectable()
export class InvoiceService {
    constructor(
        private connection: TransactionalConnection,
        private entityHydrator: EntityHydrator,
        private counterpartyService: CounterpartyService,
    ) {}

    async computeSplit(ctx: RequestContext, order: Order): Promise<OrganizationTotal[]> {
        await this.entityHydrator.hydrate(ctx, order, { relations: ['lines.productVariant'] });

        const totalsByOrganization = new Map<number, number>();
        for (const line of order.lines) {
            const organizationId = line.productVariant.customFields?.organizationId;
            if (organizationId == null) {
                throw new Error(
                    `OrderLine ${line.id} (variant ${line.productVariant.sku}) has no ` +
                        `organizationId set — cannot compute the invoice split for this order`,
                );
            }
            const current = totalsByOrganization.get(organizationId) ?? 0;
            totalsByOrganization.set(organizationId, current + line.linePriceWithTax);
        }

        return [...totalsByOrganization.entries()].map(([organizationId, amount]) => ({
            organizationId,
            amount,
        }));
    }

    // Idempotent: a retry (e.g. the customer reloads the payment page) returns the
    // already-created invoices instead of creating duplicates.
    async createInvoicesForOrder(ctx: RequestContext, order: Order): Promise<Invoice[]> {
        const repo = this.connection.getRepository(ctx, Invoice);
        const existing = await repo.find({ where: { orderId: Number(order.id) } });
        if (existing.length > 0) {
            return existing;
        }

        await this.entityHydrator.hydrate(ctx, order, { relations: ['customer'] });
        if (!order.customer) {
            throw new Error(`Order ${order.id} has no customer — cannot resolve a counterparty`);
        }
        const counterparty = await this.counterpartyService.getForCustomer(ctx, order.customer.id);
        if (!counterparty) {
            throw new Error(
                `Customer ${order.customer.id} has no counterparty — cannot create invoices`,
            );
        }

        const split = await this.computeSplit(ctx, order);
        const invoices = split.map(({ organizationId, amount }) =>
            repo.create({
                orderId: Number(order.id),
                organizationId,
                counterpartyId: Number(counterparty.id),
                amount,
                currencyCode: order.currencyCode,
                status: 'pending',
            }),
        );
        return repo.save(invoices);
    }

    async findByOrderId(ctx: RequestContext, orderId: number): Promise<Invoice[]> {
        return this.connection.getRepository(ctx, Invoice).find({ where: { orderId } });
    }
}
