<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvButton, MvNotice, MvPanel } from '@mivend/ui-kit';
import type { NotificationItem } from '@mivend/ui-kit';
import { IconCircleCheck, IconAlertTriangle } from '@tabler/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { fetchSystemHealthChecklist, type SystemHealthCheckItem } from '../../api/system-health';
import { fetchNotifications } from '../../api/notifications';
import OrderCheckHealthPanel from '../../components/settings/OrderCheckHealthPanel.vue';
import ErpReconciliationPanel from '../../components/dashboard/ErpReconciliationPanel.vue';

// ERP reconciliation panel take cap — same fixed-row-cap reasoning as the Dashboard's own
// health panels before this moved here (issue #98).
const HEALTH_PANEL_TAKE = 10;

const authStore = useAuthStore();
const checklist = ref<SystemHealthCheckItem[]>([]);
const loading = ref(true);
const checklistFailed = ref(false);
const erpIssues = ref<NotificationItem[]>([]);

async function load(): Promise<void> {
    loading.value = true;
    checklistFailed.value = false;
    try {
        checklist.value = await fetchSystemHealthChecklist();
    } catch (e) {
        console.warn('[system-health] could not load the store setup checklist:', e);
        checklistFailed.value = true;
    } finally {
        loading.value = false;
    }
}

async function loadErpIssues(): Promise<void> {
    try {
        const page = await fetchNotifications({ status: 'unread' });
        erpIssues.value = page.items
            .filter(n => n.sourceType === 'erp-reconciliation')
            .slice(0, HEALTH_PANEL_TAKE);
    } catch (e) {
        console.warn('[system-health] could not load ERP reconciliation notifications:', e);
        erpIssues.value = [];
    }
}

onMounted(() => {
    if (authStore.hasPermission('ManageAccessControl')) void load();
    if (authStore.hasPermission('ManageErpIntegration')) void loadErpIssues();
});
</script>

<template>
    <div
        v-if="
            !authStore.hasPermission('ManageAccessControl') &&
            !authStore.hasPermission('ManageErpIntegration')
        "
        class="system-health-page__not-authorized"
    >
        <h1>Not authorized</h1>
        <p>You don't have permission to view system health.</p>
    </div>

    <div v-else class="system-health-page">
        <div class="system-health-page__breadcrumb">Workspace / System settings</div>
        <h1 class="system-health-page__title">System health</h1>

        <MvPanel
            v-if="authStore.hasPermission('ManageAccessControl') && !loading"
            title="Store setup checklist"
        >
            <MvNotice v-if="checklistFailed" variant="error">
                <div class="system-health-page__failure">
                    <span>The store setup checklist could not be loaded.</span>
                    <MvButton variant="secondary" @click="load">Retry</MvButton>
                </div>
            </MvNotice>
            <ul v-else class="system-health-page__items">
                <li v-for="item in checklist" :key="item.id" class="system-health-page__row">
                    <div class="system-health-page__row-main">
                        <IconCircleCheck
                            v-if="item.ok"
                            class="system-health-page__icon system-health-page__icon--ok"
                            :size="20"
                        />
                        <IconAlertTriangle
                            v-else
                            class="system-health-page__icon system-health-page__icon--missing"
                            :size="20"
                        />
                        <span>{{ item.label }}</span>
                    </div>
                    <p v-if="item.detail" class="system-health-page__detail">{{ item.detail }}</p>
                </li>
            </ul>
        </MvPanel>

        <MvPanel
            v-if="authStore.hasPermission('ManageErpIntegration')"
            title="Orders failing ERP requirements"
        >
            <OrderCheckHealthPanel />
        </MvPanel>

        <MvPanel v-if="authStore.hasPermission('ManageErpIntegration')" title="ERP reconciliation">
            <ErpReconciliationPanel :notifications="erpIssues" @refresh="loadErpIssues" />
        </MvPanel>
    </div>
</template>

<style scoped>
.system-health-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.system-health-page__failure {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.system-health-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.system-health-page__title {
    margin: 0 0 4px;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.system-health-page__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.system-health-page__row {
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
}

.system-health-page__row-main {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: #111827;
}

.system-health-page__icon--ok {
    color: #059669;
}

.system-health-page__icon--missing {
    color: #dc2626;
}

.system-health-page__detail {
    margin: 6px 0 0 30px;
    color: #6b7280;
    font-size: 12px;
}

.system-health-page__not-authorized {
    padding: 40px;
    text-align: center;
    color: #6b7280;
}
</style>
