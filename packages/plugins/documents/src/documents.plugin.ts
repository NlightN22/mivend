import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    Order,
    OrderStateTransitionEvent,
    PluginCommonModule,
    TransactionalConnection,
    VendurePlugin,
} from '@vendure/core';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { AcquiringPlugin, InvoiceService } from '@mivend/plugin-acquiring';
import { subscribeAndLog } from 'shared';

import { loggerCtx } from './constants';
import { Document } from './entities/document.entity';
import { OrganizationRequisites } from './entities/organization-requisites.entity';
import { DocumentsService } from './documents.service';
import {
    DocumentsResolver,
    DocumentFieldResolver,
    DocumentsAdminResolver,
} from './documents.resolver';
import { shopApiExtensions } from './api/shop.schema';
import { adminApiExtensions } from './api/admin.schema';
import { PdfBrowserService } from './pdf/pdf-browser.service';
import { PdfGeneratorService } from './pdf/pdf-generator.service';

// Offline-terms (invoice/deferred) payments settle straight to `Authorized`
// (see apps/server/src/payment-method-handlers.ts), which Vendure's default
// order process transitions to `PaymentAuthorized` — confirmed empirically
// against a real deferred-payment checkout in dev (see docs/ai/PROJECT_CONTEXT.md
// "checkout never actually placed orders"). Online-stub payments settle straight
// to `PaymentSettled` and are excluded here — only offline-terms orders need an
// invoice document generated automatically.
const OFFLINE_TERMS_METHOD = 'offline-terms';
const INVOICE_TRIGGER_STATE = 'PaymentAuthorized';

@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin, AccessControlPlugin, AcquiringPlugin],
    entities: [Document, OrganizationRequisites],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [DocumentsResolver, DocumentFieldResolver],
    },
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [DocumentsAdminResolver, DocumentFieldResolver],
    },
    providers: [DocumentsService, PdfBrowserService, PdfGeneratorService],
    exports: [DocumentsService, PdfGeneratorService],
    compatibility: '>0.0.0',
})
export class DocumentsPlugin implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private connection: TransactionalConnection,
        private documentsService: DocumentsService,
        private pdfGeneratorService: PdfGeneratorService,
        private invoiceService: InvoiceService,
    ) {}

    onApplicationBootstrap(): void {
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            async event => {
                if (event.toState !== INVOICE_TRIGGER_STATE) return;
                await this.onOfflineTermsPaymentAuthorized(event);
            },
            loggerCtx,
        );
    }

    private async onOfflineTermsPaymentAuthorized(event: OrderStateTransitionEvent): Promise<void> {
        const order = await this.connection
            .getRepository(event.ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.payments', 'payments')
            .leftJoinAndSelect('order.customer', 'customer')
            .where('order.id = :id', { id: event.order.id })
            .getOne();
        if (!order) return;

        const isOfflineTerms = order.payments?.some(p => p.method === OFFLINE_TERMS_METHOD);
        if (!isOfflineTerms) return;

        // One invoice document per organization-split Invoice (docs/payments.md
        // "Organizations"), not one per order — offlineTermsPaymentHandler already
        // materialized the real Invoice split in createPayment(), before this transition
        // fires, so this is just reading it back (idempotent, no re-computation).
        const invoices = await this.invoiceService.findByOrderId(event.ctx, Number(order.id));
        for (const invoice of invoices) {
            const document = await this.documentsService.createInvoicePlaceholder(
                event.ctx,
                order,
                invoice,
            );
            await this.pdfGeneratorService.enqueue(document.id);
        }
    }
}
