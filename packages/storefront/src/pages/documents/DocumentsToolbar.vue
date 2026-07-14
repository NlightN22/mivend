<script setup lang="ts">
export interface TypeFilterOption {
    key: string;
    label: string;
}

defineProps<{ activeFilter: string; search: string; typeFilters: TypeFilterOption[] }>();
defineEmits<{
    (e: 'update:activeFilter', val: string): void;
    (e: 'update:search', val: string): void;
}>();
</script>

<template>
  <div class="docs-toolbar">
    <div class="docs-toolbar__line">
      <input
        class="docs-toolbar__search"
        placeholder="Find document by number"
        :value="search"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="docs-toolbar__chips">
      <button
        v-for="f in typeFilters"
        :key="f.key"
        class="docs-toolbar__chip"
        :class="{ 'docs-toolbar__chip--active': activeFilter === f.key }"
        @click="$emit('update:activeFilter', f.key)"
      >
        {{ f.label }}
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
  grid-template-columns: minmax(0, 1fr);
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

.docs-toolbar__chip--active {
  background: #00a878;
  border-color: #00a878;
  color: #fff;
}

</style>
