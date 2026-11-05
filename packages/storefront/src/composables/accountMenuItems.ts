import { withoutDemoOnly } from '../pages/account/demoOnlyLinks';

interface AccountMenuLink {
    key: string;
    to: string;
}

export interface AccountMenuNode {
    key: string;
    to?: string;
    children?: AccountMenuLink[];
}

const DOCUMENT_LINKS = [
    { key: 'proformaInvoices', to: '/proforma-invoices' },
    { key: 'contracts', to: '/documents' },
    { key: 'reconciliationActs', to: '/reconciliation-acts' },
];

const LINKS_BEFORE_DOCUMENTS: AccountMenuLink[] = [
    { key: 'home', to: '/account' },
    { key: 'orders', to: '/orders' },
    { key: 'statement', to: '/settlements' },
];

const LINKS_AFTER_DOCUMENTS: AccountMenuLink[] = [
    { key: 'favorites', to: '/favorites' },
    { key: 'requests', to: '/requests' },
    { key: 'tradingPoints', to: '/account/trading-points' },
    { key: 'balance', to: '/account/balance' },
    { key: 'employees', to: '/account/employees' },
    { key: 'settings', to: '/account/settings' },
    { key: 'notifications', to: '/account/notifications' },
];

// Same entries and demo-only rules as AccountSidebar; `exclude` drops entries that already have a header/tab-bar slot.
export function buildAccountMenu(demoAllowed: boolean, exclude: string[] = []): AccountMenuNode[] {
    const children = withoutDemoOnly(DOCUMENT_LINKS, demoAllowed);
    const nodes: AccountMenuNode[] = [
        ...withoutDemoOnly(LINKS_BEFORE_DOCUMENTS, demoAllowed),
        ...(children.length ? [{ key: 'documents', children }] : []),
        ...withoutDemoOnly(LINKS_AFTER_DOCUMENTS, demoAllowed),
    ];
    return nodes.filter(node => !exclude.includes(node.key));
}
