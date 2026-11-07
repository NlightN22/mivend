<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import './locationPin.css';
import LocationManualInputs from './LocationManualInputs.vue';
import LocationProviderSwitch from './LocationProviderSwitch.vue';
import LocationSearchBox from './LocationSearchBox.vue';
import { createAdapter as defaultAdapterFactory } from './adapters';
import { useBodyScrollLock } from '../../composables/location/useBodyScrollLock';
import { useLocationPicker } from '../../composables/location/useLocationPicker';
import { DEFAULT_LABELS } from './types';
import type {
    AdapterFactory, GeoConfig, GeoPoint, LocationPickerLabels, ReverseFn, SearchFn,
} from './types';

const props = withDefaults(
    defineProps<{
        modelValue: GeoPoint | null;
        geoConfig: GeoConfig;
        search: SearchFn;
        reverse: ReverseFn;
        suggestionPoint?: GeoPoint | null;
        siblingPoint?: GeoPoint | null;
        initialQuery?: string;
        cooperative?: boolean;
        locale?: string;
        labels?: Partial<LocationPickerLabels>;
        providerNames?: Record<string, string>;
        createAdapter?: AdapterFactory;
    }>(),
    { createAdapter: defaultAdapterFactory, cooperative: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: GeoPoint]; close: [] }>();

const text = computed<LocationPickerLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }));
const mapEl = ref<HTMLElement | null>(null);
const picker = useLocationPicker({
    config: props.geoConfig,
    current: props.modelValue,
    suggestionPoint: props.suggestionPoint,
    siblingPoint: props.siblingPoint,
    cooperative: props.cooperative,
    locale: props.locale,
    search: props.search,
    reverse: props.reverse,
    createAdapter: props.createAdapter,
});
const { search, point } = picker;
if (props.initialQuery) search.query.value = props.initialQuery;
useBodyScrollLock(toRef(() => !props.cooperative));

const otherProviders = computed(() => props.geoConfig.providers.filter(p => p.key !== picker.provider.value));
const chosen = computed(() =>
    point.value ? `${point.value.latitude.toFixed(6)}, ${point.value.longitude.toFixed(6)}` : null,
);

function save(): void {
    if (point.value && picker.canSave.value) emit('update:modelValue', point.value);
}

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const;
function onMapKeydown(event: KeyboardEvent): void {
    const direction = ARROWS[event.key as keyof typeof ARROWS];
    if (!direction) return;
    event.preventDefault();
    picker.nudge(direction);
}
const onPop = (): void => emit('close');

onMounted(async () => {
    window.addEventListener('popstate', onPop);
    await nextTick();
    if (mapEl.value) await picker.attach(mapEl.value);
});
onBeforeUnmount(() => {
    window.removeEventListener('popstate', onPop);
    picker.destroy();
});
</script>

