<script setup lang="ts">
import { IconAlertTriangle } from '@tabler/icons-vue';
import { MvTooltip } from '@mivend/ui-kit';

defineProps<{ price: string; belowFloor: boolean }>();
</script>

<template>
    <MvTooltip v-if="belowFloor" trigger="hover" placement="bottom">
        <template #trigger>
            <span class="unit-price unit-price--bad" tabindex="0">
                {{ price }}
                <IconAlertTriangle :size="15" class="unit-price__warn" />
            </span>
        </template>
        <p class="unit-price__head">The unit price is below the floor price</p>
        <p class="unit-price__note">Review the price or use Adjust price.</p>
    </MvTooltip>
    <span v-else>{{ price }}</span>
</template>

<style scoped>
.unit-price {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: help;
}

.unit-price--bad {
    color: var(--el-color-danger, #dc2626);
    font-weight: 700;
}

.unit-price__warn {
    color: var(--el-color-warning, #d97706);
}

.unit-price__head {
    margin: 0 0 4px;
    font-weight: 700;
}

.unit-price__note {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
