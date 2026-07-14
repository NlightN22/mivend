<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { MvSelect, MvMultiSelect, MvInput, MvButton, MvNotice } from '@mivend/ui-kit';
import {
    fetchPriceTypeCodes,
    fetchFacets,
    requestDiscountGrant,
    type DiscountRow,
    type FacetOption,
} from '../../api/discounts';
import { fetchAllCustomersCapped, type CustomerListItem } from '../../api/customers';

const props = defineProps<{ renewFrom: DiscountRow | null }>();
const emit = defineEmits<{ submitted: []; cancel: [] }>();

const priceTypes = ref<string[]>([]);
const facets = ref<FacetOption[]>([]);
const customers = ref<CustomerListItem[]>([]);
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
    isRenewal.value
        ? "Explain why this is being renewed — don't just repeat the previous justification"
        : 'Required',
);

const facetValueOptions = computed(() => {
    const facet = facets.value.find(f => f.code === form.facetCode);
    return facet ? facet.values.map(v => ({ value: v.code, label: v.name })) : [];
});

const customerOptions = computed(() =>
    customers.value.map(c => ({ value: c.id, label: c.legalName })),
);

onMounted(async () => {
    [priceTypes.value, facets.value, customers.value] = await Promise.all([
        fetchPriceTypeCodes(),
        fetchFacets(),
        fetchAllCustomersCapped(),
    ]);
    if (props.renewFrom) {
        form.priceTypeCode = props.renewFrom.priceType;
        form.percent = String(props.renewFrom.percent);
        // facetCode isn't carried on DiscountRow (only the resolved facetValueCode/name) — the
        // approver still sees which product group via facetValueCode text; re-selecting the
        // parent facet for a renewal is a minor manual step, not worth a second lookup query.
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
    if (!form.priceTypeCode || !form.percent || !form.validFrom || !form.validTo || !form.justification.trim()) {
        error.value = 'Please fill in all required fields';
        return;
    }
    if (isRenewal.value && props.renewFrom?.justification && form.justification.trim() === props.renewFrom.justification.trim()) {
        error.value = "Explain why this is being renewed — don't just repeat the previous justification";
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
        error.value = e instanceof Error ? e.message : 'Could not submit the discount grant';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="discount-grant-form">
        <div v-if="isRenewal && renewFrom" class="discount-grant-form__history">
            <h3>Renewal history</h3>
            <div class="discount-grant-form__history-row">
                <span>{{ renewFrom.percent }}%</span>
                <span>until {{ new Date(renewFrom.validTo).toLocaleDateString('en-US') }}</span>
                <span v-if="renewFrom.justification">{{ renewFrom.justification }}</span>
            </div>
        </div>

        <div class="discount-grant-form__grid">
            <label>
                Price type
                <MvSelect
                    :model-value="form.priceTypeCode"
                    :options="[{ value: '', label: 'Select a price type' }, ...priceTypes.map(p => ({ value: p, label: p }))]"
                    @update:model-value="form.priceTypeCode = $event"
                />
            </label>
            <label>
                Product group / facet
                <MvSelect
                    :model-value="form.facetCode"
                    :options="[{ value: '', label: 'All products' }, ...facets.map(f => ({ value: f.code, label: f.name }))]"
                    @update:model-value="form.facetCode = $event"
                />
            </label>
            <label v-if="facetValueOptions.length">
                Value
                <MvSelect
                    :model-value="form.facetValueCode"
                    :options="[{ value: '', label: 'Any value' }, ...facetValueOptions]"
                    @update:model-value="form.facetValueCode = $event"
                />
            </label>
            <label>
                Discount % (negative = markup)
                <MvInput size="sm" type="number" :model-value="form.percent" @update:model-value="form.percent = $event" />
            </label>
            <label>
                Valid from
                <MvInput size="sm" type="date" :model-value="form.validFrom" @update:model-value="form.validFrom = $event" />
            </label>
            <label>
                Valid to
                <MvInput size="sm" type="date" :model-value="form.validTo" @update:model-value="form.validTo = $event" />
            </label>
        </div>

        <label class="discount-grant-form__customers">
            Applies to
            <span class="discount-grant-form__hint">
                Leave empty for a company-wide discount, or select specific customers
            </span>
            <MvMultiSelect
                :model-value="form.counterpartyIds"
                :options="customerOptions"
                @update:model-value="form.counterpartyIds = $event"
            />
        </label>

        <label class="discount-grant-form__justification">
            Justification
            <textarea
                v-model="form.justification"
                rows="3"
                :placeholder="justificationPlaceholder"
            />
        </label>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <div class="discount-grant-form__actions">
            <MvButton :loading="submitting" @click="submit">Submit for approval</MvButton>
            <button type="button" class="discount-grant-form__cancel" @click="emit('cancel')">Cancel</button>
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
    background: var(--el-fill-color-light, #f8fafc);
    border-radius: var(--app-radius-md, 12px);
    padding: 10px 14px;
}

.discount-grant-form__history h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 6px;
    color: var(--el-text-color-secondary, #6b7280);
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
    color: var(--el-text-color-secondary, #6b7280);
}

.discount-grant-form__hint {
    font-size: 11px;
    text-transform: none;
    font-weight: 400;
    color: var(--el-text-color-secondary, #9ca3af);
}

.discount-grant-form__justification textarea {
    border: 1px solid var(--el-border-color, #e4e7ec);
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
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    cursor: pointer;
}
</style>
