import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    Order,
    OrderStateTransitionEvent,
    PluginCommonModule,
    RequestContext,
    TransactionalConnection,
    VendurePlugin,
} from '@vendure/core';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import {
    AcquiringPlugin,
    ProformaInvoice,
    ProformaInvoiceIssuedEvent,
    ProformaInvoiceService,
} from '@mivend/plugin-acquiring';
import { subscribeAndLog } from 'shared';

import { loggerCtx } from './constants';
import { Document } from './entities/document.entity';
import { OrganizationRequisites } from './entities/organization-requisites.entity';
import { DocumentsService } from './documents.service';
import { OrganizationEventService } from './organization-event.service';
import { ProformaRequeueService } from './proforma-requeue.service';
import {
    DocumentsResolver,
    DocumentFieldResolver,
    DocumentsAdminResolver,
    OrganizationFieldResolver,
    ProformaInvoiceDocumentFieldResolver,
} from './documents.resolver';
import { shopApiExtensions } from './api/shop.schema';
import { adminApiExtensions } from './api/admin.schema';
import { PdfBrowserService } from './pdf/pdf-browser.service';
import { PdfGeneratorService } from './pdf/pdf-generator.service';

// Offline-terms (proforma invoice/deferred) payments settle straight to `Authorized`
// (see @mivend/plugin-acquiring's offline-terms-handler.ts), which Vendure's default
// order process transitions to `PaymentAuthorized` — confirmed empirically
// against a real deferred-payment checkout in dev (see docs/ai/PROJECT_CONTEXT.md
// "checkout never actually placed orders"). Online-stub payments settle straight
// to `PaymentSettled` and are excluded here — only offline-terms orders need an
// proforma invoice document generated automatically.
const OFFLINE_TERMS_METHOD = 'offline-terms';
const PROFORMA_INVOICE_TRIGGER_STATE = 'PaymentAuthorized';

@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin, AccessControlPlugin, AcquiringPlugin],
    entities: [Document, OrganizationRequisites],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [DocumentsResolver, DocumentFieldResolver, ProformaInvoiceDocumentFieldResolver],
    },
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [
            DocumentsAdminResolver,
            DocumentFieldResolver,
            OrganizationFieldResolver,
            ProformaInvoiceDocumentFieldResolver,
        ],
    },
    providers: [
        DocumentsService,
        PdfBrowserService,
        PdfGeneratorService,
        ProformaRequeueService,
        OrganizationEventService,
    ],
    exports: [
        DocumentsService,
        PdfGeneratorService,
        ProformaRequeueService,
        OrganizationEventService,
    ],
    compatibility: '>0.0.0',
})
export class DocumentsPlugin implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private connection: TransactionalConnection,
        private documentsService: DocumentsService,
        private pdfGeneratorService: PdfGeneratorService,
        private proformaInvoiceService: ProformaInvoiceService,
    ) {}

    onApplicationBootstrap(): void {
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            async event => {
                if (event.toState !== PROFORMA_INVOICE_TRIGGER_STATE) return;
                await this.onOfflineTermsPaymentAuthorized(event);
            },
            loggerCtx,
        );
        subscribeAndLog(
            this.eventBus,
            ProformaInvoiceIssuedEvent,
            event => this.ensureDocument(event.ctx, event.proformaInvoice),
            loggerCtx,
        );
    }

    private async onOfflineTermsPaymentAuthorized(event: OrderStateTransitionEvent): Promise<void> {
        const order = await this.connection
            .getRepository(event.ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.payments', 'payments')
            .where('order.id = :id', { id: event.order.id })
            .getOne();
        if (!order) return;

        const isOfflineTerms = order.payments?.some(p => p.method === OFFLINE_TERMS_METHOD);
        if (!isOfflineTerms) return;

        // The split was materialized by the payment handler before this transition; read it back.
        const proformaInvoices = await this.proformaInvoiceService.findByOrderId(
            event.ctx,
            Number(order.id),
        );
        for (const proformaInvoice of proformaInvoices) {
            if (proformaInvoice.status === 'superseded') continue;
            await this.ensureDocument(event.ctx, proformaInvoice);
        }
    }

    private async ensureDocument(
        ctx: RequestContext,
        proformaInvoice: ProformaInvoice,
    ): Promise<void> {
        const { document, created } = await this.documentsService.createProformaInvoicePlaceholder(
            ctx,
            proformaInvoice,
        );
        if (created) await this.pdfGeneratorService.enqueue(document.id);
    }
}
