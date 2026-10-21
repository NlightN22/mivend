import { Injectable, OnModuleInit } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AssetService,
    ConfigService,
    JobQueue,
    JobQueueService,
    Logger,
    RequestContext,
    RequestContextService,
} from '@vendure/core';

import { GENERATE_DOCUMENT_QUEUE, loggerCtx } from '../constants';
import { Document } from '../entities/document.entity';
import { DocumentsService } from '../documents.service';
import { SupersededProformaRerenderService } from '../superseded-proforma-rerender.service';
import { buildContractTemplateData, renderContractHtml } from './contract-template';
import { DocumentPdfStorageService } from './document-pdf-storage.service';
import { PdfBrowserService } from './pdf-browser.service';
import { ProformaInvoiceHtmlBuilder } from './proforma-invoice-html.builder';

interface GenerateDocumentJobData {
    documentId: string;
}

// Runs in the existing worker process: worker.ts already calls startJobQueue() generically,
// so this queue needs no extra wiring beyond DefaultJobQueuePlugin.
@Injectable()
export class PdfGeneratorService implements OnModuleInit {
    private queue!: JobQueue<GenerateDocumentJobData>;

    constructor(
        private jobQueueService: JobQueueService,
        private requestContextService: RequestContextService,
        private assetService: AssetService,
        private configService: ConfigService,
        private documentsService: DocumentsService,
        private pdfBrowserService: PdfBrowserService,
        private supersededRerender: SupersededProformaRerenderService,
        private proformaInvoiceHtml: ProformaInvoiceHtmlBuilder,
        private storage: DocumentPdfStorageService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue({
            name: GENERATE_DOCUMENT_QUEUE,
            process: job => this.generateNow(job.data.documentId),
        });
    }

    async generateNow(documentId: ID): Promise<void> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        await this.generate(ctx, documentId);
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

            const { html, noted } =
                document.type === 'contract'
                    ? { html: await this.buildContractHtml(ctx, document), noted: false }
                    : await this.proformaInvoiceHtml.build(ctx, document);
            const pdfBuffer = await this.pdfBrowserService.renderPdf(html);

            await this.storage.write(document.uuid, pdfBuffer);
            await this.documentsService.markReady(ctx, documentId);
            if (await this.supersededRerender.missedNote(ctx, document, noted)) {
                await this.enqueue(documentId);
            }
            Logger.verbose(`Generated PDF for document ${documentId}`, loggerCtx);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            await this.documentsService.markFailed(ctx, documentId, message);
        }
    }

    // Embedded as a base64 data URI: Puppeteer runs server-side with no reliable hostname to resolve.
    // Reading the asset bytes directly avoids that lookup entirely.
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

    private async buildContractHtml(ctx: RequestContext, document: Document): Promise<string> {
        const requisites = await this.documentsService.getActiveRequisites(ctx);
        this.documentsService.assertRequisitesComplete(requisites);
        const buyerLegalName = (await this.proformaInvoiceHtml.buyer(ctx, document.counterpartyId))
            .name;
        const logoDataUri = await this.getLogoDataUri(ctx, requisites);
        return renderContractHtml(
            buildContractTemplateData(document.number, requisites, buyerLegalName, logoDataUri),
        );
    }
}
