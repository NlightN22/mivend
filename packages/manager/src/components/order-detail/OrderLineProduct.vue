<script setup lang="ts">
defineProps<{ name: string; sku: string; image: string | null }>();
</script>

<template>
    <div class="line-product">
        <img v-if="image" :src="image" alt="" class="line-product__image" loading="lazy" />
        <span v-else class="line-product__image line-product__image--empty" aria-hidden="true" />
        <div class="line-product__text">
            <strong class="line-product__name">{{ name }}</strong>
            <span class="line-product__sku">{{ sku }}</span>
        </div>
    </div>
</template>

<style scoped>
.line-product {
    display: flex;
    align-items: center;
    gap: 12px;
}

.line-product__image {
    flex: none;
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-row-head);
}

.line-product__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.line-product__sku {
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>
