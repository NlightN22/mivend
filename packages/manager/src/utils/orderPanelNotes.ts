import { formatDateTime } from '../i18n/format';
import { tr } from './lazyLabels';
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

const LIMITED_BY_KEY: Record<string, string> = {
    warehouse: 'limitWarehouse',
    organization: 'limitOrganization',
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
        tr('orderLines.notes.reservationFailed', {
            reason: RESERVATION_FAILURE_LABEL[failure.reason] ?? failure.reason,
        }),
        ...parts,
        ...(when ? [when] : []),
        tr('orderLines.notes.autoReserveFailed'),
    ];
    return texts.map(text => ({ tone: 'danger', text }));
}

function shortfallNote(row: OrderLineShortfallRow): string {
    const key = row.limitedBy ? LIMITED_BY_KEY[row.limitedBy] : undefined;
    const limit = row.limitedBy
        ? `, ${tr('orderLines.notes.limitedBy', {
              what: key ? tr(`orderLines.notes.${key}`) : row.limitedBy,
          })}`
        : '';
    return tr('orderLines.notes.cut', {
        requested: row.requestedQuantity,
        kept: row.keptQuantity,
        cut: row.shortfallQuantity,
        limit,
        when: formatDateTime(row.createdAt),
    });
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
            text: tr('orderLines.notes.unknownProductNote', {
                sku: row.sku ?? tr('orderLines.notes.unknownProduct'),
                note: shortfallNote(row),
            }),
        });
    }
    return notes;
}
