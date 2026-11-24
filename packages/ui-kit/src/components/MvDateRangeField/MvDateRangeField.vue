<script setup lang="ts">
import { computed } from 'vue';
import { useUiLabels } from '../../utils/uiLabels';
import { datePeriodError } from '../../utils/fieldValidation';
import MvDateField from '../MvDateField/MvDateField.vue';
import {
    DATE_RANGE_PRESETS,
    presetLabel,
    resolveDateRangePreset,
} from '../MvColumnFilter/dateRangePresets';

const uiLabel = useUiLabels();
const from = defineModel<string>('from', { required: true });
const to = defineModel<string>('to', { required: true });
const props = defineProps<{ fromLabel?: string; toLabel?: string; presets?: string[] }>();

const presetOptions = computed(() =>
    DATE_RANGE_PRESETS.filter(preset => props.presets?.includes(preset.key)),
);

function applyPreset(key: string): void {
    const range = resolveDateRangePreset(key);
    from.value = range.from;
    to.value = range.to;
}

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
        <div v-if="presetOptions.length" class="mv-date-range__presets">
            <button
                v-for="preset in presetOptions"
                :key="preset.key"
                type="button"
                class="mv-date-range__preset"
                @click="applyPreset(preset.key)"
            >
                {{ presetLabel(uiLabel, preset) }}
            </button>
        </div>
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

.mv-date-range__presets {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.mv-date-range__preset {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: var(--el-fill-color-light);
    font-size: 12px;
    color: var(--el-text-color-primary);
    cursor: pointer;
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
