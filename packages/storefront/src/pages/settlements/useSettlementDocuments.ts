import { ref, type Ref } from 'vue';
import { i18n } from '../../i18n';
import { shopApi } from '../../api/client';
import {
    SettlementBalancesDocument,
    SettlementDocumentsDocument,
    type SettlementBalancesQuery,
    type SettlementDocumentsQuery,
} from '../../api/generated/graphql';

export type SettlementRow = SettlementDocumentsQuery['settlementDocuments']['items'][number];
export type SettlementBalance = SettlementBalancesQuery['settlementBalances'][number];

export interface SettlementOptions {
    take: number;
    skip: number;
    category?: string;
    overdueOnly?: boolean;
    contractId?: string;
    organizationId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
}

export interface CurrencyTotals {
    currency: string;
    openingBalance: number;
    currentBalance: number;
    overdue: number;
}

export function paymentStatusLabel(status: string): string {
    const key = `settlements.paymentStatus.${status}`;
    return i18n.global.te(key) ? i18n.global.t(key) : status;
}

export function categoryLabel(category: string): string | undefined {
    const key = `settlements.category.${category}`;
    return i18n.global.te(key) ? i18n.global.t(key) : undefined;
}

export const PAYMENT_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> =
    { paid: 'success', partial: 'warning', overdue: 'danger', open: 'neutral' };

export function toMajor(minor: number): number {
    return minor / 100;
}

export function totalsByCurrency(balances: readonly SettlementBalance[]): CurrencyTotals[] {
    const byCurrency = new Map<string, CurrencyTotals>();
    for (const b of balances) {
        const t = byCurrency.get(b.currency) ?? {
            currency: b.currency,
            openingBalance: 0,
            currentBalance: 0,
            overdue: 0,
        };
        t.openingBalance += Number(b.openingBalance);
        t.currentBalance += Number(b.currentBalance);
        t.overdue += Number(b.overdue);
        byCurrency.set(b.currency, t);
    }
    return [...byCurrency.values()];
}

export function useSettlementDocuments(): {
    rows: Ref<SettlementRow[]>;
    totalItems: Ref<number>;
    balances: Ref<SettlementBalance[]>;
    loading: Ref<boolean>;
    load: (options: SettlementOptions) => Promise<void>;
    loadBalances: () => Promise<void>;
} {
    const rows = ref<SettlementRow[]>([]);
    const totalItems = ref(0);
    const balances = ref<SettlementBalance[]>([]);
    const loading = ref(false);

    async function load(options: SettlementOptions): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(SettlementDocumentsDocument, {
                skip: options.skip,
                take: options.take,
                filter: {
                    category: options.category,
                    overdueOnly: options.overdueOnly,
                    contractId: options.contractId,
                    organizationId: options.organizationId,
                    dateFrom: options.dateFrom,
                    dateTo: options.dateTo,
                    search: options.search,
                },
            });
            rows.value = result.settlementDocuments.items;
            totalItems.value = result.settlementDocuments.totalItems;
        } catch (e) {
            console.error('[useSettlementDocuments]', e);
        } finally {
            loading.value = false;
        }
    }

    async function loadBalances(): Promise<void> {
        try {
            const result = await shopApi(SettlementBalancesDocument, {});
            balances.value = result.settlementBalances;
        } catch (e) {
            console.error('[useSettlementDocuments]', e);
        }
    }

    return { rows, totalItems, balances, loading, load, loadBalances };
}
