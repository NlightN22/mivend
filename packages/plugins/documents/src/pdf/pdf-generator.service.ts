import { Injectable, OnModuleInit } from '@nestjs/common';
import { Readable } from 'stream';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AssetService,
    ConfigService,
    JobQueue,
    JobQueueService,
    Logger,
    Order,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { Counterparty } from '@mivend/plugin-counterparty';
import { InvoiceService } from '@mivend/plugin-acquiring';

import { GENERATE_DOCUMENT_QUEUE, loggerCtx } from '../constants';
import { Document } from '../entities/document.entity';
import { DocumentsService } from '../documents.service';
import { buildInvoiceTemplateData, renderInvoiceHtml, InvoiceSource } from './invoice-template';
import { buildContractTemplateData, renderContractHtml } from './contract-template';
import { PdfBrowserService } from './pdf-browser.service';

interface GenerateDocumentJobData {
    documentId: string;
}

// Orchestrates: fetch data -> build HTML (pure, unit-testable) -> print via
// Puppeteer -> save as a Vendure Asset. Runs inside the existing worker process
// via JobQueueService — see apps/server/src/worker.ts, which already calls
// startJobQueue() generically, so this queue rides on the already-configured
// BullMQJobQueuePlugin with no further wiring.
@Injectable()
export class PdfGeneratorService implements OnModuleInit {
    private queue!: JobQueue<GenerateDocumentJobData>;

    constructor(
        private jobQueueService: JobQueueService,
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private assetService: AssetService,
        private configService: ConfigService,
        private documentsService: DocumentsService,
        private pdfBrowserService: PdfBrowserService,
        private invoiceService: InvoiceService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue({
            name: GENERATE_DOCUMENT_QUEUE,
            process: async job => {
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                await this.generate(ctx, job.data.documentId);
            },
        });
    }

    async enqueue(documentId: ID): Promise<void> {
        await this.queue.add({ documentId: String(documentId) }, { retries: 3 });
    }

    async generate(ctx: RequestContext, documentId: ID): Promise<void> {
        const document = await this.documentsService.findOne(ctx, documentId);
        if (!document) {
            Logger.error(`generate: document ${documentId} not found`, loggerCtx);
            return;
        }
        try {
            await this.documentsService.markGenerating(ctx, documentId);

            const html =
                document.type === 'contract'
                    ? await this.buildContractHtml(ctx, document)
                    : await this.buildInvoiceHtml(ctx, document);
            const pdfBuffer = await this.pdfBrowserService.renderPdf(html);

            const asset = await this.assetService.createFromFileStream(
                Readable.from(pdfBuffer),
                `${document.number}.pdf`,
                ctx,
            );
            if (!('id' in asset)) {
                throw new Error(
                    `Asset creation failed for document ${documentId}: mime type not recognized`,
                );
            }
            await this.documentsService.markReady(ctx, documentId, asset.id);
            Logger.verbose(`Generated PDF for document ${documentId}`, loggerCtx);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            await this.documentsService.markFailed(ctx, documentId, message);
        }
    }

    private async getBuyerLegalName(ctx: RequestContext, counterpartyId: string): Promise<string> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: counterpartyId } });
        return counterparty?.legalName ?? `Counterparty #${counterpartyId}`;
    }

    // Embeds the logo as a base64 data URI rather than a URL — Puppeteer runs
    // server-side with no reliable public hostname to resolve, and reading the
    // asset's bytes directly avoids that entirely. Returns null when no logo
    // has been set via setOrganizationLogo (falls back to the letter badge).
    private async getLogoDataUri(
        ctx: RequestContext,
        requisites: { logoAssetId: string | null },
    ): Promise<string | null> {
        if (!requisites.logoAssetId) return null;
        const asset = await this.assetService.findOne(ctx, requisites.logoAssetId);
        if (!asset) return null;
        const buffer = await this.configService.assetOptions.assetStorageStrategy.readFileToBuffer(
            asset.source,
        );
        return `data:${asset.mimeType};base64,${buffer.toString('base64')}`;
    }

    private async buildInvoiceHtml(ctx: RequestContext, document: Document): Promise<string> {
        if (!document.orderId) {
            throw new Error(`Document ${document.id} has no orderId — cannot render an invoice`);
        }
        const order = await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.lines', 'lines')
            .leftJoinAndSelect('lines.productVariant', 'variant')
            .where('order.id = :id', { id: document.orderId })
            .getOne();
        if (!order) {
            throw new Error(`Order ${document.orderId} not found for document ${document.id}`);
        }

        // One document per organization-split Invoice (docs/payments.md "Organizations") —
        // render only that organization's lines/requisites/total, not the whole order. Legacy
        // documents with no invoiceId (predate splitting) fall back to the whole order against
        // the single "active" organization, same as before.
        let requisites;
        let source: InvoiceSource;
        if (document.invoiceId) {
            const invoice = await this.invoiceService.findOne(ctx, Number(document.invoiceId));
            if (!invoice) {
                throw new Error(
                    `Invoice ${document.invoiceId} not found for document ${document.id}`,
                );
            }
            requisites = await this.documentsService.getRequisitesById(ctx, invoice.organizationId);
            const orgLines = order.lines.filter(
                line => line.productVariant.customFields?.organizationId === invoice.organizationId,
            );
            source = {
                documentNumber: document.number,
                issueDate: document.issueDate,
                currencyCode: invoice.currencyCode,
                totalAmount: invoice.amount,
                lines: orgLines,
            };
        } else {
            requisites = await this.documentsService.getActiveRequisites(ctx);
            source = {
                documentNumber: order.code,
                issueDate: new Date(order.orderPlacedAt ?? order.createdAt),
                currencyCode: order.currencyCode,
                totalAmount: order.totalWithTax,
                lines: order.lines,
            };
        }

        const buyerLegalName = await this.getBuyerLegalName(ctx, document.counterpartyId);
        const logoDataUri = await this.getLogoDataUri(ctx, requisites);
        return renderInvoiceHtml(
            buildInvoiceTemplateData(source, requisites, buyerLegalName, logoDataUri),
        );
    }

    private async buildContractHtml(ctx: RequestContext, document: Document): Promise<string> {
        const requisites = await this.documentsService.getActiveRequisites(ctx);
        const buyerLegalName = await this.getBuyerLegalName(ctx, document.counterpartyId);
        const logoDataUri = await this.getLogoDataUri(ctx, requisites);
        return renderContractHtml(
            buildContractTemplateData(document.number, requisites, buyerLegalName, logoDataUri),
        );
    }
}
