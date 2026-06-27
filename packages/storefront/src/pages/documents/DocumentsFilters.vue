<script setup lang="ts">
defineProps<{ activeFilter: string }>();
defineEmits<{ (e: 'update:activeFilter', val: string): void }>();

const filterItems = [
    { key: 'all', label: 'All documents', count: 48 },
    { key: 'reconciliation', label: 'Reconciliation', count: 3 },
    { key: 'invoices', label: 'Invoices', count: 9 },
    { key: 'upd', label: 'UPD', count: 16 },
    { key: 'waybills', label: 'Waybills', count: 12 },
    { key: 'returns', label: 'Returns', count: 4 },
    { key: 'adjustments', label: 'Adjustments', count: 4 },
];
</script>

<template>
  <aside class="docs-filters">
    <h2 class="docs-filters__title">Document type</h2>

    <nav class="docs-filters__list">
      <button
        v-for="item in filterItems"
        :key="item.key"
        class="docs-filters__link"
        :class="{ 'docs-filters__link--active': activeFilter === item.key }"
        @click="$emit('update:activeFilter', item.key)"
      >
        <span>{{ item.label }}</span>
        <span class="docs-filters__count">{{ item.count }}</span>
      </button>
    </nav>

    <div class="docs-filters__block">
      <div class="docs-filters__field">
        <label>Period</label>
        <select>
          <option>Current month</option>
          <option>Last month</option>
          <option>Quarter</option>
          <option>Custom</option>
        </select>
      </div>

      <div class="docs-filters__field">
        <label>Trading point</label>
        <select>
          <option>All trading points</option>
          <option>North Highway, 12</option>
          <option>Maerchaka, 33</option>
        </select>
      </div>

      <div class="docs-filters__field">
        <label>Order</label>
        <input placeholder="Order number" />
      </div>

      <button class="docs-filters__reset">Reset filters</button>
    </div>
  </aside>
</template>

<style scoped>
.docs-filters {
  position: sticky;
  top: 118px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
}

.docs-filters__title {
  margin: 0 0 13px;
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.035em;
}

.docs-filters__list {
  display: grid;
  gap: 6px;
  margin-bottom: 18px;
}

.docs-filters__link {
  min-height: 39px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 12px;
  padding: 0 11px;
  color: #2d3d37;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}

.docs-filters__link:hover { background: #f4faf7; }

.docs-filters__link--active {
  background: #e2f8ef;
  color: #008a64;
  font-weight: 950;
}

.docs-filters__count {
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

.docs-filters__block {
  border-top: 1px solid #edf2ef;
  padding-top: 16px;
}

.docs-filters__field {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
}

.docs-filters__field label {
  color: #66736e;
  font-size: 13px;
  font-weight: 850;
}

.docs-filters__field input,
.docs-filters__field select {
  min-height: 42px;
  border: 1px solid #dde7e2;
  border-radius: 13px;
  padding: 0 12px;
  outline: none;
  background: #fff;
  font: inherit;
}

.docs-filters__field input:focus,
.docs-filters__field select:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.10);
}

.docs-filters__reset {
  width: 100%;
  min-height: 40px;
  border: 0;
  border-radius: 12px;
  background: #f3f8f6;
  color: #263732;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
}

@media (max-width: 1260px) {
  .docs-filters { position: static; }
  .docs-filters__list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .docs-filters__list { grid-template-columns: 1fr; }
}
</style>
