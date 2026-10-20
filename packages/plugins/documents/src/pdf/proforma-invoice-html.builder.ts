import { Injectable } from '@nestjs/common';
import { Logger, Order, RequestContext, TaxRate, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { isUnconfirmedTaxRateName } from 'shared';
import { Counterparty } from '@mivend/plugin-counterparty';
import { ProformaInvoiceService } from '@mivend/plugin-acquiring';

import { loggerCtx } from '../constants';
import { Document } from '../entities/document.entity';
import { DocumentsService } from '../documents.service';
import { resolveBuyerLegalName } from './buyer-legal-name';
import {
    contractPaymentPurpose,
    PartyInput,
    ProformaInvoiceSource,
    printedRowsTotal,
} from './proforma-invoice-data';
import {
    buildProformaInvoiceTemplateData,
    renderProformaInvoiceHtml,
} from './proforma-invoice-template';
import { applyPrintTimeVat } from './proforma-invoice-vat';
@Injectable()
export class ProformaInvoiceHtmlBuilder {
    constructor(
        private connection: TransactionalConnection,
        private documentsService: DocumentsService,
        private proformaInvoiceService: ProformaInvoiceService,
    ) {}

    async build(
        ctx: RequestContext,
        document: Document,
    ): Promise<{ html: string; noted: boolean }> {
        // Legacy documents with no proformaInvoiceId predate invoice splitting: they render the whole
        // order against the single active organization.
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
                documentNumber: proformaInvoice.number,
                issueDate: proformaInvoice.issuedAt,
                dueDate: proformaInvoice.dueDate,
                currencyCode: proformaInvoice.currencyCode,
                totalAmount: proformaInvoice.amount,
                version: proformaInvoice.version,
                kind: proformaInvoice.kind,
                salesInvoiceNumber: proformaInvoice.salesInvoiceNumber,
                hasNewerVersion: proformaInvoice.status === 'superseded',
                paymentPurpose: proformaInvoice.contractName
                    ? contractPaymentPurpose(proformaInvoice.number, proformaInvoice.contractName)
                    : null,
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
            if (!source.paymentPurpose && source.lines.some(l => l.taxRate === undefined)) {
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
            const order = await this.loadOrder(ctx, document);
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
                dueDate: null,
                version: 1,
                kind: 'order-placed',
                salesInvoiceNumber: null,
                hasNewerVersion: false,
                paymentPurpose: null,
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

        const buyer = await this.buyer(ctx, document.counterpartyId);
        const data = buildProformaInvoiceTemplateData(source, requisites, buyer);
        if (data.paymentQr.problems.length > 0) {
            Logger.warn(
                `Document ${document.number}: payment QR not printed (${data.paymentQr.problems.join('; ')})`,
                loggerCtx,
            );
        }
        return { html: renderProformaInvoiceHtml(data), noted: source.hasNewerVersion };
    }

    private async loadOrder(ctx: RequestContext, document: Document): Promise<Order> {
        if (!document.orderId) {
            throw new Error(`Document ${document.id} has neither a proforma invoice nor an order`);
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
        return order;
    }

    async buyer(ctx: RequestContext, counterpartyId: string): Promise<PartyInput> {
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
}
