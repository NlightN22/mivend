<script setup lang="ts">
import { MvCard, MvSkeleton } from '@mivend/ui-kit';
</script>

<template>
    <div aria-busy="true">
        <MvSkeleton class="product-skeleton__crumbs" width="320px" height="14px" />
        <div class="product-skeleton">
            <MvCard class="product-skeleton__card product-skeleton__gallery" padding="16px">
                <MvSkeleton class="product-skeleton__photo" height="auto" radius="14px" />
            </MvCard>

            <div class="product-skeleton__main">
                <MvCard class="product-skeleton__card">
                    <MvSkeleton width="120px" height="22px" radius="999px" />
                    <MvSkeleton width="75%" height="26px" />
                    <MvSkeleton width="40%" height="14px" />
                    <MvSkeleton height="40px" />
                </MvCard>
                <MvCard class="product-skeleton__card">
                    <MvSkeleton width="160px" height="20px" />
                    <MvSkeleton v-for="n in 4" :key="n" height="16px" />
                </MvCard>
            </div>

            <MvCard class="product-skeleton__card">
                <MvSkeleton width="50%" height="32px" />
                <MvSkeleton width="70%" height="12px" />
                <MvSkeleton height="52px" radius="14px" />
            </MvCard>
        </div>
    </div>
</template>

<style scoped>
.product-skeleton__crumbs {
    margin: 3px 0 23px;
}

.product-skeleton {
    display: grid;
    grid-template-columns: minmax(320px, 460px) minmax(0, 1fr) 300px;
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
}

.product-skeleton__gallery {
    flex-direction: row;
}

.product-skeleton__photo {
    flex: 1;
    aspect-ratio: 1 / 1;
    height: auto;
}

@media (max-width: 1200px) {
    .product-skeleton {
        grid-template-columns: minmax(280px, 380px) minmax(0, 1fr) 270px;
    }
}
@media (max-width: 960px) {
    .product-skeleton {
        grid-template-columns: 1fr;
    }
}
</style>
