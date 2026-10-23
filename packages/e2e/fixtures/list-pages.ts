import { adminGql, shopGql } from '../helpers/api';
import { createConfirmedOrder, releaseOrderReservation } from '../helpers/manager-order';

// Manager lists page by 10; pagination-scroll needs a second page on every list it covers.
const LIST_ROWS = 11;

export interface PaidOrderSeed {
    operatorToken: string;
    customerId: string;
    customerCookie: string;
    productVariantId: string;
}

interface Proforma {
    id: string;
    status: string;
}

// Paid orders give the orders, proforma invoices and payments lists their rows; the reservation
// is released so the seed takes no stock from the specs. Seeded before the e2e order stays newest.
export async function seedPaidOrders(seed: PaidOrderSeed): Promise<void> {
    for (let i = 0; i < LIST_ROWS; i++) {
        const order = await createConfirmedOrder(
            seed.operatorToken,
            seed.customerId,
            seed.productVariantId,
        );
        await releaseOrderReservation(seed.operatorToken, order.id);
        const requested = await shopGql<{ requestProformaInvoices: Proforma[] }>(
            `mutation($c: String!) { requestProformaInvoices(orderCode: $c) { id status } }`,
            { c: order.code },
            seed.customerCookie,
        );
        const issued = requested.requestProformaInvoices.filter(p => p.status === 'issued');
        if (issued.length === 0) throw new Error(`Order ${order.code} got no proforma invoice`);
        for (const proforma of issued)
            await shopGql(
                `mutation($id: ID!) { payProformaInvoice(proformaInvoiceId: $id, status: "success") { id } }`,
                { id: proforma.id },
                seed.customerCookie,
            );
    }
}

// Each pending request is one row on the approvals list and on the discounts registry.
export async function seedPendingGrantRequests(
    managerToken: string,
    counterpartyId: string,
): Promise<void> {
    const validTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < LIST_ROWS; i++) {
        await adminGql(
            `mutation($input: DiscountGrantInput!) { requestDiscountGrant(input: $input) { id } }`,
            {
                input: {
                    priceTypeCode: 'WHOLESALE',
                    percent: 1,
                    validFrom: new Date().toISOString(),
                    validTo,
                    justification: `e2e list seed ${i + 1}`,
                    counterpartyIds: [counterpartyId],
                },
            },
            managerToken,
        );
    }
}
