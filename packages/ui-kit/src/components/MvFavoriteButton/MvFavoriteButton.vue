<script setup lang="ts">
interface Props {
  isFavorited?: boolean;
}

withDefaults(defineProps<Props>(), {
  isFavorited: false,
});

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <button
    class="mv-favorite-btn"
    :class="{ 'mv-favorite-btn--active': isFavorited }"
    type="button"
    aria-label="Toggle favorite"
    @click="emit('toggle')"
  >
    {{ isFavorited ? '♥' : '♡' }}
  </button>
</template>

<style scoped>
.mv-favorite-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: #fff;
  color: #b4ccc4;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.mv-favorite-btn:hover { background: #f4f9f7; }
.mv-favorite-btn--active { color: #ff4d6d; }
</style>
