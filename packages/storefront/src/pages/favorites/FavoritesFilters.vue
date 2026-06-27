<script setup lang="ts">
export interface FavoriteGroup {
    label: string;
    count: number;
    key: string;
}

const props = defineProps<{
    activeGroup: string;
    onlyAvailable: boolean;
    hasDiscount: boolean;
    priceChanged: boolean;
    lowStock: boolean;
    unavailable: boolean;
}>();

const emit = defineEmits<{
    'update:activeGroup': [value: string];
    'update:onlyAvailable': [value: boolean];
    'update:hasDiscount': [value: boolean];
    'update:priceChanged': [value: boolean];
    'update:lowStock': [value: boolean];
    'update:unavailable': [value: boolean];
    reset: [];
}>();

const groups: FavoriteGroup[] = [
    { key: 'all', label: 'All items', count: 34 },
    { key: 'oils', label: 'Oils & fluids', count: 9 },
    { key: 'filters', label: 'Filters', count: 7 },
    { key: 'brakes', label: 'Brake system', count: 6 },
    { key: 'consumables', label: 'Service consumables', count: 8 },
    { key: 'seasonal', label: 'Seasonal', count: 4 },
];
</script>

<template>
  <aside class="fav-filters">
    <h2 class="fav-filters__title">Favorite groups</h2>
    <nav class="fav-filters__list">
      <a
        v-for="group in groups"
        :key="group.key"
        href="#"
        class="fav-filters__link"
        :class="{ 'fav-filters__link--active': props.activeGroup === group.key }"
        @click.prevent="emit('update:activeGroup', group.key)"
      >
        <span>{{ group.label }}</span>
        <span class="fav-filters__count">{{ group.count }}</span>
      </a>
    </nav>

    <div class="fav-filters__block">
      <h3 class="fav-filters__subtitle">Filters</h3>
      <label class="fav-filters__check">
        <input type="checkbox" :checked="props.onlyAvailable" @change="emit('update:onlyAvailable', ($event.target as HTMLInputElement).checked)" />
        In stock at current point
      </label>
      <label class="fav-filters__check">
        <input type="checkbox" :checked="props.hasDiscount" @change="emit('update:hasDiscount', ($event.target as HTMLInputElement).checked)" />
        Has discount
      </label>
      <label class="fav-filters__check">
        <input type="checkbox" :checked="props.priceChanged" @change="emit('update:priceChanged', ($event.target as HTMLInputElement).checked)" />
        Price changed
      </label>
      <label class="fav-filters__check">
        <input type="checkbox" :checked="props.lowStock" @change="emit('update:lowStock', ($event.target as HTMLInputElement).checked)" />
        Low stock
      </label>
      <label class="fav-filters__check">
        <input type="checkbox" :checked="props.unavailable" @change="emit('update:unavailable', ($event.target as HTMLInputElement).checked)" />
        Unavailable items
      </label>
    </div>

    <div class="fav-filters__block">
      <button class="fav-filters__reset" @click="emit('reset')">Reset filters</button>
    </div>
  </aside>
</template>

<style scoped>
.fav-filters {
  position: sticky;
  top: 118px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
}

.fav-filters__title {
  margin: 0 0 13px;
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.035em;
}

.fav-filters__subtitle {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.035em;
}

.fav-filters__list {
  display: grid;
  gap: 4px;
  margin-bottom: 0;
}

.fav-filters__link {
  min-height: 39px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 12px;
  padding: 0 11px;
  color: #2d3d37;
  font-size: 14px;
  font-weight: 800;
  text-decoration: none;
}

.fav-filters__link--active {
  background: #e2f8ef;
  color: #008a64;
  font-weight: 950;
}

.fav-filters__link:hover:not(.fav-filters__link--active) {
  background: #f4faf7;
}

.fav-filters__count {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef4f1;
  color: #66736e;
  font-size: 12px;
  font-weight: 900;
}

.fav-filters__block {
  border-top: 1px solid #edf2ef;
  padding-top: 16px;
  margin-top: 16px;
}

.fav-filters__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #43524d;
  font-size: 14px;
  line-height: 1.35;
  margin: 10px 0;
  cursor: pointer;
}

.fav-filters__check input { accent-color: #00a878; }

.fav-filters__reset {
  width: 100%;
  border: 0;
  min-height: 40px;
  border-radius: 12px;
  padding: 0 14px;
  background: #f3f8f6;
  color: #263732;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
}

@media (max-width: 960px) {
  .fav-filters { position: static; }
}
</style>
