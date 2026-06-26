<script setup lang="ts">
import { ElBreadcrumb, ElBreadcrumbItem } from 'element-plus';

export interface Breadcrumb {
  label: string;
  to?: string;
}

interface Props {
  title: string;
  breadcrumbs?: Breadcrumb[];
}

withDefaults(defineProps<Props>(), {
  breadcrumbs: undefined,
});
</script>

<template>
  <div class="mv-page-header">
    <ElBreadcrumb v-if="breadcrumbs?.length" separator="/" class="mv-page-header__breadcrumbs">
      <ElBreadcrumbItem
        v-for="crumb in breadcrumbs"
        :key="crumb.label"
        :to="crumb.to"
      >
        {{ crumb.label }}
      </ElBreadcrumbItem>
    </ElBreadcrumb>
    <h1 class="mv-page-header__title">{{ title }}</h1>
  </div>
</template>

<style scoped>
.mv-page-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 0 20px;
}

.mv-page-header__breadcrumbs {
  font-size: 13px;
}

.mv-page-header__title {
  margin: 0;
  font-size: var(--app-font-size-title, 20px);
  font-weight: 800;
  color: var(--el-text-color-primary, #17212B);
  line-height: 1.2;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
}
</style>
