import { ApiNetworkError } from '../api/client';
import { orderDisplayNumber } from '../pages/orders/orderFormat';

export type PaymentResultStatus = 'success' | 'pending' | 'fail';

export interface PaymentResultPayment {
    id: string;
    method: string;
    amount: number;
    state: string;
    transactionId?: string | null;
    createdAt: string;
}

export interface PaymentResultOrder {
    id: string;
    code: string;
    totalWithTax: number;
    customFields?: {
        isExternal?: boolean | null;
        erpRegistrationDocumentNumber?: string | null;
    } | null;
    payments?: PaymentResultPayment[] | null;
}

export interface PaymentResultView {
    orderId: string;
    orderNumber: string;
    amountKopecks: number;
    method: string | null;
    transactionId: string | null;
    paidAt: string | null;
}

export function parsePaymentResultStatus(value: unknown): PaymentResultStatus {
    return value === 'pending' || value === 'fail' ? value : 'success';
}

// Shop API answers FORBIDDEN for a code that is unknown or not the customer's; transport failures are not a 404.
export function isMissingOrderError(error: unknown): boolean {
    return (
        error instanceof Error &&
        !(error instanceof ApiNetworkError) &&
        !error.message.startsWith('Shop API error:')
    );
}

export function parseOrderCode(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// The latest payment is the one the simulator just recorded; without one the order total stands in.
export function describePaymentResult(order: PaymentResultOrder): PaymentResultView {
    const payments = [...(order.payments ?? [])].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1,
    );
    const payment = payments[payments.length - 1] ?? null;
    return {
        orderId: order.id,
        orderNumber: orderDisplayNumber(order),
        amountKopecks: payment?.amount ?? order.totalWithTax,
        method: payment?.method ?? null,
        transactionId: payment?.transactionId || null,
        paidAt: payment?.createdAt ?? null,
    };
}
