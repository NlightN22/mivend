<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';

defineProps<{ notRegistered: boolean; erpStatus: string | null }>();
</script>

<template>
    <MvStatusBadge v-if="notRegistered" variant="warning">Not registered in the ERP</MvStatusBadge>
    <MvStatusBadge v-else variant="success">{{ erpStatus ?? 'Registered' }}</MvStatusBadge>
</template>
