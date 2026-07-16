import { describe, expect, it } from 'vitest';

import { Dispute } from '../../entities/dispute.entity';
import { FiscalReceipt } from '../../entities/fiscal-receipt.entity';
import { IdempotencyKey } from '../../entities/idempotency-key.entity';
import { Invoice } from '../../entities/invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { PaymentReconciliationIssue } from '../../entities/payment-reconciliation-issue.entity';
import { ProcessedProviderEvent } from '../../entities/processed-provider-event.entity';
import { PaymentRefund } from '../../entities/payment-refund.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';

describe('acquiring entities', () => {
    it('constructs an Invoice split off an aggregate order for one organization', () => {
        const invoice = new Invoice({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 42,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'pending',
        });

        expect(invoice.organizationId).toBe(1);
        expect(invoice.status).toBe('pending');
    });

    it('constructs a PaymentAttempt referencing an Invoice', () => {
        const attempt = new PaymentAttempt({
            channel: 'online-acquiring',
            invoiceId: 1,
            orderId: 1,
            amount: 1000,
            currencyCode: 'RUB',
            providerPaymentId: 'prov-1',
            paymentStatus: 'pending',
            erpPostingStatus: 'notRequired',
        });

        expect(attempt.channel).toBe('online-acquiring');
        expect(attempt.paymentStatus).toBe('pending');
    });

    it('constructs a FiscalReceipt with nullable fiscal fields', () => {
        const receipt = new FiscalReceipt({
            paymentId: 1,
            fiscalDocumentNumber: null,
            fiscalSign: null,
            fiscalDriveNumber: null,
            registrationNumber: null,
            receiptType: 'sale',
            fiscalizedAt: null,
            fiscalizationStatus: 'pending',
        });

        expect(receipt.fiscalizationStatus).toBe('pending');
        expect(receipt.fiscalDocumentNumber).toBeNull();
    });

    it('constructs a PaymentRefund as an independent entity', () => {
        const refund = new PaymentRefund({
            paymentId: 1,
            amount: 500,
            status: 'pending',
            providerRefundId: null,
            reason: 'customer request',
        });

        expect(refund.paymentId).toBe(1);
        expect(refund.status).toBe('pending');
    });

    it('constructs a Dispute independent of Refund', () => {
        const dispute = new Dispute({
            paymentId: 1,
            type: 'chargeback',
            status: 'opened',
            amount: 1000,
            openedAt: new Date('2026-07-16'),
        });

        expect(dispute.type).toBe('chargeback');
    });

    it('constructs a SettlementEntry with allocation fields', () => {
        const entry = new SettlementEntry({
            counterpartyId: 42,
            invoiceId: 1,
            organizationId: 1,
            sourceType: 'payment.captured',
            sourcePaymentId: 1,
            sourceRefundId: null,
            amount: 1000,
            currencyCode: 'RUB',
            reconciled: false,
            allocatedOrderId: 7,
            allocationAmount: 1000,
        });

        expect(entry.reconciled).toBe(false);
        expect(entry.allocatedOrderId).toBe(7);
    });

    it('constructs a PaymentReconciliationIssue defaulting to open status', () => {
        const issue = new PaymentReconciliationIssue({
            issueType: 'AMOUNT_MISMATCH',
            paymentId: 1,
            invoiceId: 1,
            organizationId: 1,
            providerPaymentId: 'prov-1',
            erpDocumentId: null,
            expectedAmount: 1000,
            actualAmount: 900,
            expectedCurrency: 'RUB',
            actualCurrency: 'RUB',
            detectedAt: new Date('2026-07-16'),
            status: 'open',
            resolution: null,
        });

        expect(issue.status).toBe('open');
        expect(issue.issueType).toBe('AMOUNT_MISMATCH');
    });

    it('constructs an IdempotencyKey', () => {
        const key = new IdempotencyKey({
            callerId: 'payment-service',
            idempotencyKey: 'payment:1:capture',
            requestHash: 'hash',
            response: null,
            status: 'inProgress',
        });

        expect(key.idempotencyKey).toBe('payment:1:capture');
    });

    it('constructs a ProcessedProviderEvent', () => {
        const event = new ProcessedProviderEvent({
            provider: 'stub-provider',
            providerEventId: 'evt-1',
            payloadHash: 'hash',
            processedAt: new Date('2026-07-16'),
        });

        expect(event.provider).toBe('stub-provider');
    });
});
