<script setup lang="ts">
import { computed } from 'vue';
import { IconMapPin } from '@tabler/icons-vue';
import { MvButton, MvLocationPicker, type GeoPoint } from '@mivend/ui-kit';
import { PROVIDER_NAMES, useLocationPick } from '../../composables/useLocationPick';
import { reverseGeocode, searchAddress } from '../../api/geo';

const model = defineModel<GeoPoint | null>({ required: true });
const props = defineProps<{ address: string; sibling: GeoPoint | null; legacy: boolean }>();

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
        <div class="tp-loc__head">
            <span class="tp-loc__label">Location</span>
            <MvButton
                variant="secondary"
                size="sm"
                :loading="pick.loading.value"
                data-testid="tp-pick-on-map"
                @click="pick.start()"
            >
                {{ coords ? 'Change on map' : 'Pick on map' }}
            </MvButton>
        </div>
        <div
            class="tp-loc__preview"
            :class="{ 'tp-loc__preview--empty': !coords }"
            data-testid="tp-location"
        >
            <IconMapPin :size="18" stroke-width="1.8" aria-hidden="true" />
            <span v-if="coords">{{ coords }}</span>
            <span v-else-if="legacy">
                This trading point has no location yet. Pick it on the map to be able to save.
            </span>
            <span v-else>No location chosen. Pick it on the map to be able to save.</span>
        </div>
        <p v-if="pick.failed.value" class="tp-loc__error" role="alert">
            The map is unavailable right now. Try again later.
        </p>
        <MvLocationPicker
            v-if="pick.open.value && pick.config.value"
            :model-value="model"
            :geo-config="pick.config.value"
            :search="searchAddress"
            :reverse="reverseGeocode"
            :suggestion-point="pick.suggestionPoint.value"
            :sibling-point="sibling"
            :initial-query="address"
            :provider-names="PROVIDER_NAMES"
            @update:model-value="onPicked"
            @close="pick.open.value = false"
        />
    </div>
</template>

<style scoped>
.tp-loc {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tp-loc__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.tp-loc__label {
    font-size: 13px;
    font-weight: 700;
}

.tp-loc__preview {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    font-size: 13px;
}

.tp-loc__preview--empty {
    color: var(--el-text-color-secondary);
}

.tp-loc__error {
    margin: 0;
    font-size: 13px;
    color: var(--el-color-danger);
}
</style>
