<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvInput, MvModal, MvNotice, MvSelect } from '@mivend/ui-kit';
import { useDiscountLimits } from '../../composables/useDiscountLimits';

const props = defineProps<{ administratorId: string; name: string }>();
defineEmits<{ close: [] }>();

const { t, te } = useI18n();
const KINDS = computed(() =>
    ['all', 'manufacturer', 'category'].map(value => ({
        value,
        label: t(`settingsSystem.discountLimits.kinds.${value}`),
    })),
);
const kindLabel = (kind: string): string =>
    te(`settingsSystem.discountLimits.kinds.${kind}`)
        ? t(`settingsSystem.discountLimits.kinds.${kind}`)
        : kind;

const limits = useDiscountLimits(props.administratorId);
const kind = ref('all');
const scopeRef = ref('');
const search = ref('');
const percent = ref('');

const parsedPercent = computed(() => Number(percent.value));
const rowName = (row: { scopeKind: string; scopeRef: string }): string =>
    row.scopeRef
        ? (limits.names.value.get(`${row.scopeKind}:${row.scopeRef}`) ?? row.scopeRef)
        : '—';

watch(search, text => {
    const picked = limits.suggestions.value.find(o => o.name === text);
    if (picked) scopeRef.value = picked.ref;
    else {
        if (text !== rowName({ scopeKind: kind.value, scopeRef: scopeRef.value }))
            scopeRef.value = '';
        void limits.suggest(kind.value, text);
    }
});

function onKind(next: string): void {
    kind.value = next;
    search.value = '';
    scopeRef.value = '';
}

const valid = computed(
    () =>
        percent.value !== '' &&
        parsedPercent.value >= 0 &&
        parsedPercent.value <= 100 &&
        (kind.value === 'all') === (scopeRef.value.trim() === ''),
);

async function add(): Promise<void> {
    await limits.save(kind.value, scopeRef.value.trim(), parsedPercent.value);
    if (!limits.error.value) {
        search.value = '';
        percent.value = '';
    }
}

onMounted(limits.load);
</script>

<template>
    <MvModal :title="t('settingsSystem.discountLimits.title', { name })" @close="$emit('close')">
        <p class="limits__hint">
            {{ t('settingsSystem.discountLimits.hint') }}
        </p>
        <MvNotice v-if="limits.error.value" variant="error">{{ limits.error.value }}</MvNotice>
        <table v-if="limits.rows.value.length" class="limits__table">
            <tbody>
                <tr v-for="row in limits.rows.value" :key="row.uuid">
                    <td>{{ kindLabel(row.scopeKind) }}</td>
                    <td>{{ rowName(row) }}</td>
                    <td class="limits__num">{{ row.maxDiscountPercent }}%</td>
                    <td class="limits__actions">
                        <MvButton
                            size="sm"
                            variant="secondary"
                            :disabled="limits.busy.value"
                            @click="
                                kind = row.scopeKind;
                                scopeRef = row.scopeRef;
                                search = row.scopeRef ? rowName(row) : '';
                                percent = String(row.maxDiscountPercent);
                            "
                        >
                            {{ t('settingsSystem.discountLimits.edit') }}
                        </MvButton>
                        <MvButton
                            size="sm"
                            variant="danger"
                            :disabled="limits.busy.value"
                            @click="limits.remove(row)"
                        >
                            {{ t('settingsSystem.discountLimits.remove') }}
                        </MvButton>
                    </td>
                </tr>
            </tbody>
        </table>
        <p v-else class="limits__hint">{{ t('settingsSystem.discountLimits.empty') }}</p>
        <div class="limits__form">
            <MvSelect :model-value="kind" :options="KINDS" @update:model-value="onKind" />
            <MvInput
                v-model="search"
                size="sm"
                list="discount-limit-scope-options"
                :placeholder="
                    kind === 'all'
                        ? t('settingsSystem.discountLimits.everyProduct')
                        : t('settingsSystem.discountLimits.typeToSearch')
                "
                :disabled="kind === 'all'"
            />
            <datalist id="discount-limit-scope-options">
                <option v-for="o in limits.suggestions.value" :key="o.ref" :value="o.name" />
            </datalist>
            <MvInput
                v-model="percent"
                size="sm"
                type="number"
                :placeholder="t('settingsSystem.discountLimits.maxPercent')"
            />
            <MvButton :disabled="!valid || limits.busy.value" @click="add">{{
                t('settingsSystem.discountLimits.save')
            }}</MvButton>
        </div>
    </MvModal>
</template>

<style scoped>
.limits__hint {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--app-text-grey);
}

.limits__table {
    width: 100%;
    margin-bottom: 14px;
    border-collapse: collapse;
    font-size: 13px;
}

.limits__table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--el-border-color);
}

.limits__num {
    text-align: right;
}

.limits__actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
}

.limits__form {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}
</style>
