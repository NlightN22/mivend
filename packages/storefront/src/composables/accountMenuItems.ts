import type { Component } from 'vue';
import {
    IconBell,
    IconBuildingStore,
    IconCoins,
    IconFileText,
    IconHeadset,
    IconHeart,
    IconHome,
    IconReceipt,
    IconSettings,
    IconClipboardList,
    IconUsers,
} from '@tabler/icons-vue';
import { withoutDemoOnly } from '../pages/account/demoOnlyLinks';

interface AccountMenuLink {
    key: string;
    to: string;
    icon?: Component;
}

export interface AccountMenuNode {
    key: string;
    to?: string;
    icon?: Component;
    children?: AccountMenuLink[];
}

const DOCUMENT_LINKS = [
    { key: 'proformaInvoices', to: '/proforma-invoices' },
    { key: 'contracts', to: '/documents' },
    { key: 'reconciliationActs', to: '/reconciliation-acts' },
];

const LINKS_BEFORE_DOCUMENTS: AccountMenuLink[] = [
    { key: 'home', to: '/account', icon: IconHome },
    { key: 'orders', to: '/orders', icon: IconClipboardList },
    { key: 'statement', to: '/settlements', icon: IconReceipt },
];

const LINKS_AFTER_DOCUMENTS: AccountMenuLink[] = [
    { key: 'favorites', to: '/favorites', icon: IconHeart },
    { key: 'requests', to: '/requests', icon: IconHeadset },
    { key: 'tradingPoints', to: '/account/trading-points', icon: IconBuildingStore },
    { key: 'balance', to: '/account/balance', icon: IconCoins },
    { key: 'employees', to: '/account/employees', icon: IconUsers },
    { key: 'settings', to: '/account/settings', icon: IconSettings },
    { key: 'notifications', to: '/account/notifications', icon: IconBell },
];

// Same entries and demo-only rules as AccountSidebar; `exclude` drops entries that already have a header/tab-bar slot.
export function buildAccountMenu(demoAllowed: boolean, exclude: string[] = []): AccountMenuNode[] {
    const children = withoutDemoOnly(DOCUMENT_LINKS, demoAllowed);
    const nodes: AccountMenuNode[] = [
        ...withoutDemoOnly(LINKS_BEFORE_DOCUMENTS, demoAllowed),
        ...(children.length ? [{ key: 'documents', icon: IconFileText, children }] : []),
        ...withoutDemoOnly(LINKS_AFTER_DOCUMENTS, demoAllowed),
    ];
    return nodes.filter(node => !exclude.includes(node.key));
}
