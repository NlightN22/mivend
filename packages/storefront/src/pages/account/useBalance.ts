import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import {
    MyContractsDocument,
    SettlementBalancesDocument,
    SettlementDocumentsDocument,
    type MyContractsQuery,
} from '../../api/generated/graphql';
import type { SettlementBalance, SettlementRow } from '../settlements/useSettlementDocuments';

export type BalanceContract = MyContractsQuery['myContracts'][number];

const UNPAID_TAKE = 100;

export function useBalance(): {
    contracts: Ref<BalanceContract[]>;
    balances: Ref<SettlementBalance[]>;
    unpaid: Ref<SettlementRow[]>;
    unpaidTotal: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    load: () => Promise<void>;
} {
    const contracts = ref<BalanceContract[]>([]);
    const balances = ref<SettlementBalance[]>([]);
    const unpaid = ref<SettlementRow[]>([]);
    const unpaidTotal = ref(0);
    const loading = ref(true);
    const failed = ref(false);

    async function load(): Promise<void> {
        loading.value = true;
        failed.value = false;
        try {
            const [c, b, d] = await Promise.all([
                shopApi(MyContractsDocument, {}),
                shopApi(SettlementBalancesDocument, {}),
                shopApi(SettlementDocumentsDocument, {
                    skip: 0,
                    take: UNPAID_TAKE,
                    filter: { unpaidOnly: true },
                }),
            ]);
            contracts.value = c.myContracts;
            balances.value = b.settlementBalances;
            unpaid.value = d.settlementDocuments.items;
            unpaidTotal.value = d.settlementDocuments.totalItems;
        } catch (e) {
            console.error('[useBalance]', e);
            failed.value = true;
        } finally {
            loading.value = false;
        }
    }

    return { contracts, balances, unpaid, unpaidTotal, loading, failed, load };
}
