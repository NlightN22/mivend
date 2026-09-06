import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';

import {
    PaymentReconciliationIssue,
    PaymentReconciliationIssueType,
} from './entities/payment-reconciliation-issue.entity';

const OPEN_ISSUES_MAX_TAKE = 100;

export interface OpenPaymentReconciliationIssueListOptions {
    take?: number;
    skip?: number;
}

// A detected cross-system discrepancy, for a human to resolve (the external-integration-rules skill) — never
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

    // Dashboard/ops read model (issue #76) — open issues need a human to resolve; never
    // auto-resolved from this query.
    async findOpen(
        ctx: RequestContext,
        options?: OpenPaymentReconciliationIssueListOptions,
    ): Promise<PaginatedList<PaymentReconciliationIssue>> {
        const take = Math.min(options?.take ?? 20, OPEN_ISSUES_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const [items, totalItems] = await this.connection
            .getRepository(ctx, PaymentReconciliationIssue)
            .createQueryBuilder('issue')
            .where('issue.status = :status', { status: 'open' })
            .orderBy('issue.detectedAt', 'DESC')
            .addOrderBy('issue.id', 'DESC')
            .take(take)
            .skip(skip)
            .getManyAndCount();

        return { items, totalItems };
    }
}
