<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvStatusBadge } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import ApprovalsList from '../../components/approvals/ApprovalsList.vue';

const { t } = useI18n();
const authStore = useAuthStore();
</script>

<template>
    <div class="approvals-page">
        <div class="approvals-page__header">
            <div>
                <div class="approvals-page__breadcrumb">{{ t('approvals.page.breadcrumb') }}</div>
                <h1 class="approvals-page__title">{{ t('approvals.page.title') }}</h1>
            </div>
            <MvStatusBadge variant="info">{{
                authStore.roleLabel ?? authStore.roleCode
            }}</MvStatusBadge>
        </div>

        <ApprovalsList />
    </div>
</template>

<style scoped>
.approvals-page__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 14px;
}

.approvals-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.approvals-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .approvals-page__breadcrumb {
        display: none;
    }

    .approvals-page__title {
        font-size: 22px;
    }
}
</style>
