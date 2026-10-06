<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
    defineProps<{
        productName: string;
        emoji?: string;
        images?: { thumb: string; full: string }[];
        showFavorite?: boolean;
    }>(),
    { showFavorite: true, images: () => [] },
);

const THUMBS = ['📦', '🏷️', '🔍', '📋', '🧾'];
const active = ref(0);
const favorited = ref(false);
</script>

<template>
    <div class="gallery">
        <div class="gallery__card">
            <div class="gallery__thumbs">
                <button
                    v-for="(img, i) in images"
                    :key="`img-${i}`"
                    :class="['gallery__thumb', { 'gallery__thumb--active': active === i }]"
                    type="button"
                    @click="active = i"
                >
                    <img class="gallery__thumb-photo" :src="img.thumb" :alt="productName" />
                </button>
                <button
                    v-for="(t, i) in images.length ? [] : THUMBS"
                    :key="i"
                    :class="['gallery__thumb', { 'gallery__thumb--active': active === i }]"
                    type="button"
                    @click="active = i"
                >
                    {{ i === 0 ? (emoji ?? '📦') : t }}
                </button>
            </div>

            <div class="gallery__main">
                <button
                    v-if="showFavorite"
                    class="gallery__fav"
                    type="button"
                    :aria-label="favorited ? 'Remove from favorites' : 'Add to favorites'"
                    @click="favorited = !favorited"
                >
                    {{ favorited ? '♥' : '♡' }}
                </button>
                <img
                    v-if="images.length"
                    class="gallery__photo"
                    :src="images[active]?.full ?? images[0].full"
                    :alt="productName"
                />
                <div v-else class="gallery__img">
                    {{ active === 0 ? (emoji ?? '📦') : THUMBS[active] }}
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.gallery {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.gallery__card {
    background: #fff;
    border-radius: 20px;
    border: 1px solid rgba(221, 231, 226, 0.86);
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 16px;
    display: flex;
    gap: 12px;
}

.gallery__thumbs {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
}

.gallery__thumb {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    border: 1.5px solid #dde7e2;
    background: #f7fbfa;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s;
}

.gallery__thumb--active {
    border-color: #00b894;
    background: #e8f5f0;
}
.gallery__thumb:hover:not(.gallery__thumb--active) {
    border-color: #aad4c8;
}

.gallery__main {
    flex: 1;
    position: relative;
    height: 380px;
    overflow: hidden;
    background: linear-gradient(135deg, #f4f9f7, #e8f5ee);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.gallery__fav {
    z-index: 1;
    position: absolute;
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1.5px solid #dde7e2;
    background: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e05;
    transition: border-color 0.15s;
}
.gallery__fav:hover {
    border-color: #e05;
}

.gallery__thumb-photo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 8px;
}

.gallery__photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 12px;
    box-sizing: border-box;
}

.gallery__img {
    font-size: 120px;
    line-height: 1;
    user-select: none;
}
</style>
