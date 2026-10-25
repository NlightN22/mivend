import { Logger } from '@nestjs/common';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { lockAggregates } from 'shared';
import type { Repository } from 'typeorm';
import { In } from 'typeorm';

import type { CounterpartyDiscountRuleInput } from './counterparty-discount-rule.service';
import {
    blockedByDeactivatedRow,
    counterpartyRuleValues,
    resolveConflicts,
} from './counterparty-rule-policy';
import { DiscountRule } from './discount-rule.entity';
import { loggerCtx } from './types';

export type CounterpartyRuleBatchOp =
    | { kind: 'upsert'; input: CounterpartyDiscountRuleInput }
    | { kind: 'tombstone'; erpId: string; version: string };

const WRITTEN_COLUMNS = [
    'priceTypeCode',
    'facetCode',
    'facetValueCode',
    'percent',
    'validFrom',
    'validTo',
    'minWeightKg',
    'minAmount',
    'triggerProductErpId',
    'triggerQuantity',
    'giftProductErpId',
    'giftQuantity',
    'operationKind',
    'recipientType',
    'recipientErpId',
    'productErpId',
    'condition',
    'conditionValue',
    'limitAmount',
    'sourceVersion',
    'active',
] as const;

const scopeKeyOf = (
    type: string | null,
    recipient: string | null,
    product: string | null,
): string => JSON.stringify([type, recipient, product]);
const ruleScope = (rule: DiscountRule): string =>
    scopeKeyOf(rule.recipientType, rule.recipientErpId, rule.productErpId);

// In-memory view of the rules a batch touches; ops run against it in order, writes happen once.
export class RuleWorkingSet {
    readonly byErpId = new Map<string, DiscountRule>();
    readonly dirty = new Set<string>();
    private readonly activeByScope = new Map<string, Map<string, DiscountRule>>();

    add(rule: DiscountRule): void {
        this.byErpId.set(rule.erpId, rule);
        this.attach(rule);
    }

    activeInScope(scope: string, exceptErpId: string): DiscountRule[] {
        return [...(this.activeByScope.get(scope)?.values() ?? [])].filter(
            r => r.erpId !== exceptErpId,
        );
    }

    mutate(rule: DiscountRule, change: () => void): void {
        this.detach(rule);
        change();
        this.byErpId.set(rule.erpId, rule);
        this.attach(rule);
        this.dirty.add(rule.erpId);
    }

    private attach(rule: DiscountRule): void {
        if (!rule.active) return;
        const scope = ruleScope(rule);
        const bucket = this.activeByScope.get(scope) ?? new Map<string, DiscountRule>();
        bucket.set(rule.erpId, rule);
        this.activeByScope.set(scope, bucket);
    }

    private detach(rule: DiscountRule): void {
        this.activeByScope.get(ruleScope(rule))?.delete(rule.erpId);
    }
}

// Same decisions as CounterpartyDiscountRuleService.upsertCounterpartyRule/deactivateTombstone,
// replayed in order over memory. The caller holds the entity locks; scope locks are taken here.
export function applyOps(set: RuleWorkingSet, ops: CounterpartyRuleBatchOp[]): boolean[] {
    return ops.map(op => {
        if (op.kind === 'tombstone') {
            const entity = set.byErpId.get(op.erpId);
            if (!entity) return false;
            set.mutate(entity, () => {
                entity.active = false;
                if (op.version) entity.sourceVersion = op.version;
            });
            return true;
        }
        const { input } = op;
        const record = set.byErpId.get(input.erpId) ?? null;
        if (blockedByDeactivatedRow(record, input)) return true;
        const resolution = resolveConflicts(
            set.activeInScope(
                scopeKeyOf(input.recipientType, input.recipientErpId, input.productErpId),
                input.erpId,
            ),
            input,
        );
        if (resolution.skip) return true;
        for (const conflict of resolution.toSupersede) {
            set.mutate(conflict, () => {
                conflict.active = false;
            });
            Logger.verbose(
                `discount-rule ${input.erpId}: superseded older rule ${conflict.erpId} (version=${conflict.sourceVersion})`,
                loggerCtx,
            );
        }
        const values = counterpartyRuleValues(input, resolution.active);
        const target = record ?? new DiscountRule();
        set.mutate(target, () => Object.assign(target, values));
        return true;
    });
}

async function loadWorkingSet(
    repo: Repository<DiscountRule>,
    ops: CounterpartyRuleBatchOp[],
): Promise<RuleWorkingSet> {
    const set = new RuleWorkingSet();
    const erpIds = [...new Set(ops.map(op => (op.kind === 'upsert' ? op.input.erpId : op.erpId)))];
    for (const rule of await repo.find({ where: { erpId: In(erpIds) } })) set.add(rule);

    const scopes = new Map<string, CounterpartyDiscountRuleInput>();
    for (const op of ops) {
        if (op.kind !== 'upsert') continue;
        const { input } = op;
        scopes.set(
            scopeKeyOf(input.recipientType, input.recipientErpId, input.productErpId),
            input,
        );
    }
    if (scopes.size > 0) {
        const inputs = [...scopes.values()];
        const conflicting = await repo
            .createQueryBuilder('dr')
            .where('dr.active = true')
            .andWhere(
                `(dr."recipientType", dr."recipientErpId", dr."productErpId" IS NULL, COALESCE(dr."productErpId", ''))
                 IN (SELECT s.t, s.r, s.p IS NULL, COALESCE(s.p, '')
                       FROM unnest(CAST(:types AS text[]), CAST(:recipients AS text[]), CAST(:products AS text[])) AS s(t, r, p))`,
                {
                    types: inputs.map(i => i.recipientType),
                    recipients: inputs.map(i => i.recipientErpId),
                    products: inputs.map(i => i.productErpId),
                },
            )
            .getMany();
        for (const rule of conflicting) if (!set.byErpId.has(rule.erpId)) set.add(rule);
    }
    return set;
}

async function writeDirty(repo: Repository<DiscountRule>, set: RuleWorkingSet): Promise<void> {
    if (set.dirty.size === 0) return;
    const rows = [...set.dirty].map(erpId => {
        const rule = set.byErpId.get(erpId)!;
        return { erpId, ...Object.fromEntries(WRITTEN_COLUMNS.map(c => [c, rule[c] ?? null])) };
    });
    await repo
        .createQueryBuilder()
        .insert()
        .values(rows as never)
        .orUpdate([...WRITTEN_COLUMNS, 'updatedAt'], ['erpId'])
        .execute();
}

export async function applyCounterpartyRuleBatch(
    connection: TransactionalConnection,
    ctx: RequestContext,
    ops: CounterpartyRuleBatchOp[],
): Promise<boolean[]> {
    if (ops.length === 0) return [];
    return connection.withTransaction(ctx, async txCtx => {
        const repo = connection.getRepository(txCtx, DiscountRule);
        const scopeKeys = ops.flatMap(op =>
            op.kind === 'upsert'
                ? [
                      `discount-rule-scope:${scopeKeyOf(
                          op.input.recipientType,
                          op.input.recipientErpId,
                          op.input.productErpId,
                      )}`,
                  ]
                : [],
        );
        await lockAggregates(connection, txCtx, scopeKeys);
        const set = await loadWorkingSet(repo, ops);
        const results = applyOps(set, ops);
        await writeDirty(repo, set);
        return results;
    });
}
