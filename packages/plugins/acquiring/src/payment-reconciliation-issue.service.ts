import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { Counterparty } from '@mivend/plugin-counterparty';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import {
    PaymentReconciliationIssue,
    PaymentReconciliationIssueType,
} from './entities/payment-reconciliation-issue.entity';
import { ProformaInvoiceVisibilityService } from './proforma-invoice-visibility.service';

const OPEN_ISSUES_MAX_TAKE = 100;

export interface OpenPaymentReconciliationIssueListOptions {
    take?: number;
    skip?: number;
}

// Reported for a human to resolve; never auto-picks which system's value is correct.
// Deliberately minimal (report + list): resolution tooling is out of scope here.
@Injectable()
export class PaymentReconciliationIssueService {
    constructor(
        private connection: TransactionalConnection,
        private notificationService: NotificationService,
        private proformaInvoiceVisibilityService: ProformaInvoiceVisibilityService,
    ) {}

    async report(
        ctx: RequestContext,
        issueType: PaymentReconciliationIssueType,
        details: {
            proformaInvoiceId?: number;
            organizationId?: number;
            providerPaymentId?: string;
        },
    ): Promise<PaymentReconciliationIssue> {
        const repo = this.connection.getRepository(ctx, PaymentReconciliationIssue);
        const saved = await repo.save(
            repo.create({
                issueType,
                paymentId: null,
                proformaInvoiceId: details.proformaInvoiceId ?? null,
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

        // Called from webhook/inbox processing, so ctx has no signed-in administrator;
        // getCurrentAdministrator would return null, so notify every administrator instead.
        await this.notificationService.create(ctx, {
            recipientType: 'administrator-broadcast',
            kind: 'warning',
            sourceType: 'payment-reconciliation',
            sourceId: `${issueType}:${details.proformaInvoiceId ?? ''}:${details.organizationId ?? ''}:${details.providerPaymentId ?? ''}`,
            title: 'Payment/ERP drift detected',
            message: `${issueType} (proforma invoice ${details.proformaInvoiceId ?? 'n/a'})`,
        });

        return saved;
    }

    // Scoped via the proforma invoice->counterparty join; open issues are never auto-resolved here.
    // No proformaInvoiceId means no counterparty/branch: hidden from own/department, 'all'-scope only.
    async findOpen(
        ctx: RequestContext,
        options?: OpenPaymentReconciliationIssueListOptions,
    ): Promise<PaginatedList<PaymentReconciliationIssue>> {
        const take = Math.min(options?.take ?? 20, OPEN_ISSUES_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const scope = await this.proformaInvoiceVisibilityService.resolveScope(ctx);
        const qb = this.connection
            .getRepository(ctx, PaymentReconciliationIssue)
            .createQueryBuilder('issue')
            .where('issue.status = :status', { status: 'open' });

        if (scope.kind !== 'all') {
            qb.innerJoin(
                ProformaInvoice,
                'proformaInvoice',
                'proformaInvoice.id = issue."proformaInvoiceId"',
            ).leftJoin(
                Counterparty,
                'counterparty',
                'counterparty.id::text = proformaInvoice."counterpartyId"::text',
            );
            this.proformaInvoiceVisibilityService.applyScope(qb, scope);
        }

        const [items, totalItems] = await qb
            .orderBy('issue.detectedAt', 'DESC')
            .addOrderBy('issue.id', 'DESC')
            .take(take)
            .skip(skip)
            .getManyAndCount();

        return { items, totalItems };
    }
}
