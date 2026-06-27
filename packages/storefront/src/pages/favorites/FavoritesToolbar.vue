<script setup lang="ts">
const props = defineProps<{
    search: string;
    sort: string;
    activeGroup: string;
    activeChip: string;
    viewMode: 'grid' | 'list';
}>();

const emit = defineEmits<{
    'update:search': [value: string];
    'update:sort': [value: string];
    'update:activeGroup': [value: string];
    'update:activeChip': [value: string];
    'update:viewMode': [value: 'grid' | 'list'];
}>();

const groups = [
    { key: 'all', label: 'All items', count: 34 },
    { key: 'oils', label: 'Oils & fluids', count: 9 },
    { key: 'filters', label: 'Filters', count: 7 },
    { key: 'brakes', label: 'Brake system', count: 6 },
    { key: 'consumables', label: 'Service consumables', count: 8 },
    { key: 'seasonal', label: 'Seasonal', count: 4 },
];

const quickChips = [
    { key: 'all', label: 'All' },
    { key: 'available', label: 'In stock' },
    { key: 'discount', label: 'Has discount' },
    { key: 'cheaper', label: 'Price dropped' },
    { key: 'low-stock', label: 'Low stock' },
    { key: 'unavailable', label: 'Unavailable' },
    { key: 'recent', label: 'Added recently' },
];
</script>

<template>
  <div class="fav-toolbar">
    <div class="fav-toolbar__line">
      <input
        class="fav-toolbar__search"
        :value="props.search"
        placeholder="Search in favorites by SKU, brand or product"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <select
        class="fav-toolbar__select"
        :value="props.sort"
        @change="emit('update:sort', ($event.target as HTMLSelectElement).value)"
      >
        <option value="available">Available first</option>
        <option value="newest">Newest first</option>
        <option value="price">By price</option>
        <option value="brand">By brand</option>
      </select>
      <div class="fav-toolbar__view">
        <button
          class="fav-toolbar__view-btn"
          :class="{ 'fav-toolbar__view-btn--active': props.viewMode === 'grid' }"
          type="button"
          title="Grid"
          @click="emit('update:viewMode', 'grid')"
        >&#9638;</button>
        <button
          class="fav-toolbar__view-btn"
          :class="{ 'fav-toolbar__view-btn--active': props.viewMode === 'list' }"
          type="button"
          title="List"
          @click="emit('update:viewMode', 'list')"
        >&#9783;</button>
      </div>
    </div>

    <div class="fav-toolbar__chips">
      <button
        v-for="group in groups"
        :key="group.key"
        class="fav-toolbar__chip"
        :class="{ 'fav-toolbar__chip--active': props.activeGroup === group.key }"
        @click="emit('update:activeGroup', group.key)"
      >
        {{ group.label }}<span class="fav-toolbar__count">{{ group.count }}</span>
      </button>
    </div>

    <div class="fav-toolbar__chips">
      <button
        v-for="chip in quickChips"
        :key="chip.key"
        class="fav-toolbar__chip fav-toolbar__chip--sm"
        :class="{ 'fav-toolbar__chip--active': props.activeChip === chip.key }"
        @click="emit('update:activeChip', chip.key)"
      >
        {{ chip.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.fav-toolbar {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
  display: grid;
  gap: 12px;
}

.fav-toolbar__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px auto;
  gap: 10px;
  align-items: center;
}

.fav-toolbar__view {
  display: flex;
  border: 1px solid #dde7e2;
  border-radius: 14px;
  overflow: hidden;
}

.fav-toolbar__view-btn {
  border: 0;
  background: transparent;
  min-height: 46px;
  width: 46px;
  display: grid;
  place-items: center;
  font-size: 18px;
  color: #66736e;
  cursor: pointer;
  transition: 0.14s ease;
}

.fav-toolbar__view-btn--active {
  background: #e2f8ef;
  color: #008a64;
}

.fav-toolbar__search,
.fav-toolbar__select {
  min-height: 46px;
  border: 1px solid #dde7e2;
  border-radius: 16px;
  padding: 0 15px;
  outline: none;
  background: #fff;
  font: inherit;
  font-size: 14px;
}

.fav-toolbar__search:focus,
.fav-toolbar__select:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.10);
}

.fav-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fav-toolbar__chip {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #dde7e2;
  background: #fff;
  color: #344640;
  font: inherit;
  font-weight: 850;
  font-size: 13px;
  cursor: pointer;
  transition: 0.14s ease;
}

.fav-toolbar__chip--sm { min-height: 30px; font-size: 12px; }

.fav-toolbar__chip--active {
  background: #00a878;
  border-color: #00a878;
  color: #fff;
}

.fav-toolbar__count {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef4f1;
  color: #66736e;
  font-size: 11px;
  font-weight: 900;
}

.fav-toolbar__chip--active .fav-toolbar__count {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

@media (max-width: 700px) {
  .fav-toolbar__line { grid-template-columns: 1fr; }
}
</style>
