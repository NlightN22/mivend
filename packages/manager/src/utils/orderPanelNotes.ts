import { formatDateTime } from '../i18n/format';
import type { OrderLineShortfallRow } from '../api/orderLineEdit';
import { RESERVATION_FAILURE_LABEL } from '../api/orders';
import type { ProblemTone } from './orderLineProblems';

export interface ReservationFailure {
    reason: string;
    detail: string | null;
    failedAt: string | null;
}

export interface PanelNotes {
    failure: ReservationFailure | null;
    shortfalls: OrderLineShortfallRow[];
}

export interface Note {
    tone: ProblemTone;
    text: string;
}

export interface LineNotes {
    reserve: Note[];
    available: Note[];
}

const LIMITED_BY_LABEL: Record<string, string> = {
    warehouse: 'warehouse stock',
    organization: "the selling organization's stock",
};

function segments(failure: ReservationFailure): string[] {
    return (failure.detail ?? '')
        .split('; ')
        .map(s => s.trim())
        .filter(Boolean);
}

function failureNotes(failure: ReservationFailure, parts: string[]): Note[] {
    const when = failure.failedAt ? formatDateTime(failure.failedAt) : null;
    const texts = [
        `Reservation failed: ${RESERVATION_FAILURE_LABEL[failure.reason] ?? failure.reason}`,
        ...parts,
        ...(when ? [when] : []),
        'The automatic reserve did not go through. Fix the cause and confirm the order.',
    ];
    return texts.map(text => ({ tone: 'danger', text }));
}

function shortfallNote(row: OrderLineShortfallRow): string {
    const limit = row.limitedBy
        ? `, limited by ${LIMITED_BY_LABEL[row.limitedBy] ?? row.limitedBy}`
        : '';
    const when = formatDateTime(row.createdAt);
    return `Cut for lack of stock: ${row.requestedQuantity} requested, ${row.keptQuantity} kept, ${row.shortfallQuantity} cut${limit} (${when}). Kept for demand statistics only.`;
}

export function lineNotes(src: PanelNotes, sku: string): LineNotes {
    const parts = src.failure ? segments(src.failure).filter(s => s.includes(sku)) : [];
    return {
        reserve: src.failure && parts.length ? failureNotes(src.failure, parts) : [],
        available: src.shortfalls
            .filter(r => r.sku === sku)
            .map(r => ({ tone: 'warning', text: shortfallNote(r) })),
    };
}

// What no line cell can carry: failure segments naming no line, and cuts of lines no longer in the order.
export function orderNotes(src: PanelNotes, skus: string[]): Note[] {
    const notes: Note[] = [];
    if (src.failure) {
        const rest = segments(src.failure).filter(s => !skus.some(sku => s.includes(sku)));
        const matched = segments(src.failure).length > rest.length;
        if (!matched || rest.length) notes.push(...failureNotes(src.failure, rest));
    }
    for (const row of src.shortfalls) {
        if (row.sku && skus.includes(row.sku)) continue;
        notes.push({
            tone: 'warning',
            text: `${row.sku ?? 'Unknown product'}: ${shortfallNote(row)}`,
        });
    }
    return notes;
}
