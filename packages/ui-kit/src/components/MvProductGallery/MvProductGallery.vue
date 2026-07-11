<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
    defineProps<{
        productName: string;
        emoji?: string;
        showFavorite?: boolean;
        // The "Documents" block links to mock certificate/quality-passport PDFs — meaningful
        // for a customer-facing product page, not for an internal staff lookup view.
        showDocuments?: boolean;
    }>(),
    { showFavorite: true, showDocuments: true },
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
          v-for="(t, i) in THUMBS"
          :key="i"
          :class="['gallery__thumb', { 'gallery__thumb--active': active === i }]"
          type="button"
          @click="active = i"
        >{{ i === 0 ? (emoji ?? '📦') : t }}</button>
      </div>

      <div class="gallery__main">
        <button
          v-if="showFavorite"
          class="gallery__fav"
          type="button"
          :aria-label="favorited ? 'Remove from favorites' : 'Add to favorites'"
          @click="favorited = !favorited"
        >{{ favorited ? '♥' : '♡' }}</button>
        <div class="gallery__img">{{ active === 0 ? (emoji ?? '📦') : THUMBS[active] }}</div>
      </div>
    </div>

    <div v-if="showDocuments" class="gallery__docs">
      <div class="gallery__docs-title">Documents</div>
      <a class="gallery__doc-link" href="#">Certificate of conformity <span>PDF</span></a>
      <a class="gallery__doc-link" href="#">Quality passport <span>PDF</span></a>
    </div>
  </div>
</template>

<style scoped>
.gallery { display: flex; flex-direction: column; gap: 14px; }

.gallery__card {
  background: #fff;
  border-radius: 20px;
  border: 1px solid rgba(221,231,226,0.86);
  box-shadow: 0 14px 36px rgba(27,45,38,0.08);
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
  width: 44px;
  height: 44px;
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

.gallery__thumb--active { border-color: #00b894; background: #e8f5f0; }
.gallery__thumb:hover:not(.gallery__thumb--active) { border-color: #aad4c8; }

.gallery__main {
  flex: 1;
  position: relative;
  min-height: 200px;
  background: linear-gradient(135deg, #f4f9f7, #e8f5ee);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery__fav {
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
.gallery__fav:hover { border-color: #e05; }

.gallery__img { font-size: 80px; line-height: 1; user-select: none; }

.gallery__docs {
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(221,231,226,0.86);
  box-shadow: 0 4px 12px rgba(27,45,38,0.05);
  padding: 16px;
}

.gallery__docs-title {
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #2c3b36;
  margin-bottom: 10px;
}

.gallery__doc-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #edf2ef;
  color: #2c3b36;
  font-size: 13px;
  text-decoration: none;
}
.gallery__doc-link:last-child { border-bottom: none; }
.gallery__doc-link:hover { color: #00b894; }
.gallery__doc-link span { font-size: 11px; font-weight: 700; color: #a8b8b2; }
</style>
