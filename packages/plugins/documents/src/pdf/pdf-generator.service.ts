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
    TaxRate,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { isUnconfirmedTaxRateName } from 'shared';
import { Counterparty } from '@mivend/plugin-counterparty';
import { ProformaInvoiceService } from '@mivend/plugin-acquiring';

import { GENERATE_DOCUMENT_QUEUE, loggerCtx } from '../constants';
import { Document } from '../entities/document.entity';
import { DocumentsService } from '../documents.service';
import { resolveBuyerLegalName } from './buyer-legal-name';
import { PartyInput, ProformaInvoiceSource, printedRowsTotal } from './proforma-invoice-data';
import {
    buildProformaInvoiceTemplateData,
    renderProformaInvoiceHtml,
} from './proforma-invoice-template';
import { buildContractTemplateData, renderContractHtml } from './contract-template';
import { PdfBrowserService } from './pdf-browser.service';
import { applyPrintTimeVat } from './proforma-invoice-vat';

interface GenerateDocumentJobData {
    documentId: string;
}

// Orchestrates: fetch data -> build HTML (pure, unit-testable) -> print via
// Puppeteer -> save as a Vendure Asset. Runs inside the existing worker process
// via JobQueueService — see apps/server/src/worker.ts, which already calls
// startJobQueue() generically, so this queue rides on the already-configured
// DefaultJobQueuePlugin (issue #128) with no further wiring.
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
        private proformaInvoiceService: ProformaInvoiceService,
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
                    : await this.buildProformaInvoiceHtml(ctx, document);
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

    private async getBuyer(ctx: RequestContext, counterpartyId: string): Promise<PartyInput> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: counterpartyId } });
        return {
            name: resolveBuyerLegalName(counterparty?.fullName),
            inn: counterparty?.inn ?? null,
            kpp: counterparty?.kpp ?? null,
            address: counterparty?.legalAddress ?? null,
            phone: counterparty?.phone ?? null,
        };
    }

    // The sold unit's name is a variant custom field written by erp-integration; read raw because
    // this plugin does not depend on it (same pattern as DocumentsService.findOrderIdByErpId).
    private async loadUnitNames(
        ctx: RequestContext,
        variantIds: number[],
    ): Promise<Map<number, string>> {
        if (variantIds.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, 'product_variant')
            .createQueryBuilder('pv')
            .select('pv.id', 'id')
            .addSelect('pv."customFieldsUnitname"', 'unitName')
            .where('pv.id IN (:...ids)', { ids: variantIds })
            .getRawMany<{ id: number | string; unitName: string | null }>();
        return new Map(rows.filter(r => r.unitName).map(r => [Number(r.id), r.unitName as string]));
    }

    private async loadConfirmedRates(
        ctx: RequestContext,
        lines: ProformaInvoiceSource['lines'],
    ): Promise<Map<string, number>> {
        const names = [
            ...new Set(lines.filter(l => l.taxRate === null).map(l => l.taxCategoryName ?? '')),
        ].filter(Boolean);
        if (names.length === 0) return new Map();
        const rates = await this.connection.getRepository(ctx, TaxRate).find({
            where: { enabled: true, category: { name: In(names) } },
            relations: { category: true },
        });
        return new Map(
            rates
                .filter(r => !isUnconfirmedTaxRateName(r.name))
                .map(r => [r.category.name, r.value]),
        );
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

    private async buildProformaInvoiceHtml(
        ctx: RequestContext,
        document: Document,
    ): Promise<string> {
        if (!document.orderId) {
            throw new Error(
                `Document ${document.id} has no orderId — cannot render a proforma invoice`,
            );
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

        // One document per organization-split ProformaInvoice (docs/payments.md "Organizations") —
        // render only that organization's lines/requisites/total, not the whole order. Legacy
        // documents with no proformaInvoiceId (predate splitting) fall back to the whole order against
        // the single "active" organization, same as before.
        let requisites;
        let source: ProformaInvoiceSource;
        if (document.proformaInvoiceId) {
            const proformaInvoice = await this.proformaInvoiceService.findOne(
                ctx,
                Number(document.proformaInvoiceId),
            );
            if (!proformaInvoice) {
                throw new Error(
                    `ProformaInvoice ${document.proformaInvoiceId} not found for document ${document.id}`,
                );
            }
            requisites = await this.documentsService.getRequisitesById(
                ctx,
                proformaInvoice.organizationId,
            );
            this.documentsService.assertRequisitesComplete(requisites);
            const units = await this.loadUnitNames(
                ctx,
                proformaInvoice.lines.map(line => line.variantId),
            );
            source = {
                documentNumber: document.number,
                issueDate: document.issueDate,
                currencyCode: proformaInvoice.currencyCode,
                totalAmount: proformaInvoice.amount,
                version: proformaInvoice.version,
                superseded: proformaInvoice.status === 'superseded',
                lines: proformaInvoice.lines.map(line => ({
                    quantity: line.quantity,
                    unitPriceWithTax: line.unitPriceWithTax,
                    linePriceWithTax: line.linePriceWithTax,
                    discounts: line.discounts,
                    taxRate: line.taxRate,
                    taxCategoryName: line.taxCategoryName,
                    taxAmount: line.taxAmount,
                    unitName: units.get(line.variantId) ?? null,
                    productVariant: { name: line.name, sku: line.sku },
                })),
            };
            source.lines = applyPrintTimeVat(
                source.lines,
                await this.loadConfirmedRates(ctx, source.lines),
            );
            if (source.lines.some(l => l.taxRate === undefined)) {
                Logger.warn(
                    `Document ${document.number}: snapshot has no tax data, VAT printed as not specified`,
                    loggerCtx,
                );
            }
            if (printedRowsTotal(source) !== source.totalAmount) {
                Logger.error(
                    `Document ${document.number}: printed rows total ${printedRowsTotal(source)} differs ` +
                        `from the stored amount ${source.totalAmount}; printing the stored amount`,
                    loggerCtx,
                );
            }
        } else {
            requisites = await this.documentsService.getActiveRequisites(ctx);
            this.documentsService.assertRequisitesComplete(requisites);
            const units = await this.loadUnitNames(
                ctx,
                order.lines.map(line => Number(line.productVariant.id)),
            );
            source = {
                documentNumber: order.code,
                issueDate: new Date(order.orderPlacedAt ?? order.createdAt),
                currencyCode: order.currencyCode,
                totalAmount: order.totalWithTax,
                version: 1,
                superseded: false,
                lines: order.lines.map(line => ({
                    quantity: line.quantity,
                    unitPriceWithTax: line.unitPriceWithTax,
                    linePriceWithTax: line.linePriceWithTax,
                    discounts: line.discounts.map(d => ({ amount: d.amountWithTax })),
                    unitName: units.get(Number(line.productVariant.id)) ?? null,
                    productVariant: line.productVariant,
                })),
            };
        }

        const buyer = await this.getBuyer(ctx, document.counterpartyId);
        const data = buildProformaInvoiceTemplateData(source, requisites, buyer);
        if (data.paymentQr.problems.length > 0) {
            Logger.warn(
                `Document ${document.number}: payment QR not printed (${data.paymentQr.problems.join('; ')})`,
                loggerCtx,
            );
        }
        return renderProformaInvoiceHtml(data);
    }

    private async buildContractHtml(ctx: RequestContext, document: Document): Promise<string> {
        const requisites = await this.documentsService.getActiveRequisites(ctx);
        this.documentsService.assertRequisitesComplete(requisites);
        const buyerLegalName = (await this.getBuyer(ctx, document.counterpartyId)).name;
        const logoDataUri = await this.getLogoDataUri(ctx, requisites);
        return renderContractHtml(
            buildContractTemplateData(document.number, requisites, buyerLegalName, logoDataUri),
        );
    }
}
