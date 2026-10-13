<script setup lang="ts">
import { computed, onMounted, toRef, watch } from 'vue';
import { MvPagination, useUrlState } from '@mivend/ui-kit';
import type { DateRangeFilterValue, SelectOption } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import SettlementBalanceCards from './SettlementBalanceCards.vue';
import SettlementFilters from './SettlementFilters.vue';
import SettlementTable from './SettlementTable.vue';
import { totalsByCurrency, useSettlementDocuments } from './useSettlementDocuments';

const PAGE_SIZE = 20;

const { rows, totalItems, balances, loading, load, loadBalances } = useSettlementDocuments();

const { filters: urlState, page } = useUrlState(
    { chip: 'all', contract: '', org: '', preset: '', from: '', to: '', q: '' },
    { typingKeys: ['q'] },
);
const chip = toRef(urlState, 'chip');
const contract = toRef(urlState, 'contract');
const organization = toRef(urlState, 'org');
const preset = toRef(urlState, 'preset');
const from = toRef(urlState, 'from');
const to = toRef(urlState, 'to');
const range = computed<DateRangeFilterValue>({
    get: () => ({ preset: preset.value || 'all', from: from.value, to: to.value }),
    set: v => {
        preset.value = v.preset === 'all' ? '' : v.preset;
        from.value = v.from;
        to.value = v.to;
    },
});
const search = toRef(urlState, 'q');

const optionsOf = (
    pick: (
        b: (typeof balances.value)[number],
    ) => [string | null | undefined, string | null | undefined],
    allLabel: string,
): SelectOption[] => {
    const seen = new Map<string, string>();
    for (const b of balances.value) {
        const [value, label] = pick(b);
        if (value) seen.set(value, label ?? value);
    }
    return [
        { value: '', label: allLabel },
        ...[...seen].map(([value, label]) => ({ value, label })),
    ];
};
const contractOptions = computed(() =>
    optionsOf(b => [b.contractId, b.contractName], 'All contracts'),
);
const organizationOptions = computed(() =>
    optionsOf(b => [b.organizationId, b.organizationName], 'All organizations'),
);

const totals = computed(() =>
    totalsByCurrency(
        balances.value.filter(
            b =>
                (!contract.value || b.contractId === contract.value) &&
                (!organization.value || b.organizationId === organization.value),
        ),
    ),
);

const CATEGORY_CHIPS = ['sale', 'payment', 'return', 'correction'];

function reload(): void {
    void load({
        take: PAGE_SIZE,
        skip: (page.value - 1) * PAGE_SIZE,
        category: CATEGORY_CHIPS.includes(chip.value) ? chip.value : undefined,
        overdueOnly: chip.value === 'overdue' ? true : undefined,
        contractId: contract.value || undefined,
        organizationId: organization.value || undefined,
        dateFrom: from.value || undefined,
        dateTo: to.value || undefined,
        search: search.value.trim() || undefined,
    });
}

watch([chip, contract, organization, from, to, search, page], reload);

onMounted(() => {
    void loadBalances();
    reload();
});
</script>

<template>
    <div class="settlement-page">
        <AccountSidebar />

        <section class="settlement-page__content">
            <div>
                <h1 class="settlement-page__title">Settlements</h1>
                <p class="settlement-page__subtitle">
                    Sales, payments, returns and corrections that make up your balance.
                </p>
            </div>

            <SettlementBalanceCards :totals="totals" />

            <SettlementFilters
                v-model:chip="chip"
                v-model:contract="contract"
                v-model:organization="organization"
                v-model:range="range"
                v-model:search="search"
                :contract-options="contractOptions"
                :organization-options="organizationOptions"
            />

            <div v-if="loading" class="settlement-page__state">Loading documents...</div>
            <div v-else-if="rows.length === 0" class="settlement-page__state">
                No documents found.
            </div>
            <template v-else>
                <SettlementTable :rows="rows" />
                <MvPagination
                    :page="page"
                    :page-size="PAGE_SIZE"
                    :total="totalItems"
                    @update:page="page = $event"
                />
            </template>
        </section>
    </div>
</template>

<style scoped>
.settlement-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.settlement-page__content {
    min-width: 0;
    display: grid;
    gap: 16px;
}

.settlement-page__title {
    margin: 0 0 6px;
    font-size: clamp(32px, 3vw, 44px);
    line-height: 1;
    letter-spacing: -0.055em;
}

.settlement-page__subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
}

.settlement-page__state {
    color: #66736e;
    font-size: 14px;
    padding: 32px 0;
    text-align: center;
}

@media (max-width: 960px) {
    .settlement-page {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 760px) {
    .settlement-page {
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
