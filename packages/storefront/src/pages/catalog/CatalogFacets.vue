<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
    facetGroups: { code: string; name: string; values: { id: string; name: string; count: number }[] }[];
    inStockOnly: boolean;
    selectedFacetValues: Set<string>;
    priceMin: number | null;
    priceMax: number | null;
}>();

const emit = defineEmits<{
    'update:inStockOnly': [v: boolean];
    'toggleFacetValue': [id: string];
    'update:priceMin': [v: number | null];
    'update:priceMax': [v: number | null];
    reset: [];
}>();

// Local price inputs — debounced before emitting
const localMin = ref(props.priceMin != null ? String(props.priceMin) : '');
const localMax = ref(props.priceMax != null ? String(props.priceMax) : '');

watch(() => props.priceMin, v => { localMin.value = v != null ? String(v) : ''; });
watch(() => props.priceMax, v => { localMax.value = v != null ? String(v) : ''; });

let minTimer: ReturnType<typeof setTimeout>;
let maxTimer: ReturnType<typeof setTimeout>;

function onMinInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    localMin.value = raw;
    clearTimeout(minTimer);
    minTimer = setTimeout(() => {
        const n = raw === '' ? null : Number(raw);
        emit('update:priceMin', n != null && !isNaN(n) ? n : null);
    }, 600);
}

function onMaxInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    localMax.value = raw;
    clearTimeout(maxTimer);
    maxTimer = setTimeout(() => {
        const n = raw === '' ? null : Number(raw);
        emit('update:priceMax', n != null && !isNaN(n) ? n : null);
    }, 600);
}

// Facet groups to show — skip 'category' (used for navigation, not checkbox filtering)
const HIDDEN_FACETS = new Set(['category']);
</script>

<template>
    <aside class="catalog-facets">
        <!-- Availability -->
        <div class="catalog-facets__block">
            <h2 class="catalog-facets__block-title">Availability</h2>
            <label class="catalog-facets__check">
                <input
                    type="checkbox"
                    :checked="inStockOnly"
                    @change="emit('update:inStockOnly', ($event.target as HTMLInputElement).checked)"
                />
                <span>In stock only</span>
            </label>
        </div>

        <!-- Price range -->
        <div class="catalog-facets__block">
            <h2 class="catalog-facets__block-title">Price</h2>
            <div class="catalog-facets__price-row">
                <div class="catalog-facets__price-field">
                    <span class="catalog-facets__price-label">From</span>
                    <input
                        class="catalog-facets__price-input"
                        type="number"
                        min="0"
                        :value="localMin"
                        placeholder="0"
                        @input="onMinInput"
                    />
                </div>
                <div class="catalog-facets__price-field">
                    <span class="catalog-facets__price-label">To</span>
                    <input
                        class="catalog-facets__price-input"
                        type="number"
                        min="0"
                        :value="localMax"
                        placeholder="∞"
                        @input="onMaxInput"
                    />
                </div>
            </div>
        </div>

        <!-- Dynamic facet groups (brand, etc.) — category is hidden -->
        <div
            v-for="group in facetGroups.filter(g => !HIDDEN_FACETS.has(g.code))"
            :key="group.code"
            class="catalog-facets__block"
        >
            <h2 class="catalog-facets__block-title">{{ group.name }}</h2>
            <label
                v-for="val in group.values"
                :key="val.id"
                class="catalog-facets__check"
            >
                <input
                    type="checkbox"
                    :checked="selectedFacetValues.has(val.id)"
                    @change="emit('toggleFacetValue', val.id)"
                />
                <span>{{ val.name }} <span class="catalog-facets__count">({{ val.count }})</span></span>
            </label>
        </div>

        <div class="catalog-facets__block">
            <button class="catalog-facets__reset" type="button" @click="emit('reset')">
                Reset filters
            </button>
        </div>
    </aside>
</template>

<style scoped>
.catalog-facets {
    position: sticky;
    top: 88px;
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 18px;
    border: 1px solid rgba(221, 231, 226, 0.86);
    max-height: calc(100vh - 108px);
    overflow-y: auto;
}

.catalog-facets__block {
    border-top: 1px solid #edf2ef;
    padding-top: 14px;
    margin-top: 14px;
}

.catalog-facets__block:first-child {
    border-top: none;
    padding-top: 0;
    margin-top: 0;
}

.catalog-facets__block-title {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #2c3b36;
}

.catalog-facets__check {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #43524d;
    font-size: 14px;
    margin: 8px 0;
    cursor: pointer;
}

.catalog-facets__check input { accent-color: #00b894; }

.catalog-facets__price-row {
    display: flex;
    gap: 8px;
}

.catalog-facets__price-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.catalog-facets__price-label {
    font-size: 11px;
    font-weight: 700;
    color: #9aada6;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.catalog-facets__price-input {
    width: 100%;
    height: 36px;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 700;
    color: #2c3b36;
    background: #f9fbfa;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    -moz-appearance: textfield;
}

.catalog-facets__price-input::-webkit-inner-spin-button,
.catalog-facets__price-input::-webkit-outer-spin-button { -webkit-appearance: none; }

.catalog-facets__price-input:focus {
    border-color: #00b894;
    background: #fff;
}

.catalog-facets__reset {
    width: 100%;
    height: 36px;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    background: transparent;
    color: #66736e;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, color 0.15s;
}

.catalog-facets__reset:hover { border-color: #00b894; color: #00b894; }

.catalog-facets__count { color: #9aada6; font-size: 12px; }
</style>
