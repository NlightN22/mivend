import { Logger } from '@nestjs/common';

import type { CounterpartyDiscountRuleInput } from './counterparty-discount-rule.service';
import type { DiscountRule } from './discount-rule.entity';
import { loggerCtx } from './types';

// Mirrors plugin-erp-integration's version-compare.ts — not imported since domain plugins never
// depend on erp-integration (layering runs the other way).
export function isVersionNewer(candidate: string, than: string): boolean {
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

// Same erpId-prefix convention DiscountRuleService.isPortalOrigin uses.
function isPortalOrigin(erpId: string): boolean {
    return erpId.startsWith('portal-');
}

// A deactivated row is only reactivated by a strictly newer version.
export function blockedByDeactivatedRow(
    record: DiscountRule | null | undefined,
    input: CounterpartyDiscountRuleInput,
): boolean {
    if (
        !record ||
        record.active ||
        isVersionNewer(input.sourceVersion, record.sourceVersion ?? '')
    ) {
        return false;
    }
    Logger.warn(
        `discount-rule ${input.erpId}: update at version=${input.sourceVersion} does not ` +
            `beat the deactivated row's own version=${record.sourceVersion} — not reactivating`,
        loggerCtx,
    );
    return true;
}

export type ConflictResolution =
    | { skip: true; conflict: DiscountRule }
    | { skip: false; active: boolean; toSupersede: DiscountRule[] };

// Pure decision over the active rules sharing the input's scope (issue #108's conflict policy).
export function resolveConflicts(
    conflicts: DiscountRule[],
    input: CounterpartyDiscountRuleInput,
): ConflictResolution {
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
            return { skip: true, conflict };
        }
        toSupersede.push(conflict);
    }
    return { skip: false, active, toSupersede };
}

export function counterpartyRuleValues(
    input: CounterpartyDiscountRuleInput,
    active: boolean,
): Partial<DiscountRule> {
    return {
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
}
