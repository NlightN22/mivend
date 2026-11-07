<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvLocationPicker, type GeoPoint } from '@mivend/ui-kit';
import { IconMapPin } from '@tabler/icons-vue';
import { useLocationPick } from './useLocationPick';
import { locationLabels, providerNames } from './locationLabels';

const model = defineModel<GeoPoint | null>({ required: true });
const props = defineProps<{ address: string; sibling: GeoPoint | null; error?: string }>();

const { t, locale } = useI18n();
const pick = useLocationPick(
    () => props.address,
    () => model.value,
    () => props.sibling,
);
const coords = computed(() =>
    model.value ? `${model.value.latitude.toFixed(6)}, ${model.value.longitude.toFixed(6)}` : null,
);

function onPicked(point: GeoPoint): void {
    model.value = point;
    pick.open.value = false;
}
</script>

<template>
    <div class="tp-loc">
        <div
            class="tp-loc__preview"
            :class="{ 'tp-loc__preview--empty': !coords }"
            data-testid="tp-location"
        >
            <IconMapPin :size="22" stroke-width="1.8" aria-hidden="true" />
            <div class="tp-loc__text">
                <span v-if="coords" class="tp-loc__coords">{{ coords }}</span>
                <span v-else>{{ t('tradingPoints.location.empty') }}</span>
            </div>
        </div>
        <MvButton variant="secondary" :disabled="pick.loading.value" @click="pick.start()">
            {{ coords ? t('tradingPoints.location.change') : t('tradingPoints.location.pick') }}
        </MvButton>
        <p v-if="pick.failed.value" class="tp-loc__error" role="alert">
            {{ t('tradingPoints.location.unavailable') }}
        </p>
        <p v-else-if="error" class="tp-loc__error">{{ error }}</p>
        <MvLocationPicker
            v-if="pick.open.value && pick.config.value"
            :model-value="model"
            :geo-config="pick.config.value"
            :search="pick.search"
            :reverse="pick.reverse"
            :suggestion-point="pick.suggestionPoint.value"
            :sibling-point="sibling"
            :initial-query="address"
            :labels="locationLabels(t)"
            :locale="locale"
            :provider-names="providerNames(t, pick.config.value.providers)"
            @update:model-value="onPicked"
            @close="pick.open.value = false"
        />
    </div>
</template>

<style scoped>
.tp-loc {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
}

.tp-loc__preview {
    display: flex;
    flex: 1 1 220px;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 8px 12px;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 12px;
    background: var(--app-fill-soft);
    color: var(--app-text-deep);
}

.tp-loc__preview--empty {
    color: var(--app-nav-label);
}

.tp-loc__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 13px;
}

.tp-loc__coords {
    font-variant-numeric: tabular-nums;
}

.tp-loc__error {
    flex-basis: 100%;
    margin: 0;
    font-size: 12px;
    color: var(--el-color-danger);
}
</style>
