import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import {
    DiscountRule,
    DiscountRuleCondition,
    DiscountRuleRecipientType,
} from './discount-rule.entity';
import { Counterparty } from '@mivend/plugin-counterparty';
import { loggerCtx } from './types';

export interface CounterpartyDiscountRuleInput {
    erpId: string;
    recipientType: DiscountRuleRecipientType;
    recipientErpId: string;
    productErpId: string | null;
    condition: DiscountRuleCondition;
    conditionValue: number;
    percent: number;
    limitAmount: number | null;
    validFrom: Date;
    // Real optional presence (proto3 `optional Timestamp`) — null means no expiry, never
    // defaulted to a required Date the way the other two trigger shapes' own contracts allow.
    validTo: Date | null;
    sourceVersion: string;
}

// Same erpId-prefix convention DiscountRuleService.isPortalOrigin uses — kept as its own tiny
// local copy rather than a shared export, same reasoning as this file's isVersionNewer below.
function isPortalOrigin(erpId: string): boolean {
    return erpId.startsWith('portal-');
}

// Mirrors plugin-erp-integration's version-compare.ts — not imported since domain plugins never
// depend on erp-integration (layering runs the other way).
function isVersionNewer(candidate: string, than: string): boolean {
    const a = tryParseBigInt(candidate);
    const b = tryParseBigInt(than);
    if (a !== undefined && b !== undefined) return a > b;
    return candidate > than;
}

function tryParseBigInt(value: string): bigint | undefined {
    if (!/^\d+$/.test(value)) return undefined;
    try {
        return BigInt(value);
    } catch {
        return undefined;
    }
}

// Issue #108: counterparty/contract + optional product-scoped ERP discount rules
// (DiscountRuleChanged) — split out of DiscountRuleService the same way #107's
// PromoDiscountRuleService was, a different write/read shape sharing only the DiscountRule table.
@Injectable()
export class CounterpartyDiscountRuleService {
    constructor(private connection: TransactionalConnection) {}

    // Write-time conflict policy for (recipientType, recipientErpId, productErpId) scope — see
    // issue #108's own comment for the full ERP-vs-ERP/ERP-vs-portal decision and reasoning.
    async upsertCounterpartyRule(
        ctx: RequestContext,
        input: CounterpartyDiscountRuleInput,
    ): Promise<DiscountRule> {
        const repo = this.connection.getRepository(ctx, DiscountRule);

        // Decide everything first, mutate nothing until every decision is made — docs/ai/erp-streams-map.md.
        let record = await repo.findOne({ where: { erpId: input.erpId } });
        if (
            record &&
            !record.active &&
            !isVersionNewer(input.sourceVersion, record.sourceVersion ?? '')
        ) {
            Logger.warn(
                `discount-rule ${input.erpId}: update at version=${input.sourceVersion} does not ` +
                    `beat the deactivated row's own version=${record.sourceVersion} — not reactivating`,
                loggerCtx,
            );
            return record;
        }

        const conflicts = await this.findActiveConflicts(ctx, input);
        let active = true;
        const toSupersede: DiscountRule[] = [];
        for (const conflict of conflicts) {
            if (isPortalOrigin(conflict.erpId)) {
                Logger.warn(
                    `discount-rule ${input.erpId}: conflicts with portal-sourced rule ${conflict.erpId} ` +
                        `on recipient ${input.recipientType}/${input.recipientErpId} product=${input.productErpId ?? 'all'} ` +
                        `— not auto-overwriting, writing inactive, needs manual resolution`,
                    loggerCtx,
                );
                active = false;
                continue;
            }
            if (!isVersionNewer(input.sourceVersion, conflict.sourceVersion ?? '')) {
                Logger.warn(
                    `discount-rule ${input.erpId}: stale event (version=${input.sourceVersion}) vs ` +
                        `active conflicting rule ${conflict.erpId} (version=${conflict.sourceVersion}), skipping`,
                    loggerCtx,
                );
                return conflict;
            }
            toSupersede.push(conflict);
        }

        for (const conflict of toSupersede) {
            conflict.active = false;
            await repo.save(conflict);
            Logger.verbose(
                `discount-rule ${input.erpId}: superseded older rule ${conflict.erpId} (version=${conflict.sourceVersion})`,
                loggerCtx,
            );
        }

        const values: Partial<DiscountRule> = {
            erpId: input.erpId,
            priceTypeCode: null,
            facetCode: null,
            facetValueCode: null,
            minWeightKg: null,
            minAmount: null,
            triggerProductErpId: null,
            giftProductErpId: null,
            giftQuantity: null,
            operationKind: null,
            recipientType: input.recipientType,
            recipientErpId: input.recipientErpId,
            productErpId: input.productErpId,
            condition: input.condition,
            conditionValue: input.conditionValue,
            percent: input.percent,
            limitAmount: input.limitAmount,
            validFrom: input.validFrom,
            validTo: input.validTo,
            sourceVersion: input.sourceVersion,
            active,
        };
        if (record) {
            Object.assign(record, values);
        } else {
            record = repo.create(values);
        }
        return repo.save(record);
    }

