<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvSelect, MvMultiSelect, MvInput, MvButton, MvNotice } from '@mivend/ui-kit';
import {
    fetchPriceTypeCodes,
    fetchFacets,
    requestDiscountGrant,
    searchDiscountCounterparties,
    type CounterpartyOption,
    type FacetOption,
} from '../../api/discounts';
import type { DiscountRow } from './discountsRows';
import { useDebouncedSearch } from '../../composables/useDebouncedSearch';
import { formatDate } from '../../i18n/format';

const props = defineProps<{
    renewFrom: DiscountRow | null;
    customer?: CounterpartyOption | null;
}>();
const emit = defineEmits<{ submitted: []; cancel: [] }>();

const { t } = useI18n();
const priceTypes = ref<string[]>([]);
const facets = ref<FacetOption[]>([]);
const { term: customerSearch, results: customerMatches } = useDebouncedSearch(
    searchDiscountCounterparties,
    [],
);
const pickedCustomers = ref(new Map<string, CounterpartyOption>());
const submitting = ref(false);
const error = ref('');

const form = reactive({
    priceTypeCode: '',
    facetCode: '',
    facetValueCode: '',
    percent: '',
    validFrom: '',
    validTo: '',
    justification: '',
    counterpartyIds: [] as string[],
});

const isRenewal = computed(() => !!props.renewFrom);
const justificationPlaceholder = computed(() =>
    isRenewal.value ? t('discounts.form.renewJustification') : t('discounts.form.required'),
);

const facetValueOptions = computed(() => {
    const facet = facets.value.find(f => f.code === form.facetCode);
    return facet ? facet.values.map(v => ({ value: v.code, label: v.name })) : [];
});

const customerOptions = computed(() => {
    const picked = form.counterpartyIds.flatMap(id => pickedCustomers.value.get(id) ?? []);
    const pickedIds = new Set(picked.map(o => o.value));
    return [...picked, ...customerMatches.value.filter(o => !pickedIds.has(o.value))];
});

function updateCustomers(ids: string[]): void {
    for (const option of customerOptions.value) pickedCustomers.value.set(option.value, option);
    form.counterpartyIds = ids;
}

onMounted(async () => {
    [priceTypes.value, facets.value] = await Promise.all([fetchPriceTypeCodes(), fetchFacets()]);
    if (props.customer) {
        pickedCustomers.value.set(props.customer.value, props.customer);
        form.counterpartyIds = [props.customer.value];
    }
    if (props.renewFrom) {
        form.priceTypeCode = props.renewFrom.priceType;
        form.percent = String(props.renewFrom.percent);
        // facetCode isn't carried on DiscountRow, so a renewal re-selects the parent facet by hand.
    }
});

watch(
    () => form.facetCode,
    () => {
        form.facetValueCode = '';
    },
);

