<script setup lang="ts">
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-vue';

defineProps<{ notRegistered: boolean; erpStatus: string | null }>();
</script>

<template>
    <div class="erp-registration">
        <IconAlertTriangle v-if="notRegistered" :size="22" class="erp-registration__warn" />
        <IconCircleCheck v-else :size="22" class="erp-registration__ok" />
        <span v-if="notRegistered">Not registered in the ERP yet.</span>
        <span v-else>{{ erpStatus ?? 'Registered or not yet due.' }}</span>
    </div>
</template>

<style scoped>
.erp-registration {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
}

.erp-registration__warn {
    color: var(--app-warn-fg);
}

.erp-registration__ok {
    color: var(--app-ok-fg);
}
</style>
