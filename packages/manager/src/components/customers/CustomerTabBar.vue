<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// Tab icons use Tabler (the frontend-rules skill's "Icon kit" rule).
import {
    IconHome2,
    IconShoppingBag,
    IconFileInvoice,
    IconCreditCard,
    IconDiscount,
    IconFolder,
    IconUsers,
    IconHistory,
    IconKey,
    IconListDetails,
} from '@tabler/icons-vue';
import type { CustomerDetailTab } from '../../composables/useCustomerDetailTabs';
import { CHANGE_JOURNAL_LABELS } from '../change-journal/changeJournalLabels';

const props = defineProps<{
    primaryTabs: CustomerDetailTab[];
    overflowTabs: CustomerDetailTab[];
    activeTab: CustomerDetailTab;
}>();
const emit = defineEmits<{ select: [tab: CustomerDetailTab] }>();

const { t } = useI18n();

const tabLabel = (tab: CustomerDetailTab): string =>
    tab === 'changeJournal' ? CHANGE_JOURNAL_LABELS.tab : t(`customers.detail.tabs.${tab}`);
const TAB_ICONS: Record<CustomerDetailTab, typeof IconHome2> = {
    overview: IconHome2,
    orders: IconShoppingBag,
    proformaInvoices: IconFileInvoice,
    settlements: IconCreditCard,
    discounts: IconDiscount,
    documents: IconFolder,
    team: IconUsers,
    portalUsers: IconKey,
    history: IconHistory,
    changeJournal: IconListDetails,
};

const isOverflowActive = computed(() => props.overflowTabs.includes(props.activeTab));
const tabsMoreOpen = ref(false);
const tabsMoreRef = ref<HTMLElement | null>(null);

function selectTab(tab: CustomerDetailTab): void {
    emit('select', tab);
    tabsMoreOpen.value = false;
}

function handleOutsideClick(e: MouseEvent): void {
    if (tabsMoreRef.value && !tabsMoreRef.value.contains(e.target as Node)) {
        tabsMoreOpen.value = false;
    }
}

onMounted(() => document.addEventListener('click', handleOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick));
</script>

<template>
    <div class="customer-detail__tabs">
        <button
            v-for="tab in primaryTabs"
            :key="tab"
            type="button"
            :class="{ active: activeTab === tab }"
            @click="selectTab(tab)"
        >
            <component :is="TAB_ICONS[tab]" class="customer-detail__tab-icon" />
            {{ tabLabel(tab) }}
        </button>
        <div v-if="overflowTabs.length" ref="tabsMoreRef" class="customer-detail__tabs-more">
            <button
                type="button"
                class="customer-detail__tabs-more-trigger"
                :class="{ active: isOverflowActive }"
                @click="tabsMoreOpen = !tabsMoreOpen"
            >
                <component
                    v-if="isOverflowActive"
                    :is="TAB_ICONS[activeTab]"
                    class="customer-detail__tab-icon"
                />
                {{ isOverflowActive ? tabLabel(activeTab) : t('customers.detail.more') }} ▾
            </button>
            <div v-if="tabsMoreOpen" class="customer-detail__tabs-more-menu">
                <button
                    v-for="tab in overflowTabs"
                    :key="tab"
                    type="button"
                    :class="{ active: activeTab === tab }"
                    @click="selectTab(tab)"
                >
                    <component :is="TAB_ICONS[tab]" class="customer-detail__tab-icon" />
                    {{ tabLabel(tab) }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.customer-detail__tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color);
    margin-top: 8px;
    position: relative;
    min-width: 0;
}

.customer-detail__tabs > button {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.customer-detail__tabs > button,
.customer-detail__tabs-more-trigger {
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
    white-space: nowrap;
}

.customer-detail__tabs > button.active,
.customer-detail__tabs-more-trigger.active {
    color: var(--el-color-primary-dark-2);
    border-bottom-color: var(--el-color-primary);
}

.customer-detail__tab-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
}

.customer-detail__tabs-more {
    position: relative;
    flex-shrink: 0;
}

.customer-detail__tabs-more-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: var(--mv-z-dropdown);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 6px;
    background: var(--app-surface);
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    box-shadow: var(--app-shadow-md);
}

.customer-detail__tabs-more-menu button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 14px;
    font-weight: 700;
    text-align: left;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}

.customer-detail__tabs-more-menu button:hover {
    background: var(--el-fill-color-light);
}

.customer-detail__tabs-more-menu button.active {
    color: var(--el-color-primary-dark-2);
    background: var(--el-color-primary-light-9);
}
</style>
