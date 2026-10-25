import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import {
    DiscountRule,
    DiscountRuleCondition,
    DiscountRuleRecipientType,
} from './discount-rule.entity';
import { Counterparty } from '@mivend/plugin-counterparty';
import { LookupMemo, memoized } from './lookup-memo';
import { applyCounterpartyRuleBatch } from './counterparty-discount-rule-batch';
import type { CounterpartyRuleBatchOp } from './counterparty-discount-rule-batch';
import { loggerCtx } from './types';
import {
    blockedByDeactivatedRow,
    counterpartyRuleValues,
    resolveConflicts,
} from './counterparty-rule-policy';

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

// Separate from DiscountRuleService: different write/read shape; shares only the DiscountRule table.
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
        if (blockedByDeactivatedRow(record, input)) return record!;

        const conflicts = await this.findActiveConflicts(ctx, input);
        const resolution = resolveConflicts(conflicts, input);
        if (resolution.skip) return resolution.conflict;

        for (const conflict of resolution.toSupersede) {
            conflict.active = false;
            await repo.save(conflict);
            Logger.verbose(
                `discount-rule ${input.erpId}: superseded older rule ${conflict.erpId} (version=${conflict.sourceVersion})`,
                loggerCtx,
            );
        }

        const values = counterpartyRuleValues(input, resolution.active);
        if (record) {
            Object.assign(record, values);
        } else {
            record = repo.create(values);
        }
        return repo.save(record);
    }

    // One transaction for a whole claimed batch; same decisions as the per-row methods, in op order.
    applyBatch(ctx: RequestContext, ops: CounterpartyRuleBatchOp[]): Promise<boolean[]> {
        return applyCounterpartyRuleBatch(this.connection, ctx, ops);
    }

    // Tombstone: deactivate by erpId only; cancellation wins regardless of version.
    // Stored so upsertCounterpartyRule's reactivation guard can see it.
    async deactivateTombstone(
        ctx: RequestContext,
        erpId: string,
        version: string,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, DiscountRule);
        const entity = await repo.findOne({ where: { erpId } });
        if (!entity) return false;
        entity.active = false;
        if (version) entity.sourceVersion = version;
        await repo.save(entity);
        return true;
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

    // Without an order (catalog) only the counterparty's own rules are read and the empty quantity map and
    // zero amount let just threshold-0 rules match, like the price-type ladder. A negative percent is a markup.
    // byQuantity sums quantityByProductErpId across all products when productErpId is unset.
    async getBestPercent(
        ctx: RequestContext,
        order: Order | undefined,
        counterparty: Counterparty | null,
        productErpId: string | null,
        quantityByProductErpId: Map<string, number>,
        documentAmount: number,
        now: Date,
        memo?: LookupMemo,
    ): Promise<number | null> {
        const recipients: Array<{ type: DiscountRuleRecipientType; erpId: string }> = [];
        if (counterparty) recipients.push({ type: 'counterparty', erpId: counterparty.erpId });
        if (order?.customFields.erpContractId) {
            recipients.push({ type: 'contract', erpId: order.customFields.erpContractId });
        }
        if (recipients.length === 0) return null;

        const rules = await memoized(
            memo,
            `cdr:${recipients.map(r => `${r.type}/${r.erpId}`).join(',')}`,
            () => this.loadRecipientRules(ctx, recipients, now),
        );

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

    private loadRecipientRules(
        ctx: RequestContext,
        recipients: Array<{ type: DiscountRuleRecipientType; erpId: string }>,
        now: Date,
    ): Promise<DiscountRule[]> {
        return this.connection
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
    }
}
