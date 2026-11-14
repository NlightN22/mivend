<script setup lang="ts">
import { computed } from 'vue';
import { useUiLabels } from '../../utils/uiLabels';
import { datePeriodError } from '../../utils/fieldValidation';
import MvDateField from '../MvDateField/MvDateField.vue';

const uiLabel = useUiLabels();
const from = defineModel<string>('from', { required: true });
const to = defineModel<string>('to', { required: true });
defineProps<{ fromLabel?: string; toLabel?: string }>();

const error = computed(() =>
    datePeriodError(from.value, to.value) === 'endBeforeStart'
        ? uiLabel('periodEndBeforeStart', 'The end date is before the start date')
        : '',
);
</script>

<template>
    <div class="mv-date-range">
        <label class="mv-date-range__side">
            <span>{{ fromLabel ?? uiLabel('periodFrom', 'From') }}</span>
            <MvDateField v-model="from" />
        </label>
        <label class="mv-date-range__side">
            <span>{{ toLabel ?? uiLabel('periodTo', 'To') }}</span>
            <MvDateField v-model="to" />
        </label>
        <p v-if="error" class="mv-date-range__error">{{ error }}</p>
    </div>
</template>

<style scoped>
.mv-date-range {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.mv-date-range__side {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.mv-date-range__error {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 11px;
    color: var(--el-color-danger, var(--app-danger-btn-hover));
}

@media (max-width: 400px) {
    .mv-date-range {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
