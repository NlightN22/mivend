import type { ProformaCardPayment } from '../api/proformaInvoiceCard';

export interface PaymentSummary {
    paid: number;
    remaining: number;
}

// Only received (captured) payments count; the proforma stays informational, debt comes from the ERP sales invoice.
export function paymentSummary(amount: number, payments: ProformaCardPayment[]): PaymentSummary {
    const paid = payments
        .filter(p => p.paymentStatus === 'captured')
        .reduce((sum, p) => sum + p.amount, 0);
    return { paid, remaining: Math.max(amount - paid, 0) };
}
