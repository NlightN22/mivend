export type BottomTabKey = 'catalog' | 'orders' | 'favorites' | 'cabinet' | 'more';

// Account-zone pages without their own tab (documents, settings, ...) belong to "More".
const MORE_PREFIXES = [
    '/account',
    '/documents',
    '/proforma-invoices',
    '/settlements',
    '/reconciliation-acts',
    '/requests',
];

function under(path: string, prefix: string): boolean {
    return path === prefix || path.startsWith(`${prefix}/`);
}

export function activeBottomTab(
    path: string,
    state: { moreOpen: boolean; catalogOpen: boolean },
): BottomTabKey | null {
    if (state.moreOpen) return 'more';
    if (state.catalogOpen) return 'catalog';
    if (under(path, '/catalog') || under(path, '/product')) return 'catalog';
    if (under(path, '/orders')) return 'orders';
    if (under(path, '/favorites')) return 'favorites';
    if (path === '/account') return 'cabinet';
    if (MORE_PREFIXES.some(prefix => under(path, prefix))) return 'more';
    return null;
}
