<script setup lang="ts">
defineProps<{
    facetGroups: { code: string; name: string; values: { id: string; name: string; count: number }[] }[];
    inStockOnly: boolean;
    selectedFacetValues: Set<string>;
}>();

const emit = defineEmits<{
    'update:inStockOnly': [v: boolean];
    'toggleFacetValue': [id: string];
    reset: [];
}>();
</script>

<template>
    <aside class="catalog-facets">
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

        <div
            v-for="group in facetGroups"
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
