<script setup lang="ts">
import { MvSkeleton } from '@mivend/ui-kit';
</script>

<template>
    <div aria-busy="true">
        <MvSkeleton class="product-skeleton__crumbs" width="320px" height="14px" />
        <div class="product-skeleton">
            <div class="product-skeleton__card product-skeleton__gallery">
                <div class="product-skeleton__thumbs">
                    <MvSkeleton v-for="n in 5" :key="n" width="52px" height="52px" radius="10px" />
                </div>
                <MvSkeleton height="320px" radius="14px" />
            </div>

            <div class="product-skeleton__main">
                <div class="product-skeleton__card">
                    <MvSkeleton width="120px" height="22px" radius="999px" />
                    <MvSkeleton width="75%" height="26px" />
                    <MvSkeleton width="40%" height="14px" />
                    <MvSkeleton height="40px" />
                </div>
                <div class="product-skeleton__card">
                    <MvSkeleton width="160px" height="20px" />
                    <MvSkeleton v-for="n in 4" :key="n" height="16px" />
                </div>
            </div>

            <div class="product-skeleton__card">
                <MvSkeleton width="50%" height="32px" />
                <MvSkeleton width="70%" height="12px" />
                <MvSkeleton height="52px" radius="14px" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.product-skeleton__crumbs {
    margin: 3px 0 23px;
}

.product-skeleton {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 300px;
    gap: 20px;
    align-items: start;
}

.product-skeleton__main {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.product-skeleton__card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #fff;
    border-radius: 20px;
    border: 1px solid rgba(221, 231, 226, 0.86);
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
}

.product-skeleton__gallery {
    flex-direction: row;
    padding: 16px;
}

.product-skeleton__gallery > :last-child {
    flex: 1;
}

.product-skeleton__thumbs {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

@media (max-width: 1200px) {
    .product-skeleton {
        grid-template-columns: 240px minmax(0, 1fr) 270px;
    }
}
@media (max-width: 960px) {
    .product-skeleton {
        grid-template-columns: 1fr;
    }
}
</style>
