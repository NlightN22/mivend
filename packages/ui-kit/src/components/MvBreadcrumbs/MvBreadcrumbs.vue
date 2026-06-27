<script setup lang="ts">
interface BreadcrumbItem {
  label: string;
  to?: string;
}

defineProps<{ items: BreadcrumbItem[] }>();
</script>

<template>
  <nav class="mv-breadcrumbs" aria-label="Breadcrumb">
    <template v-for="(item, i) in items" :key="i">
      <span v-if="i > 0" class="mv-breadcrumbs__sep" aria-hidden="true">/</span>
      <RouterLink v-if="item.to" :to="item.to" class="mv-breadcrumbs__link">
        {{ item.label }}
      </RouterLink>
      <span v-else class="mv-breadcrumbs__current">{{ item.label }}</span>
    </template>
  </nav>
</template>

<style scoped>
.mv-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.mv-breadcrumbs__link {
  color: #66736e;
  text-decoration: none;
  transition: color 0.12s;
}

.mv-breadcrumbs__link:hover { color: #00b894; }

.mv-breadcrumbs__sep { color: #a8b8b2; }

.mv-breadcrumbs__current {
  color: #2c3b36;
  font-weight: 600;
}
</style>
