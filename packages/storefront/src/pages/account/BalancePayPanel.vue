<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvButton,
    MvFilterChips,
    MvFormField,
    MvInput,
    MvNotice,
    MvSelect,
    type FilterChip,
} from '@mivend/ui-kit';
import type { SettlementRow } from '../settlements/useSettlementDocuments';
import { formatMinor } from './balanceFormat';
import { regionalTag } from '../../i18n/locales';
import { MAX_AMOUNT_MINOR, parseAmountInput } from './amountInput';
import { contractDebt, initialAmountText, type ContractPayMode } from './contractPayment';
import type { BalanceContract } from './useBalance';
import { useContractProforma } from './useContractProforma';

const props = defineProps<{ contracts: BalanceContract[]; unpaid: SettlementRow[] }>();
const { t, locale } = useI18n();
const { issuing, failed, issued, pdfUrl, pdfPending, issue, reset } = useContractProforma();

const mode = ref<ContractPayMode>('debt-repayment');
const contractId = ref(props.contracts[0]?.id ?? '');
const amountText = ref('');

const contract = computed(() => props.contracts.find(c => c.id === contractId.value) ?? null);
const currency = computed(() => contract.value?.currency ?? 'RUB');
const debt = computed(() => contractDebt(contractId.value, props.unpaid));
const localeTag = computed(() => regionalTag(locale.value));
const parsed = computed(() => parseAmountInput(amountText.value, localeTag.value));
const amountMinor = computed(() => (parsed.value.kind === 'ok' ? parsed.value.minor : null));
const amountError = computed(() => {
    if (parsed.value.kind === 'invalid') return t('balance.pay.amountInvalid');
    if (parsed.value.kind === 'tooLarge') {
        return t('balance.pay.amountTooLarge', {
            max: formatMinor(MAX_AMOUNT_MINOR, currency.value),
        });
    }
    return undefined;
});
const modes = computed<FilterChip[]>(() => [
    { key: 'debt-repayment', label: t('balance.pay.modeDebt') },
    { key: 'advance', label: t('balance.pay.modeAdvance') },
]);
const contractOptions = computed(() =>
    props.contracts.map(c => ({ value: c.id, label: c.name ?? c.id })),
);

watch(
    [mode, contractId, localeTag],
    () => {
        amountText.value = initialAmountText(mode.value, debt.value, localeTag.value);
    },
    { immediate: true },
);
watch([mode, contractId, amountText], () => {
    if (!issued.value) reset();
});

function submit(): void {
    if (contract.value && amountMinor.value) {
        void issue(contract.value.id, mode.value, amountMinor.value);
    }
}

function another(): void {
    reset();
    amountText.value = initialAmountText(mode.value, debt.value, localeTag.value);
}
</script>

<template>
    <div class="bal-panel">
        <div class="bal-panel__title">{{ t('balance.pay.title') }}</div>
        <div v-if="!contracts.length" class="bal-panel__sub">
            {{ t('balance.pay.noContracts') }}
        </div>
        <template v-else-if="issued">
            <MvNotice variant="success">
                {{ t('balance.pay.issued', { number: issued.number }) }}
            </MvNotice>
            <div class="bal-pay__actions">
                <a v-if="pdfUrl" :href="pdfUrl" target="_blank" rel="noopener">
                    <MvButton variant="primary" size="md">{{ t('balance.pay.openPdf') }}</MvButton>
                </a>
                <div v-else class="bal-mini-note">
                    {{ pdfPending ? t('balance.pay.pdfPending') : t('balance.pay.pdfLater') }}
                </div>
                <router-link to="/proforma-invoices" class="bal-pay__link">{{
                    t('balance.pay.toList')
                }}</router-link>
                <MvButton variant="secondary" size="sm" @click="another">
                    {{ t('balance.pay.another') }}
                </MvButton>
            </div>
        </template>
        <form v-else class="bal-pay" @submit.prevent="submit">
            <div class="bal-panel__sub">{{ t('balance.pay.sub') }}</div>
            <MvFilterChips
                :chips="modes"
                :active="mode"
                @select="mode = $event as ContractPayMode"
            />
            <MvFormField :label="t('balance.pay.contract')">
                <MvSelect v-model="contractId" :options="contractOptions" />
            </MvFormField>
            <div class="bal-mini-note">
                {{ t('balance.pay.debt', { amount: formatMinor(debt.minor, currency) }) }}
                <span v-if="debt.overdueMinor > 0" class="bal-pay__overdue">
                    {{
                        t('balance.pay.overdue', {
                            amount: formatMinor(debt.overdueMinor, currency),
                        })
                    }}
                </span>
            </div>
            <MvFormField :label="t('balance.pay.amount', { currency })" :error="amountError">
                <MvInput v-model="amountText" />
            </MvFormField>
            <MvNotice v-if="failed" variant="error">{{ t('balance.pay.failed') }}</MvNotice>
            <MvButton
                variant="primary"
                size="md"
                native-type="submit"
                :disabled="!amountMinor"
                :loading="issuing"
            >
                {{ t('balance.pay.issue') }}
            </MvButton>
        </form>
    </div>
</template>

<style scoped src="./BalancePanels.css"></style>
<style scoped>
.bal-pay {
    display: grid;
    gap: 12px;
}
.bal-pay .bal-panel__sub {
    margin-bottom: 0;
}
.bal-pay__overdue {
    display: block;
    color: #b42318;
    font-weight: 800;
}
.bal-pay__link {
    color: #008a64;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
}
.bal-pay__actions {
    display: grid;
    gap: 10px;
    margin-top: 12px;
    justify-items: start;
}
</style>
