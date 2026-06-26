<script setup lang="ts">
defineProps<{
  categories: { label: string; count: number }[];
  allBrands: string[];
  inStockOnly: boolean;
  selectedBrands: Set<string>;
}>();

const emit = defineEmits<{
  'update:inStockOnly': [v: boolean];
  'toggle-brand': [brand: string];
  reset: [];
}>();
</script>

<template>
  <aside class="catalog-sidebar">
    <h2 class="catalog-sidebar__title">Категории</h2>
    <nav class="catalog-sidebar__cats">
      <a v-for="cat in categories" :key="cat.label" href="#" class="catalog-sidebar__cat">
        <span>{{ cat.label }}</span>
        <span class="catalog-sidebar__count">{{ cat.count }}</span>
      </a>
    </nav>

    <div class="catalog-sidebar__block">
      <h2 class="catalog-sidebar__block-title">Фильтры</h2>
      <label class="catalog-sidebar__check">
        <input
          type="checkbox"
          :checked="inStockOnly"
          @change="emit('update:inStockOnly', ($event.target as HTMLInputElement).checked)"
        />
        <span>В наличии</span>
      </label>
    </div>

    <div v-if="allBrands.length > 0" class="catalog-sidebar__block">
      <h2 class="catalog-sidebar__block-title">Бренды</h2>
      <label v-for="brand in allBrands" :key="brand" class="catalog-sidebar__check">
        <input
          type="checkbox"
          :checked="selectedBrands.has(brand)"
          @change="emit('toggle-brand', brand)"
        />
        <span>{{ brand }}</span>
      </label>
    </div>

    <div class="catalog-sidebar__block">
      <button class="catalog-sidebar__reset" type="button" @click="emit('reset')">
        Сбросить фильтры
      </button>
    </div>
  </aside>
</template>

<style scoped>
.catalog-sidebar {
  position: sticky;
  top: 88px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
  border: 1px solid rgba(221, 231, 226, 0.86);
}

.catalog-sidebar__title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.catalog-sidebar__cats {
  display: grid;
  gap: 4px;
  margin-bottom: 4px;
}

.catalog-sidebar__cat {
  min-height: 38px;
  border-radius: 10px;
  padding: 0 10px;
  background: #f7fbfa;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #2c3b36;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
}

.catalog-sidebar__cat:hover {
  background: #e2f8ef;
  color: #008a64;
  border-color: rgba(0, 168, 120, 0.24);
}

.catalog-sidebar__count { font-size: 12px; color: #a8b8b2; font-weight: 700; }

.catalog-sidebar__block {
  border-top: 1px solid #edf2ef;
  padding-top: 14px;
  margin-top: 14px;
}

.catalog-sidebar__block-title {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #2c3b36;
}

.catalog-sidebar__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #43524d;
  font-size: 14px;
  margin: 8px 0;
  cursor: pointer;
}

.catalog-sidebar__check input { accent-color: #00b894; }

.catalog-sidebar__reset {
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

.catalog-sidebar__reset:hover { border-color: #00b894; color: #00b894; }
</style>
