import { ID } from '@vendure/common/lib/shared-types';
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
import { ProformaInvoiceHtmlBuilder } from './pdf/proforma-invoice-html.builder';
import { SupersededProformaRerenderService } from './superseded-proforma-rerender.service';
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

// Offline-terms payments settle to Authorized, which Vendure maps to PaymentAuthorized;
// online-stub payments settle to PaymentSettled and must be excluded from proforma generation.
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
        SupersededProformaRerenderService,
        PdfBrowserService,
        PdfGeneratorService,
        ProformaInvoiceHtmlBuilder,
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
        private supersededRerender: SupersededProformaRerenderService,
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
            async event => {
                await this.ensureDocument(event.ctx, event.proformaInvoice);
                const { supersedesId } = event.proformaInvoice;
                if (supersedesId != null) await this.rerenderSuperseded(event.ctx, supersedesId);
            },
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
            if (proformaInvoice.status === 'superseded') {
                await this.rerenderSuperseded(event.ctx, proformaInvoice.id);
            } else {
                await this.ensureDocument(event.ctx, proformaInvoice);
            }
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

    private async rerenderSuperseded(ctx: RequestContext, proformaInvoiceId: ID): Promise<void> {
        const document = await this.supersededRerender.claim(ctx, proformaInvoiceId);
        if (document) await this.pdfGeneratorService.enqueue(document.id);
    }
}
