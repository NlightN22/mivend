export type FilterSide = 'product' | 'counterparty';
export type FilterField = 'manufacturer' | 'product' | 'counterparty';

export interface FilterTerm {
    side: FilterSide;
    position: number;
    field: FilterField;
    hierarchical: boolean;
    negated: boolean;
    refs: string[];
}

export interface FilterClassification {
    terms: FilterTerm[];
    // Null = every condition is evaluable; otherwise the stored document stays inactive with this reason.
    reason: string | null;
}

const FIELDS: Record<string, { side: FilterSide; field: FilterField }> = {
    'Номенклатура.Производитель': { side: 'product', field: 'manufacturer' },
    Номенклатура: { side: 'product', field: 'product' },
    Контрагент: { side: 'counterparty', field: 'counterparty' },
};

interface Comparison {
    hierarchical: boolean;
    negated: boolean;
    single: boolean;
}

const COMPARISONS: Record<string, Comparison> = {
    Равно: { hierarchical: false, negated: false, single: true },
    НеРавно: { hierarchical: false, negated: true, single: true },
    ВСписке: { hierarchical: false, negated: false, single: false },
    НеВСписке: { hierarchical: false, negated: true, single: false },
    ВИерархии: { hierarchical: true, negated: false, single: true },
    НеВИерархии: { hierarchical: true, negated: true, single: true },
    ВСпискеПоИерархии: { hierarchical: true, negated: false, single: false },
    НеВСпискеПоИерархии: { hierarchical: true, negated: true, single: false },
};

const reject = (reason: string): FilterClassification => ({ terms: [], reason });

// A value is a SourceFieldValue in proto JSON: only {refId} is a reference; other kinds are rejected.
// Anything outside the known field, comparison and ref-value set is rejected whole, never guessed.
export function classifySelectionFilter(
    filter: unknown[] | null,
    side: FilterSide,
): FilterClassification {
    if (!filter || filter.length === 0) return reject('empty-filter');
    const terms: FilterTerm[] = [];
    for (const [position, raw] of filter.entries()) {
        const condition = (raw ?? {}) as Record<string, unknown>;
        const field = FIELDS[String(condition.field ?? '')];
        if (!field || field.side !== side) return reject('unknown-filter-field');
        const comparison = COMPARISONS[String(condition.comparison ?? '')];
        if (!comparison) return reject('unknown-comparison');
        if (field.side === 'counterparty' && comparison.hierarchical) {
            return reject('unsupported-comparison');
        }
        const values = Array.isArray(condition.values) ? condition.values : [];
        const refs: string[] = [];
        for (const value of values) {
            const refId = (value as Record<string, unknown> | null)?.refId;
            if (typeof refId !== 'string' || !refId) return reject('unknown-value-type');
            refs.push(refId);
        }
        if (refs.length === 0 || (comparison.single && refs.length !== 1)) {
            return reject('invalid-values');
        }
        terms.push({
            side,
            position,
            field: field.field,
            hierarchical: comparison.hierarchical,
            negated: comparison.negated,
            refs,
        });
    }
    return { terms, reason: null };
}
