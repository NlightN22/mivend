<script setup lang="ts">
import { computed } from 'vue';

export type LogoSize = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    name?: string;
    size?: LogoSize;
  }>(),
  { name: 'mivend', size: 'md' },
);

const letter = computed(() => props.name.charAt(0).toUpperCase());
</script>

<template>
  <div :class="['mv-logo', `mv-logo--${size}`]" aria-label="Home">
    <span class="mv-logo__mark" aria-hidden="true">{{ letter }}</span>
    <span class="mv-logo__name">{{ name }}</span>
  </div>
</template>

<style scoped>
.mv-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
  letter-spacing: -0.04em;
  text-decoration: none;
  color: inherit;
}

.mv-logo__mark {
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #00b894, #75ef69 56%, #c8f21a);
  box-shadow: 0 10px 22px rgba(0, 168, 120, 0.24);
  border-radius: 14px;
  font-weight: 900;
  flex-shrink: 0;
}

.mv-logo--sm .mv-logo__mark { width: 32px; height: 32px; font-size: 14px; border-radius: 10px; }
.mv-logo--sm .mv-logo__name { font-size: 18px; }

.mv-logo--md .mv-logo__mark { width: 42px; height: 42px; font-size: 18px; }
.mv-logo--md .mv-logo__name { font-size: 24px; }

.mv-logo--lg .mv-logo__mark { width: 54px; height: 54px; font-size: 24px; border-radius: 18px; }
.mv-logo--lg .mv-logo__name { font-size: 30px; }
</style>
