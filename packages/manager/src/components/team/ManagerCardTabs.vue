<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { IconChartBar, IconChartLine, IconShoppingBag, IconUsers } from '@tabler/icons-vue';

defineProps<{ tabs: readonly string[]; active: string }>();
const emit = defineEmits<{ select: [tab: string] }>();

const { t } = useI18n();
const ICONS: Record<string, typeof IconUsers> = {
    overview: IconChartBar,
    customers: IconUsers,
    orders: IconShoppingBag,
    analytics: IconChartLine,
};
</script>

<template>
    <div class="manager-tabs" role="tablist">
        <button
            v-for="tab in tabs"
            :key="tab"
            type="button"
            role="tab"
            :aria-selected="active === tab"
            :class="{ active: active === tab }"
            @click="emit('select', tab)"
        >
            <component :is="ICONS[tab]" class="manager-tabs__icon" />
            {{ t(`managerCard.tabs.${tab}`) }}
        </button>
    </div>
</template>

<style scoped>
.manager-tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color);
    margin-bottom: 16px;
}

.manager-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}

.manager-tabs button.active {
    color: var(--el-color-primary-dark-2);
    border-bottom-color: var(--el-color-primary);
}

.manager-tabs__icon {
    width: 16px;
    height: 16px;
}
</style>
