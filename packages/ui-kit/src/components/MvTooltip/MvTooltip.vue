<script setup lang="ts">
import { ElTooltip } from 'element-plus';

interface Props {
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

withDefaults(defineProps<Props>(), {
  placement: 'bottom',
});
</script>

<template>
  <ElTooltip :placement="placement" effect="light" trigger="click" popper-class="mv-tooltip__popper">
    <template #content>
      <div class="mv-tooltip__content">
        <slot />
      </div>
    </template>
    <slot name="trigger" />
  </ElTooltip>
</template>

<style>
.mv-tooltip__popper {
  --el-bg-color-overlay: #fff;
  box-shadow: 0 8px 24px rgba(27, 45, 38, 0.14) !important;
  border: 1px solid #dde7e2 !important;
  border-radius: 12px !important;
  max-width: 260px;
}
</style>

<style scoped>
.mv-tooltip__content {
  font-size: 13px;
  color: #2c3b36;
  line-height: 1.5;
}
</style>
