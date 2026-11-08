<script setup lang="ts">
defineProps<{ reserved: number; needed: number }>();
</script>

<template>
    <span>{{ reserved }} / {{ needed }}</span>
</template>
