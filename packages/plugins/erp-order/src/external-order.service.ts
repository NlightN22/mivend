import { OrderStatusHistoryService } from './order-status-history.service';
import { OrderStatusReferenceService } from './order-status-reference.service';
import { Injectable } from '@nestjs/common';
import {
    ConfigService,
    Logger,
    Order,
    OrderLine,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { withAggregateLock } from 'shared';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { nextExternalErpStatus } from './external-order-state';
import { buildExternalOrderLines, externalLinesSignature } from './external-order-lines';
import type { VariantTaxRef } from './external-order-lines';
import type { ExternalOrderInput, ExternalOrderResult } from './external-order.types';
import './types';

const counterpartyLockKey = (erpId: string): string => `external-order-counterparty:${erpId}`;

interface OrderTotals {
    subTotal: number;
    subTotalWithTax: number;
}

export function computeExternalTotals(input: ExternalOrderInput): OrderTotals {
    const linesTotal = input.lines.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
    const total = input.totalWithTaxMinor ?? linesTotal;
    const vat = input.vatTotalMinor ?? 0;
    return input.amountIncludesVat
        ? { subTotal: total - vat, subTotalWithTax: total }
        : { subTotal: total, subTotalWithTax: total + vat };
}

// Orders that arrive from the ERP with no mivend orderUuid (#215). The row is created directly in
// the state matching the ERP status; the externalOrderProcess guard blocks every transition.
@Injectable()
export class ExternalOrderService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly configService: ConfigService,
        private readonly counterpartyService: CounterpartyService,
        private readonly statusHistory: OrderStatusHistoryService,
        private readonly statusReference: OrderStatusReferenceService,
    ) {}

    async findByErpOrderId(
        ctx: RequestContext,
        erpOrderId: string,
    ): Promise<{ id: string; isExternal: boolean; erpStatus: string | null } | null> {
        const rows: Array<{ id: string; isExternal: boolean; erpStatus: string | null }> =
            await this.connection.getRepository(ctx, Order).query(
                `SELECT id, "customFieldsIsexternal" AS "isExternal",
                        "customFieldsErpstatus" AS "erpStatus" FROM "order"
                 WHERE "customFieldsErporderid" = $1 LIMIT 1`,
                [erpOrderId],
            );
        return rows[0]
            ? {
                  id: String(rows[0].id),
                  isExternal: rows[0].isExternal === true,
                  erpStatus: rows[0].erpStatus ?? null,
              }
            : null;
    }

    async upsert(ctx: RequestContext, input: ExternalOrderInput): Promise<ExternalOrderResult> {
        return withAggregateLock(
            this.connection,
            ctx,
            `external-order:${input.erpOrderId}`,
            txCtx =>
                input.counterpartyErpId
                    ? withAggregateLock(
                          this.connection,
                          txCtx,
                          counterpartyLockKey(input.counterpartyErpId),
                          lockedCtx => this.apply(lockedCtx, input),
                      )
                    : this.apply(txCtx, input),
        );
    }

    async attachCounterparty(
        ctx: RequestContext,
        counterpartyErpId: string,
        counterpartyId: string,
    ): Promise<number> {
        return withAggregateLock(
            this.connection,
            ctx,
            counterpartyLockKey(counterpartyErpId),
            async txCtx => {
                const [rows]: [unknown[], number] = await this.connection
                    .getRepository(txCtx, Order)
                    .query(
                        `UPDATE "order" SET "customFieldsCounterpartyid" = $1::text,
                             "customFieldsPendingcounterpartyerpid" = NULL,
                             "customFieldsBranchid" = COALESCE("customFieldsBranchid",
                                 (SELECT c."branchId" FROM counterparty c WHERE c.id::text = $1::text))
                         WHERE "customFieldsPendingcounterpartyerpid" = $2
                           AND "customFieldsCounterpartyid" IS NULL
                         RETURNING id`,
                        [counterpartyId, counterpartyErpId],
                    );
                return rows.length;
            },
        );
    }

    private async apply(
        ctx: RequestContext,
        input: ExternalOrderInput,
    ): Promise<ExternalOrderResult> {
        const counterparty = input.counterpartyErpId
            ? await this.counterpartyService.findByErpId(ctx, input.counterpartyErpId)
            : null;
        const counterpartyPending = Boolean(input.counterpartyErpId) && counterparty === null;
        const variants = await this.loadVariants(ctx, input);
        const existing = await this.findByErpOrderId(ctx, input.erpOrderId);
        if (existing && !existing.isExternal) {
            throw new Error(`Order ${existing.id} is not external, refusing to overwrite it`);
        }
        if (input.skippedLineCount > 0) {
            Logger.warn(
                `external order ${input.erpOrderId}: ${input.skippedLineCount} line(s) skipped (product unknown)`,
                'ExternalOrderService',
            );
        }
        const dictionary = await this.statusReference.dictionary(ctx);
        const nextStatus = existing
            ? nextExternalErpStatus(existing.erpStatus, input.erpStatus, dictionary)
            : (input.erpStatus ?? dictionary.codeWith('externalDefault'));
        const counterpartyFields = input.counterpartyErpId
            ? {
                  counterpartyId: counterparty ? String(counterparty.id) : null,
                  pendingCounterpartyErpId: counterpartyPending ? input.counterpartyErpId : null,
                  branchId: counterparty?.branchId ?? null,
              }
            : {};
        const customFields = {
            ...counterpartyFields,
            erpOrderStatus: input.erpOrderStatus,
            externalLinesIncomplete: input.skippedLineCount > 0,
            ...(input.documentNumber === null
                ? {}
                : { erpRegistrationDocumentNumber: input.documentNumber }),
            ...(input.contractId === null ? {} : { erpContractId: input.contractId }),
            ...(input.paidAmountMinor === null ? {} : { erpPaidAmount: input.paidAmountMinor }),
            ...(nextStatus === null
                ? {}
                : { erpStatus: nextStatus, erpStatusAt: input.erpStatusAt ?? new Date() }),
        };
        const totals = computeExternalTotals(input);
        const repo = this.connection.getRepository(ctx, Order);

        if (existing) {
            await repo.update(existing.id, {
                ...(nextStatus === null ? {} : { state: dictionary.vendureState(nextStatus) }),
                ...totals,
                customFields,
            });
            if (nextStatus !== null) {
                await this.statusHistory.record(ctx, existing.id, nextStatus, input.erpStatusAt);
            }
            await this.replaceLinesIfChanged(ctx, existing.id, input, variants);
            return { kind: 'updated', orderId: existing.id, counterpartyPending };
        }

        const createdStatus = nextStatus ?? dictionary.codeWith('externalDefault');
        const placedAt = input.orderDate ?? new Date();
        const order = await repo.save(
            new Order({
                code: await this.configService.orderOptions.orderCodeStrategy.generate(ctx),
                state: dictionary.vendureState(createdStatus),
                active: false,
                orderPlacedAt: placedAt,
                createdAt: placedAt,
                couponCodes: [],
                shippingAddress: {},
                billingAddress: {},
                currencyCode: ctx.channel.defaultCurrencyCode,
                shipping: 0,
                shippingWithTax: 0,
                channels: [ctx.channel],
                ...totals,
                customFields: {
                    ...customFields,
                    isExternal: true,
                    erpOrderId: input.erpOrderId,
                },
            }),
        );
        await this.insertLines(ctx, order, input, variants);
        await this.statusHistory.record(ctx, order.id, createdStatus, input.erpStatusAt);
        return { kind: 'created', orderId: String(order.id), counterpartyPending };
    }

    private async loadVariants(
        ctx: RequestContext,
        input: ExternalOrderInput,
    ): Promise<Map<string, VariantTaxRef>> {
        const ids = [...new Set(input.lines.map(l => l.productVariantId))];
        if (ids.length === 0) return new Map();
        const rows: Array<{ id: string; taxCategoryId: string }> = await this.connection
            .getRepository(ctx, Order)
            .query(`SELECT id, "taxCategoryId" FROM product_variant WHERE id = ANY($1::int[])`, [
                ids,
            ]);
        return new Map(
            rows.map(r => [
                String(r.id),
                { id: String(r.id), taxCategoryId: String(r.taxCategoryId) },
            ]),
        );
    }

    private async insertLines(
        ctx: RequestContext,
        order: Pick<Order, 'id'>,
        input: ExternalOrderInput,
        variants: Map<string, VariantTaxRef>,
    ): Promise<void> {
        const lines = buildExternalOrderLines(
            order,
            input.lines,
            variants,
            input.amountIncludesVat,
        );
        if (lines.length > 0) await this.connection.getRepository(ctx, OrderLine).save(lines);
    }

    private async replaceLinesIfChanged(
        ctx: RequestContext,
        orderId: string,
        input: ExternalOrderInput,
        variants: Map<string, VariantTaxRef>,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, OrderLine);
        const current = await repo.find({
            where: { order: { id: orderId } },
            order: { id: 'ASC' },
        });
        const wanted = input.lines.filter(l => variants.has(l.productVariantId));
        const currentSignature = externalLinesSignature(
            current.map(l => ({
                productVariantId: String(l.productVariantId),
                quantity: l.quantity,
                unitPriceMinor: l.listPrice,
            })),
        );
        if (currentSignature === externalLinesSignature(wanted)) return;
        await repo.delete(current.map(l => String(l.id)));
        await this.insertLines(ctx, { id: orderId }, input, variants);
    }
}
