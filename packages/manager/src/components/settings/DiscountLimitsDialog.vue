<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvButton, MvInput, MvModal, MvNotice, MvSelect } from '@mivend/ui-kit';
import { useDiscountLimits } from '../../composables/useDiscountLimits';

const props = defineProps<{ administratorId: string; name: string }>();
defineEmits<{ close: [] }>();

const KINDS = [
    { value: 'all', label: 'All products' },
    { value: 'manufacturer', label: 'Manufacturer' },
    { value: 'category', label: 'Category' },
];
const kindLabel = (kind: string): string => KINDS.find(k => k.value === kind)?.label ?? kind;

const limits = useDiscountLimits(props.administratorId);
const kind = ref('all');
const scopeRef = ref('');
const percent = ref('');

const parsedPercent = computed(() => Number(percent.value));
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
        scopeRef.value = '';
        percent.value = '';
    }
}

onMounted(limits.load);
</script>

<template>
    <MvModal :title="`Discount limits: ${name}`" @close="$emit('close')">
        <p class="limits__hint">
            The deepest matching percent of the employee applies, measured from the customer's base
            price. A product with no matching row has no limit.
        </p>
        <MvNotice v-if="limits.error.value" variant="error">{{ limits.error.value }}</MvNotice>
        <table v-if="limits.rows.value.length" class="limits__table">
            <tbody>
                <tr v-for="row in limits.rows.value" :key="row.uuid">
                    <td>{{ kindLabel(row.scopeKind) }}</td>
                    <td>{{ row.scopeRef || '—' }}</td>
                    <td class="limits__num">{{ row.maxDiscountPercent }}%</td>
                    <td class="limits__actions">
                        <MvButton
                            size="sm"
                            variant="secondary"
                            :disabled="limits.busy.value"
                            @click="
                                kind = row.scopeKind;
                                scopeRef = row.scopeRef;
                                percent = String(row.maxDiscountPercent);
                            "
                        >
                            Edit
                        </MvButton>
                        <MvButton
                            size="sm"
                            variant="danger"
                            :disabled="limits.busy.value"
                            @click="limits.remove(row)"
                        >
                            Remove
                        </MvButton>
                    </td>
                </tr>
            </tbody>
        </table>
        <p v-else class="limits__hint">No limits set.</p>
        <div class="limits__form">
            <MvSelect v-model="kind" :options="KINDS" />
            <MvInput v-model="scopeRef" size="sm" placeholder="ERP id" :disabled="kind === 'all'" />
            <MvInput v-model="percent" size="sm" type="number" placeholder="Max %" />
            <MvButton :disabled="!valid || limits.busy.value" @click="add">Save</MvButton>
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
