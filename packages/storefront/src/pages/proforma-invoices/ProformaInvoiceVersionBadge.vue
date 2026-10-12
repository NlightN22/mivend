<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';

defineProps<{ version: number }>();
</script>

<template>
    <MvStatusBadge v-if="version > 1" variant="info" class="version-badge"
        >v{{ version }}</MvStatusBadge
    >
</template>