async function submit(): Promise<void> {
    error.value = '';
    if (
        !form.priceTypeCode ||
        !form.percent ||
        !form.validFrom ||
        !form.validTo ||
        !form.justification.trim()
    ) {
        error.value = t('discounts.form.fillRequired');
        return;
    }
    if (
        isRenewal.value &&
        props.renewFrom?.justification &&
        form.justification.trim() === props.renewFrom.justification.trim()
    ) {
        error.value = t('discounts.form.renewJustification');
        return;
    }
    submitting.value = true;
    try {
        await requestDiscountGrant({
            priceTypeCode: form.priceTypeCode,
            facetCode: form.facetCode || null,
            facetValueCode: form.facetValueCode || null,
            percent: Number(form.percent),
            validFrom: new Date(form.validFrom).toISOString(),
            validTo: new Date(form.validTo).toISOString(),
            justification: form.justification,
            supersedesDiscountRuleId: props.renewFrom?.ruleErpId ?? null,
            counterpartyIds: form.counterpartyIds.length ? form.counterpartyIds : null,
        });
        emit('submitted');
    } catch (e) {
        error.value = e instanceof Error ? e.message : t('discounts.form.submitFailed');
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="discount-grant-form">
        <div v-if="isRenewal && renewFrom" class="discount-grant-form__history">
            <h3>{{ t('discounts.form.renewalHistory') }}</h3>
            <div class="discount-grant-form__history-row">
                <span>{{ renewFrom.percent }}%</span>
                <span>{{
                    t('discounts.form.until', { date: formatDate(renewFrom.validTo) })
                }}</span>
                <span v-if="renewFrom.justification">{{ renewFrom.justification }}</span>
            </div>
        </div>

        <div class="discount-grant-form__grid">
            <label>
                {{ t('discounts.form.priceType') }}
                <MvSelect
                    :model-value="form.priceTypeCode"
                    :options="[
                        { value: '', label: t('discounts.form.selectPriceType') },
                        ...priceTypes.map(p => ({ value: p, label: p })),
                    ]"
                    @update:model-value="form.priceTypeCode = $event"
                />
            </label>
            <label>
                {{ t('discounts.form.productGroup') }}
                <MvSelect
                    :model-value="form.facetCode"
                    :options="[
                        { value: '', label: t('discounts.form.allProducts') },
                        ...facets.map(f => ({ value: f.code, label: f.name })),
                    ]"
                    @update:model-value="form.facetCode = $event"
                />
            </label>
            <label v-if="facetValueOptions.length">
                {{ t('discounts.form.value') }}
                <MvSelect
                    :model-value="form.facetValueCode"
                    :options="[
                        { value: '', label: t('discounts.form.anyValue') },
                        ...facetValueOptions,
                    ]"
                    @update:model-value="form.facetValueCode = $event"
                />
            </label>
            <label>
                {{ t('discounts.form.percent') }}
                <MvInput
                    size="sm"
                    type="number"
                    :model-value="form.percent"
                    @update:model-value="form.percent = $event"
                />
            </label>
            <label>
                {{ t('discounts.form.validFrom') }}
                <MvInput
                    size="sm"
                    type="date"
                    :model-value="form.validFrom"
                    @update:model-value="form.validFrom = $event"
                />
            </label>
            <label>
                {{ t('discounts.form.validTo') }}
                <MvInput
                    size="sm"
                    type="date"
                    :model-value="form.validTo"
                    @update:model-value="form.validTo = $event"
                />
            </label>
        </div>

        <label class="discount-grant-form__customers">
            {{ t('discounts.form.appliesTo') }}
            <span class="discount-grant-form__hint">
                {{ t('discounts.form.appliesToHint') }}
            </span>
            <MvInput
                size="sm"
                :model-value="customerSearch"
                :placeholder="t('discounts.form.customerSearch')"
                @update:model-value="customerSearch = $event"
            />
            <MvMultiSelect
                :model-value="form.counterpartyIds"
                :options="customerOptions"
                @update:model-value="updateCustomers"
            />
        </label>

        <label class="discount-grant-form__justification">
            {{ t('discounts.form.justification') }}
            <textarea
                v-model="form.justification"
                rows="3"
                :placeholder="justificationPlaceholder"
            />
        </label>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <div class="discount-grant-form__actions">
            <MvButton :loading="submitting" @click="submit">{{
                t('discounts.form.submit')
            }}</MvButton>
            <button type="button" class="discount-grant-form__cancel" @click="emit('cancel')">
                {{ t('discounts.form.cancel') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.discount-grant-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.discount-grant-form__history {
    background: var(--el-fill-color-light);
    border-radius: var(--app-radius-md, 12px);
    padding: 10px 14px;
}

.discount-grant-form__history h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 6px;
    color: var(--el-text-color-secondary);
}

.discount-grant-form__history-row {
    display: flex;
    gap: 14px;
    font-size: 13px;
}

.discount-grant-form__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
}

.discount-grant-form__grid label,
.discount-grant-form__customers,
.discount-grant-form__justification {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary);
}

.discount-grant-form__hint {
    font-size: 11px;
    text-transform: none;
    font-weight: 400;
    color: var(--el-text-color-secondary);
}

.discount-grant-form__justification textarea {
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
    resize: vertical;
}

.discount-grant-form__actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.discount-grant-form__cancel {
    background: none;
    border: none;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    cursor: pointer;
}
</style>
