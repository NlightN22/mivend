<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { IconCircleCheck, IconAlertTriangle } from '@tabler/icons-vue';
import { useAuthStore } from '../../stores/auth';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import {
    buildSystemHealthChecklist,
    fetchSystemHealthData,
    type SystemHealthCheckItem,
} from '../../api/system-health';

const authStore = useAuthStore();
const checklist = ref<SystemHealthCheckItem[]>([]);
const loading = ref(true);
const error = ref('');

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        const data = await fetchSystemHealthData();
        checklist.value = buildSystemHealthChecklist(data);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load system health data';
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    if (authStore.hasPermission('ManageAccessControl')) void load();
});
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAccessControl')" class="system-health-page__not-authorized">
        <h1>Not authorized</h1>
        <p>You don't have permission to view system health.</p>
    </div>

    <div v-else class="system-health-page">
        <div class="system-health-page__breadcrumb">Workspace / Settings</div>
        <h1 class="system-health-page__title">System health</h1>
        <SettingsSubNav active="system-health" />

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel v-if="!loading" title="Store setup checklist">
            <ul class="system-health-page__items">
                <li v-for="item in checklist" :key="item.id" class="system-health-page__row">
                    <div class="system-health-page__row-main">
                        <IconCircleCheck
                            v-if="item.status === 'ok'"
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
    </div>
</template>

<style scoped>
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
