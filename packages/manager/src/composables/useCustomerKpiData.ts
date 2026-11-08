import { ref, watch, type Ref } from 'vue';
import { fetchCustomerIdForCounterparty, fetchOrdersForCustomer } from '../api/customers';
import type { CustomerOrderItem } from '../api/customers';
import { fetchCounterpartyOverdue, type CounterpartyOverdue } from '../api/counterpartyOverdue';
import { fetchOutstandingBalance, type OutstandingBalance } from '../api/proforma-invoices';

// Same queries as the customer card's KPI row; credit is passed in by callers that already load it.
export function useCustomerKpiData(counterpartyId: Ref<string | null>) {
    const orders = ref<CustomerOrderItem[]>([]);
    const outstanding = ref<OutstandingBalance | null>(null);
    const overdue = ref<CounterpartyOverdue | null>(null);
    const loaded = ref(false);
    let seq = 0;

    async function load(id: string | null): Promise<void> {
        const mine = (seq += 1);
        loaded.value = false;
        if (!id) return;
        try {
            const customerId = await fetchCustomerIdForCounterparty(id);
            const [orderRows, balance, overdueRow] = await Promise.all([
                customerId ? fetchOrdersForCustomer(customerId) : Promise.resolve([]),
                fetchOutstandingBalance(id),
                fetchCounterpartyOverdue(id).catch(() => null),
            ]);
            if (mine !== seq) return;
            orders.value = orderRows;
            outstanding.value = balance;
            overdue.value = overdueRow;
            loaded.value = true;
        } catch {
            if (mine === seq) loaded.value = false;
        }
    }

    watch(counterpartyId, load, { immediate: true });

    return { orders, outstanding, overdue, loaded };
}
