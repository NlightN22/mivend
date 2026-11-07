<script setup lang="ts">
import { MvButton, MvNotice } from '@mivend/ui-kit';
import { useActAsCustomer } from '../../composables/useActAsCustomer';

const props = defineProps<{ counterpartyId: string }>();
const { allowed, starting, error, start } = useActAsCustomer(() => props.counterpartyId);
</script>

<template>
    <div v-if="allowed" class="act-as-customer">
        <MvButton :disabled="starting" @click="start">
            {{ starting ? 'Opening…' : 'Act as customer' }}
        </MvButton>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
    </div>
</template>

<style scoped>
.act-as-customer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
}
</style>
