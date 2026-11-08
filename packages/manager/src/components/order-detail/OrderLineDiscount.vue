<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ percent: number | null }>();
const text = computed(() => (props.percent === null ? '—' : `${props.percent}%`));
</script>

<template>
    <span>{{ text }}</span>
</template>
