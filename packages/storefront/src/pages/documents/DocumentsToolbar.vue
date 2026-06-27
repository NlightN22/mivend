<script setup lang="ts">
defineProps<{ activeFilter: string; activeChip: string; search: string }>();
defineEmits<{
    (e: 'update:activeFilter', val: string): void;
    (e: 'update:activeChip', val: string): void;
    (e: 'update:search', val: string): void;
}>();

const typeFilters = [
    { key: 'all', label: 'All documents', count: 48 },
    { key: 'reconciliation', label: 'Reconciliation', count: 3 },
    { key: 'invoices', label: 'Invoices', count: 9 },
    { key: 'upd', label: 'UPD', count: 16 },
    { key: 'waybills', label: 'Waybills', count: 12 },
    { key: 'returns', label: 'Returns', count: 4 },
    { key: 'adjustments', label: 'Adjustments', count: 4 },
];

const quickChips = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'by-orders', label: 'By orders' },
    { key: 'downloadable', label: 'Can download' },
    { key: 'not-sent', label: 'Not sent' },
    { key: 'june', label: 'June' },
];
</script>

<template>
  <div class="docs-toolbar">
    <div class="docs-toolbar__line">
      <input
        class="docs-toolbar__search"
        placeholder="Find document, order, amount or number"
        :value="search"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <select class="docs-toolbar__select">
        <option>Newest first</option>
        <option>Oldest first</option>
        <option>By amount</option>
      </select>
      <select class="docs-toolbar__select">
        <option>Current month</option>
        <option>Last month</option>
        <option>Quarter</option>
      </select>
      <select class="docs-toolbar__select">
        <option>All trading points</option>
        <option>North Highway, 12</option>
        <option>Maerchaka, 33</option>
      </select>
      <button class="docs-toolbar__btn docs-toolbar__btn--primary">Search</button>
    </div>

    <div class="docs-toolbar__chips">
      <button
        v-for="f in typeFilters"
        :key="f.key"
        class="docs-toolbar__chip"
        :class="{ 'docs-toolbar__chip--active': activeFilter === f.key }"
        @click="$emit('update:activeFilter', f.key)"
      >
        {{ f.label }} <span class="docs-toolbar__count">{{ f.count }}</span>
      </button>
    </div>

    <div class="docs-toolbar__chips">
      <button
        v-for="chip in quickChips"
        :key="chip.key"
        class="docs-toolbar__chip docs-toolbar__chip--sm"
        :class="{ 'docs-toolbar__chip--active': activeChip === chip.key }"
        @click="$emit('update:activeChip', chip.key)"
      >
        {{ chip.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.docs-toolbar {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
  display: grid;
  gap: 12px;
}

.docs-toolbar__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 150px 180px 120px;
  gap: 10px;
}

.docs-toolbar__search {
  min-height: 46px;
  border: 1px solid #dde7e2;
  border-radius: 16px;
  padding: 0 15px;
  outline: none;
  font: inherit;
  background: #fff;
}

.docs-toolbar__search:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.10);
}

.docs-toolbar__select {
  min-height: 46px;
  border: 1px solid #dde7e2;
  border-radius: 16px;
  padding: 0 12px;
  outline: none;
  font: inherit;
  background: #fff;
  cursor: pointer;
}

.docs-toolbar__select:focus {
  border-color: #00a878;
}

.docs-toolbar__btn {
  border: 0;
  min-height: 46px;
  border-radius: 16px;
  padding: 0 14px;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
  background: #f3f8f6;
  color: #263732;
}

.docs-toolbar__btn--primary { background: #00a878; color: #fff; }

.docs-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.docs-toolbar__chip {
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

.docs-toolbar__chip--sm { min-height: 30px; font-size: 12px; }

.docs-toolbar__chip--active {
  background: #00a878;
  border-color: #00a878;
  color: #fff;
}

.docs-toolbar__count {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.25);
  font-size: 11px;
  font-weight: 900;
}

.docs-toolbar__chip:not(.docs-toolbar__chip--active) .docs-toolbar__count {
  background: #eef4f1;
  color: #66736e;
}

@media (max-width: 1100px) {
  .docs-toolbar__line { grid-template-columns: minmax(0, 1fr) 150px 120px; }
  .docs-toolbar__line .docs-toolbar__select:nth-child(3),
  .docs-toolbar__line .docs-toolbar__select:nth-child(4) { display: none; }
}

@media (max-width: 700px) {
  .docs-toolbar__line { grid-template-columns: 1fr; }
}
</style>
