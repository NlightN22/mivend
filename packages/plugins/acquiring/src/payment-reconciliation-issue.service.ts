import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';

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
    constructor(
        private connection: TransactionalConnection,
        private notificationService: NotificationService,
    ) {}

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
        const saved = await repo.save(
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

        // PaymentAttemptService (the only caller) runs from webhook/inbox processing, so there is
        // no signed-in administrator on ctx — getCurrentAdministrator would resolve to null.
        // Broadcast to every administrator instead (issue #87 Part 2) rather than skip notifying.
        await this.notificationService.create(ctx, {
            recipientType: 'administrator-broadcast',
            kind: 'warning',
            sourceType: 'payment-reconciliation',
            sourceId: `${issueType}:${details.invoiceId ?? ''}:${details.organizationId ?? ''}:${details.providerPaymentId ?? ''}`,
            title: 'Payment/ERP drift detected',
            message: `${issueType} (invoice ${details.invoiceId ?? 'n/a'})`,
        });

        return saved;
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
