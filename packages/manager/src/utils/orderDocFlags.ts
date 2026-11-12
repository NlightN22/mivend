import { tr } from './lazyLabels';
import type { DocFlag, DocFlagAction, DocRow } from '@mivend/ui-kit';
import type { FindingConsequence } from './findingConsequence';
import { findingDetail, findingTitle } from './orderCheckMessages';
import type { CellProblem, CellKey, LineProblems } from './orderLineProblems';
import type { OrderLineRow } from './orderLineRows';

export interface OrderFlagCaps {
    consequences: Map<string, FindingConsequence>;
    canConfirm: boolean;
    canReject: boolean;
}

export interface OrderDocRow extends DocRow {
    row: OrderLineRow;
}

export function toDocFlag(problem: CellProblem, caps: OrderFlagCaps): DocFlag {
    const blocked = problem.findings.some(
        f => caps.consequences.get(f.id)?.consequence === 'block',
    );
    const actions: DocFlagAction[] = [];
    if (caps.canConfirm && !blocked) actions.push({ key: 'confirm', label: tr('orderLines.flag.confirm') });
    if (caps.canReject)
        actions.push({ key: 'reject', label: tr('orderLines.flag.reject'), variant: 'secondary' as const });
    return {
        tone: problem.tone,
        actions,
        notes: [
            ...problem.notes.map(text => ({ text })),
            ...problem.findings.map(f => {
                const consequence = caps.consequences.get(f.id);
                return {
                    text: findingTitle(f.messageKey),
                    detail: findingDetail(f) ?? undefined,
                    badge: consequence
                        ? { label: consequence.label, variant: consequence.variant }
                        : undefined,
                };
            }),
        ],
    };
}

export function toDocRow(
    row: OrderLineRow,
    problems: LineProblems,
    caps: OrderFlagCaps,
): OrderDocRow {
    const flags: DocRow['flags'] = {};
    for (const [key, problem] of Object.entries(problems.cells) as [CellKey, CellProblem][])
        flags[key] = toDocFlag(problem, caps);
    return { id: row.line.id, testId: `order-line-${row.line.productVariant.sku}`, flags, row };
}
