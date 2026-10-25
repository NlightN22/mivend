import type { DiscountConditionMetric } from './discount-setup-evaluation';

// Mirrored in the setup-documents migration so a worker never runs before a server bootstrap seeded them.
export const KNOWN_CONDITION_KINDS: ReadonlyArray<readonly [string, DiscountConditionMetric]> = [
    ['ПоКоличествуТовара', 'quantity'],
    ['ПоСуммеДокумента', 'amount'],
    ['БезУсловий', 'unconditional'],
];

export const KNOWN_OPERATION_KINDS: readonly string[] = ['ПоНоменклатуре'];