<template>
    <Teleport to="body" :disabled="cooperative">
        <div class="mv-loc" :class="{ 'mv-loc--inline': cooperative }" @click.self="emit('close')" @keydown.esc="emit('close')">
            <div class="mv-loc__dialog" role="dialog" aria-modal="true" :aria-label="text.title">
                <header class="mv-loc__head">
                    <span class="mv-loc__title">{{ text.title }}</span>
                    <button class="mv-loc__close" type="button" :aria-label="text.close" @click="emit('close')">✕</button>
                </header>
                <LocationSearchBox
                    :query="search.query.value"
                    :suggestions="search.suggestions.value"
                    :failed="search.failed.value"
                    :labels="text"
                    @input="search.onInput"
                    @submit="search.submit"
                    @pick="picker.pickSuggestion"
                />
                <div class="mv-loc__mapbox">
                    <div class="mv-loc__switch">
                        <LocationProviderSwitch
                            :providers="geoConfig.providers"
                            :current="picker.provider.value"
                            :label="text.provider"
                            :names="providerNames"
                            @select="picker.switchProvider"
                        />
                    </div>
                    <div
                        ref="mapEl"
                        class="mv-loc__map"
                        tabindex="0"
                        role="application"
                        :aria-label="text.mapHint"
                        @keydown="onMapKeydown"
                    />
                    <p v-if="picker.status.value === 'loading'" class="mv-loc__overlay">{{ text.loading }}</p>
                    <p v-if="cooperative" class="mv-loc__coop">{{ text.cooperativeHint }}</p>
                </div>
                <section v-if="picker.status.value === 'failed'" class="mv-loc__failed">
                    <p role="alert">{{ text.loadFailed }}</p>
                    <div class="mv-loc__row">
                        <MvButton variant="secondary" @click="picker.retry()">{{ text.retry }}</MvButton>
                        <MvButton
                            v-for="p in otherProviders"
                            :key="p.key"
                            variant="ghost"
                            @click="picker.switchProvider(p.key)"
                        >
                            {{ text.tryProvider }}: {{ providerNames?.[p.key] ?? p.key }}
                        </MvButton>
                    </div>
                    <LocationManualInputs
                        :point="point"
                        :error="picker.manualError.value"
                        :labels="text"
                        @apply="picker.setManual"
                    />
                </section>
                <footer class="mv-loc__foot">
                    <div class="mv-loc__info" aria-live="polite">
                        <strong>{{ text.chosen }}:</strong>
                        <span v-if="chosen" class="mv-loc__coords">{{ chosen }}</span>
                        <span v-else>{{ text.nothingChosen }}</span>
                        <span v-if="picker.address.value" class="mv-loc__address">{{ text.address }}: {{ picker.address.value }}</span>
                    </div>
                    <div class="mv-loc__row">
                        <MvButton variant="ghost" @click="emit('close')">{{ text.cancel }}</MvButton>
                        <MvButton :disabled="!picker.canSave.value" @click="save">{{ text.save }}</MvButton>
                    </div>
                </footer>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.mv-loc {
    position: fixed;
    inset: 0;
    z-index: var(--mv-z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--app-ink-14);
    overscroll-behavior: contain;
}

.mv-loc--inline {
    position: static;
    padding: 0;
    background: none;
}

.mv-loc__dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 960px;
    height: min(720px, 100%);
    padding: 16px 20px 20px;
    background: var(--app-surface);
    border-radius: 24px;
    box-shadow: 0 24px 64px var(--app-ink-14);
}

.mv-loc--inline .mv-loc__dialog {
    height: 420px;
    max-width: none;
    box-shadow: none;
}

.mv-loc__head,
.mv-loc__foot,
.mv-loc__row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mv-loc__head {
    justify-content: space-between;
}

.mv-loc__title {
    font-size: 18px;
    font-weight: 900;
    color: var(--app-nav-text-strong);
}

.mv-loc__close {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 10px;
    background: var(--app-fill-soft);
    color: var(--app-nav-label);
    cursor: pointer;
}

.mv-loc__mapbox {
    position: relative;
    flex: 1;
    min-height: 200px;
}

.mv-loc__map {
    width: 100%;
    height: 100%;
    border-radius: 16px;
    overflow: hidden;
    overscroll-behavior: contain;
    background: var(--app-fill-soft);
}

.mv-loc__switch {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: var(--mv-z-sticky);
}

.mv-loc__overlay,
.mv-loc__coop {
    position: absolute;
    left: 12px;
    bottom: 12px;
    margin: 0;
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--app-surface);
    font-size: 12px;
    color: var(--app-nav-label);
}

.mv-loc__failed {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--app-danger-fg);
}

.mv-loc__failed p {
    margin: 0;
}

.mv-loc__foot {
    justify-content: space-between;
    flex-wrap: wrap;
}

.mv-loc__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: 14px;
    color: var(--app-nav-text-strong);
}

.mv-loc__address {
    color: var(--app-nav-label);
}

@media (max-width: 800px) {
    .mv-loc {
        padding: 0;
    }

    .mv-loc__dialog {
        height: 100%;
        max-width: none;
        border-radius: 0;
    }
}
</style>
