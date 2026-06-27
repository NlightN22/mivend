<script setup lang="ts">
interface Props {
  padding?: string;
  shadow?: boolean;
}

withDefaults(defineProps<Props>(), {
  padding: '20px',
  shadow: true,
});
</script>

<template>
  <div
    class="mv-card"
    :class="{ 'mv-card--shadow': shadow }"
    :style="{ padding: padding }"
  >
    <slot />
  </div>
</template>

<style scoped>
.mv-card {
  background: #fff;
  border-radius: 20px;
  border: 1px solid rgba(221, 231, 226, 0.86);
}

.mv-card--shadow {
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
}
</style>
