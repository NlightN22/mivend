<script setup lang="ts">
import { ref, watch } from 'vue';
import { MvInput } from '@mivend/ui-kit';
import { searchProducts, type ProductSearchResult } from '../../api/orderCreate';

const emit = defineEmits<{ add: [product: ProductSearchResult] }>();

const term = ref('');
const results = ref<ProductSearchResult[]>([]);
const showResults = ref(false);
let searchToken = 0;

watch(term, async value => {
    showResults.value = value.trim().length > 0;
    if (!value.trim()) {
        results.value = [];
        return;
    }
    const token = ++searchToken;
    const found = await searchProducts(value);
    if (token === searchToken) results.value = found;
});

function addProduct(product: ProductSearchResult): void {
    emit('add', product);
    term.value = '';
    results.value = [];
    showResults.value = false;
}
</script>

<template>
    <div class="item-search">
        <MvInput
            size="sm"
            :model-value="term"
            placeholder="Search by product name, SKU, OEM code or VIN..."
            @update:model-value="term = $event"
        />
        <ul v-if="showResults" class="item-search__results">
            <li v-if="!results.length" class="item-search__empty">No products found</li>
            <li
                v-for="product in results"
                :key="product.productVariantId"
                class="item-search__result"
                @click="addProduct(product)"
            >
                <span>{{ product.productName }}</span>
                <span class="item-search__sku">{{ product.sku }}</span>
                <button type="button" class="item-search__add">Add</button>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.item-search {
    position: relative;
    max-width: 480px;
    margin-bottom: 14px;
}

.item-search__results {
    position: absolute;
    z-index: 10;
    top: 44px;
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    box-shadow: var(--app-shadow-md, 0 10px 28px rgba(16, 24, 40, 0.08));
    max-height: 280px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 4px;
}

.item-search__result {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
}

.item-search__result:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.item-search__sku {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}

.item-search__add {
    margin-left: auto;
    background: var(--el-color-primary, #00b894);
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.item-search__empty {
    padding: 10px;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
