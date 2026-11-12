import type { RouteLocationRaw } from 'vue-router';
import type { SearchHit } from '../api/globalSearch';
import { i18n } from '../i18n';

export function humanize(value: string): string {
    const text = value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function searchKindLabel(kind: string): string {
    const key = `shell.search.kind.${kind}`;
    return i18n.global.te(key) ? i18n.global.t(key) : humanize(kind);
}

// Orders open by code (their route key). Settlement documents and discounts have no card of their own
// (a discount's card is its approval request), so they open their list filtered by the number.
export function searchTarget(kind: string, hit: SearchHit): RouteLocationRaw | null {
    switch (kind) {
        case 'counterparty':
            return `/customers/${hit.id}`;
        case 'order':
            return `/orders/${encodeURIComponent(hit.number)}`;
        case 'proformaInvoice':
            return `/proforma-invoices/${hit.id}`;
        case 'settlementDocument':
            return { path: '/settlements', query: { search: hit.number } };
        case 'discount':
            return { path: '/discounts', query: { search: hit.number } };
        default:
            return null;
    }
}

export function searchHitKey(kind: string, hit: SearchHit): string {
    return `${kind}:${hit.id}`;
}
