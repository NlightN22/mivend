import { INFORMATIONAL_KINDS } from './line-change.types';
import type {
    LineChangeAudience,
    LineChangeEvent,
    LineChangeKind,
    LineChangeSource,
    OrderChanges,
    OrderLineChange,
} from './line-change.types';

export interface OrderLineRef {
    id: number;
    productErpId: string | null;
    quantity: number;
}

const SUBTITLES: Record<LineChangeKind, (quantity: number) => string> = {
    picking: () => 'sentToPicking',
    picked: () => 'picked',
    realization: () => 'shipped',
    'realization-correction': q => (q < 0 ? 'decreased' : 'increased'),
    return: () => 'fromCustomer',
};

const byDate = (a: LineChangeSource, b: LineChangeSource): number =>
    (a.documentDate?.getTime() ?? Infinity) - (b.documentDate?.getTime() ?? Infinity) ||
    a.documentNumber.localeCompare(b.documentNumber);

// Events of a product go to the first order line with that product; the rest of its lines show no change.
export function buildOrderChanges(
    lines: OrderLineRef[],
    sources: LineChangeSource[],
    audience: LineChangeAudience,
): OrderChanges {
    const shown = sources.filter(s => audience === 'staff' || s.reflectedInAccounting);
    const lineByProduct = new Map<string, OrderLineRef>();
    for (const line of lines) {
        if (line.productErpId && !lineByProduct.has(line.productErpId)) {
            lineByProduct.set(line.productErpId, line);
        }
    }
    const result: OrderLineChange[] = [];
    for (const [productErpId, line] of lineByProduct) {
        const own = shown.filter(s => s.productErpId === productErpId).sort(byDate);
        if (own.length === 0) continue;
        let remainder = line.quantity;
        const events: LineChangeEvent[] = own.map(s => {
            if (!INFORMATIONAL_KINDS.includes(s.kind)) remainder += s.quantity;
            return {
                kind: s.kind,
                titleKey: s.kind,
                subtitleKey: SUBTITLES[s.kind](s.quantity),
                quantity: s.quantity,
                remainder,
                documentNumber: s.documentNumber,
                documentDate: s.documentDate,
            };
        });
        result.push({ orderLineId: line.id, ordered: line.quantity, actual: remainder, events });
    }
    const amountDeltaMinor =
        audience === 'staff' ? shown.reduce((sum, s) => sum + s.amountMinor, 0) : 0;
    return { lines: result, amountDeltaMinor };
}
