import { expect } from '@playwright/test';
import {
    CATEGORY_PLAN,
    PLACEHOLDER_CATEGORY,
    categoryName,
    categorySlug,
} from '../fixtures/visibility/categories';
import type { Session } from './session';

export const VISIBLE = CATEGORY_PLAN.filter(c => c.visible).map(c => c.erpId);
export const HIDDEN = [...CATEGORY_PLAN.filter(c => !c.visible).map(c => c.erpId)];

// The placeholder is named after its ERP id.
export const nameOf = (erpId: string): string =>
    erpId === PLACEHOLDER_CATEGORY ? erpId : categoryName(erpId);

export const catalogUrl = (erpId: string): string => `/catalog?collection=${categorySlug(erpId)}`;

function withoutFacetValues(body: string): string {
    const drop = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(drop);
        if (node && typeof node === 'object')
            return Object.fromEntries(
                Object.entries(node)
                    .filter(([key]) => key !== 'facetValues')
                    .map(([key, value]) => [key, drop(value)]),
            );
        return node;
    };
    try {
        return JSON.stringify(drop(JSON.parse(body)));
    } catch {
        return body;
    }
}

// Whole JSON strings, so "vis-b" does not match "vis-b2". Facet values are checked by the
// known-defect specs only (category facet values still name hidden categories).
export function expectNoHiddenCategory(session: Session, onPage: string): void {
    const text = session.bodies.map(withoutFacetValues).join('\n');
    for (const erpId of [...HIDDEN, PLACEHOLDER_CATEGORY]) {
        expect(text, `${erpId} name in a response`).not.toContain(`"${nameOf(erpId)}"`);
        expect(text, `${erpId} slug in a response`).not.toContain(`"${categorySlug(erpId)}"`);
        const lines = onPage.split('\n').map(l => l.trim());
        expect(lines, `${erpId} on the page`).not.toContain(nameOf(erpId));
    }
}