    // Tombstone (is_deleted=true) — deactivate by erpId only, never touch other fields, same
    // convention ContractService.deactivateTombstone/PointOfSaleService use for their own streams.
    // Cancellation always wins regardless of version; stores it for upsertCounterpartyRule's own
    // reactivation guard above — see docs/ai/erp-streams-map.md.
    async deactivateTombstone(ctx: RequestContext, erpId: string, version: string): Promise<void> {
        const repo = this.connection.getRepository(ctx, DiscountRule);
        const entity = await repo.findOne({ where: { erpId } });
        if (!entity) return;
        entity.active = false;
        if (version) entity.sourceVersion = version;
        await repo.save(entity);
    }

    private async findActiveConflicts(
        ctx: RequestContext,
        input: CounterpartyDiscountRuleInput,
    ): Promise<DiscountRule[]> {
        const qb = this.connection
            .getRepository(ctx, DiscountRule)
            .createQueryBuilder('dr')
            .where('dr.active = true')
            .andWhere('dr.erpId != :erpId', { erpId: input.erpId })
            .andWhere('dr.recipientType = :recipientType', { recipientType: input.recipientType })
            .andWhere('dr.recipientErpId = :recipientErpId', {
                recipientErpId: input.recipientErpId,
            });
        if (input.productErpId === null) {
            qb.andWhere('dr.productErpId IS NULL');
        } else {
            qb.andWhere('dr.productErpId = :productErpId', { productErpId: input.productErpId });
        }
        return qb.getMany();
    }

    // Null with no order context, same invariant #107's promo rules use. byQuantity compares
    // quantityByProductErpId (reused from promo-product-lookup.ts) for productErpId, or its sum
    // across all products when the rule has none; byDocumentAmount always compares documentAmount.
    async getBestPercent(
        ctx: RequestContext,
        order: Order | undefined,
        counterparty: Counterparty | null,
        productErpId: string | null,
        quantityByProductErpId: Map<string, number>,
        documentAmount: number,
        now: Date,
    ): Promise<number | null> {
        if (!order) return null;
        const recipients: Array<{ type: DiscountRuleRecipientType; erpId: string }> = [];
        if (counterparty) recipients.push({ type: 'counterparty', erpId: counterparty.erpId });
        if (order.customFields.erpContractId) {
            recipients.push({ type: 'contract', erpId: order.customFields.erpContractId });
        }
        if (recipients.length === 0) return null;

        const rules = await this.connection
            .getRepository(ctx, DiscountRule)
            .createQueryBuilder('dr')
            .where('dr.active = true')
            .andWhere('dr.validFrom <= :now', { now })
            .andWhere('(dr.validTo IS NULL OR dr.validTo >= :now)', { now })
            .andWhere(
                recipients
                    .map(
                        (_, i) =>
                            `(dr.recipientType = :recipientType${i} AND dr.recipientErpId = :recipientErpId${i})`,
                    )
                    .join(' OR '),
                Object.fromEntries(
                    recipients.flatMap((r, i) => [
                        [`recipientType${i}`, r.type],
                        [`recipientErpId${i}`, r.erpId],
                    ]),
                ),
            )
            .getMany();

        const productQuantity = quantityByProductErpId.get(productErpId ?? '') ?? 0;
        const totalQuantity = [...quantityByProductErpId.values()].reduce((a, b) => a + b, 0);

        const matching = rules.filter(rule => {
            // Safe default until limitAmount enforcement exists (mivend#154) — never apply uncapped.
            if (rule.limitAmount !== null) return false;
            if (rule.productErpId !== null && rule.productErpId !== productErpId) return false;
            if (rule.condition === 'byQuantity') {
                const qty = rule.productErpId !== null ? productQuantity : totalQuantity;
                return qty >= (rule.conditionValue ?? 0);
            }
            // documentAmount is kopecks; conditionValue is rubles (price.handler.ts's own convention).
            return documentAmount >= Math.round((rule.conditionValue ?? 0) * 100);
        });

        if (matching.length === 0) return null;
        return Math.max(...matching.map(r => r.percent));
    }
}
