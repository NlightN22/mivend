<script setup lang="ts">
import { ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import MvButton from '../MvButton/MvButton.vue';
import type { CoordinateError } from '../../composables/location/coordinates';
import type { GeoPoint, LocationPickerLabels } from './types';

const props = defineProps<{
    point: GeoPoint | null;
    error: CoordinateError | null;
    labels: LocationPickerLabels;
}>();
const emit = defineEmits<{ apply: [latitude: string, longitude: string] }>();

const latitude = ref(props.point ? String(props.point.latitude) : '');
const longitude = ref(props.point ? String(props.point.longitude) : '');
const messages: Record<CoordinateError, keyof LocationPickerLabels> = {
    latitude: 'invalidLatitude',
    longitude: 'invalidLongitude',
    notSet: 'notSet',
};
</script>

<template>
    <form class="mv-loc-manual" @submit.prevent="emit('apply', latitude, longitude)">
        <MvInput
            v-model="latitude"
            inputmode="numeric"
            :placeholder="labels.latitude"
            :aria-label="labels.latitude"
            :error="error === 'latitude' || error === 'notSet'"
        />
        <MvInput
            v-model="longitude"
            inputmode="numeric"
            :placeholder="labels.longitude"
            :aria-label="labels.longitude"
            :error="error === 'longitude' || error === 'notSet'"
        />
        <MvButton variant="secondary" native-type="submit">{{ labels.manualHint }}</MvButton>
        <p v-if="error" class="mv-loc-manual__error" role="alert">{{ labels[messages[error]] }}</p>
    </form>
</template>

<style scoped>
.mv-loc-manual {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.mv-loc-manual :deep(button) {
    grid-column: 1 / -1;
}

.mv-loc-manual__error {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 13px;
    color: var(--app-danger-fg);
}
</style>
