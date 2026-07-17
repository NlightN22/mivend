import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import {
    PaymentReconciliationIssue,
    PaymentReconciliationIssueType,
} from './entities/payment-reconciliation-issue.entity';

// A detected cross-system discrepancy, for a human to resolve (AGENTS.md sync rule #11) — never
// an automatic pick of whichever number/organization looks right. Kept intentionally minimal
// (report + list) — resolution/triage tooling is future scope, not part of detecting the issue.
@Injectable()
export class PaymentReconciliationIssueService {
    constructor(private connection: TransactionalConnection) {}

    async report(
        ctx: RequestContext,
        issueType: PaymentReconciliationIssueType,
        details: {
            invoiceId?: number;
            organizationId?: number;
            providerPaymentId?: string;
        },
    ): Promise<PaymentReconciliationIssue> {
        const repo = this.connection.getRepository(ctx, PaymentReconciliationIssue);
        return repo.save(
            repo.create({
                issueType,
                paymentId: null,
                invoiceId: details.invoiceId ?? null,
                organizationId: details.organizationId ?? null,
                providerPaymentId: details.providerPaymentId ?? null,
                erpDocumentId: null,
                expectedAmount: null,
                actualAmount: null,
                expectedCurrency: null,
                actualCurrency: null,
                detectedAt: new Date(),
                status: 'open',
                resolution: null,
            }),
        );
    }
}
