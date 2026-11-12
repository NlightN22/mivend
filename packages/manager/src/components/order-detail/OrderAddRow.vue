<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconCheck, IconSearch, IconX } from '@tabler/icons-vue';
import { MvDocumentSuffixInput, MvQtyStepper } from '@mivend/ui-kit';
import { quantityUnitHint } from '../../utils/quantityUnit';
import type { useOrderLineAdd } from '../../composables/useOrderLineAdd';

const { t } = useI18n();
const props = defineProps<{
    add: ReturnType<typeof useOrderLineAdd>;
    busy: boolean;
    currencySymbol: string;
}>();

const unitHint = computed(() =>
    quantityUnitHint(props.add.quote.value?.unitName, props.add.step.value),
);
</script>

<template>
    <div class="add-row" data-testid="order-add-row">
        <div class="add-row__main">
            <div class="add-row__search">
                <IconSearch :size="16" class="add-row__icon" />
                <input
                    class="add-row__input"
                    :value="add.query.value"
                    :disabled="busy"
                    :placeholder="t('orderLines.addRow.placeholder')"
                    :aria-label="t('orderLines.addRow.search')"
                    data-testid="add-row-search"
                    @input="add.search(($event.target as HTMLInputElement).value)"
                />
            </div>
            <MvQtyStepper
                v-model="add.quantity.value"
                size="sm"
                commit="live"
                :min="add.step.value"
                :step="add.step.value"
                :max="1000000"
                :disabled="busy"
            />
            <span v-if="unitHint" class="add-row__unit" data-testid="add-row-unit">
                {{ unitHint }}
            </span>
            <span class="add-row__dash" data-testid="add-row-available">
                {{ add.quote.value ? add.quote.value.available : '—' }}
            </span>
            <span class="add-row__dash" data-testid="add-row-reserve">
                {{ add.quote.value ? `0 / ${add.quantity.value}` : '—' }}
            </span>
            <MvDocumentSuffixInput
                :model-value="add.price.value"
                :suffix="currencySymbol"
                :placeholder="t('orderLines.addRow.price')"
                :label="t('orderLines.addRow.price')"
                :disabled="busy"
                @update:model-value="add.setPrice"
            />
            <MvDocumentSuffixInput
                :model-value="add.discount.value"
                suffix="%"
                placeholder="—"
                :label="t('orderLines.addRow.discountPercent')"
                :disabled="busy"
                @update:model-value="add.setDiscount"
            />
            <div class="add-row__actions">
                <button
                    type="button"
                    class="add-row__btn add-row__btn--ok"
                    :aria-label="t('orderLines.addRow.add')"
                    data-testid="add-row-confirm"
                    :disabled="busy || !add.quote.value"
                    @click="add.submit()"
                >
                    <IconCheck :size="16" />
                </button>
                <button
                    type="button"
                    class="add-row__btn"
                    :aria-label="t('orderLines.addRow.cancel')"
                    data-testid="add-row-cancel"
                    @click="add.cancel()"
                >
                    <IconX :size="16" />
                </button>
            </div>
        </div>
        <ul v-if="add.matches.value.length" class="add-row__matches" role="listbox">
            <li v-for="m in add.matches.value" :key="m.id">
                <button type="button" class="add-row__match" @click="add.pick(m)">
                    <strong>{{ m.sku }}</strong> {{ m.name }}
                </button>
            </li>
        </ul>
        <p
            v-if="add.error.value || add.multipleError.value"
            class="add-row__error"
            role="alert"
            data-testid="add-row-error"
        >
            {{ add.error.value || add.multipleError.value }}
        </p>
        <p v-else class="add-row__hint">{{ t('orderLines.addRow.hint') }}</p>
    </div>
</template>

<style scoped>
.add-row__main {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 12px;
}

.add-row__search {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1 1 260px;
    min-width: 220px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-surface);
}

.add-row__icon {
    flex: none;
    margin-right: 6px;
    color: var(--app-text-grey);
}

.add-row__input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    color: inherit;
    font: inherit;
}

.add-row__matches {
    margin: 6px 0 0;
    padding: 4px;
    list-style: none;
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong);
    border-radius: var(--app-radius-sm, 8px);
}

.add-row__match {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    background: none;
    text-align: left;
    font: inherit;
    cursor: pointer;
}

.add-row__match:hover {
    background: var(--app-row-hover);
}

.add-row__unit {
    color: var(--app-text-grey);
    font-size: 12px;
    white-space: nowrap;
}

.add-row__dash {
    min-width: 40px;
    text-align: center;
    color: var(--app-text-grey);
}

.add-row__actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
}

.add-row__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-surface);
    color: var(--app-text-body3);
    cursor: pointer;
}

.add-row__btn--ok {
    border-color: var(--app-primary-btn);
    background: var(--app-primary-btn);
    color: var(--app-on-accent);
}

.add-row__btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.add-row__error,
.add-row__hint {
    margin: 6px 0 0;
    font-size: 12px;
}

.add-row__error {
    color: var(--app-danger-fg);
}

.add-row__hint {
    color: var(--app-text-grey);
}
</style>
