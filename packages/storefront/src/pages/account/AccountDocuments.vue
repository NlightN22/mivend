<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvErrorState, MvSkeleton } from '@mivend/ui-kit';
import { formatDate } from '../../i18n/format';
import { toDocData, type DocumentSummary } from '../documents/useDocuments';
import { describeLoadError } from '../../api/describeLoadError';
import { useDemoMode } from '../../composables/useDemoMode';

const LATEST_COUNT = 3;

const props = defineProps<{ documents: DocumentSummary[]; loading: boolean; error: unknown }>();
defineEmits<{ retry: [] }>();

const { t } = useI18n();
const { demoAllowed } = useDemoMode();
const errorText = computed(() => (props.error ? describeLoadError(props.error) : null));

const rows = computed(() =>
    props.documents.slice(0, LATEST_COUNT).map(doc => {
        const data = toDocData(doc);
        return {
            id: doc.id,
            title: data.name,
            note: `${data.meta} · ${data.date}`,
            url: data.downloadUrl,
        };
    }),
);
const demoReconciliationNote = computed(() =>
    formatDate('2026-06-01', { month: 'long', year: 'numeric' }),
);
</script>

<template>
    <div class="account-documents">
        <div class="account-documents__header">
            <div>
                <h2 class="account-documents__title">{{ t('account.recentDocuments.title') }}</h2>
                <div class="account-documents__subtitle">
                    {{ t('account.recentDocuments.subtitle') }}
                </div>
            </div>
            <RouterLink to="/documents" class="account-documents__link-more">{{
                t('account.recentDocuments.all')
            }}</RouterLink>
        </div>

        <div v-if="loading && !documents.length" class="account-documents__list">
            <MvSkeleton v-for="n in 3" :key="n" height="58px" radius="16px" />
        </div>
        <MvErrorState
            v-else-if="errorText"
            :title="errorText.title"
            :message="errorText.message"
            :retry-label="t('common.retry')"
            @retry="$emit('retry')"
        />
        <div v-else class="account-documents__list">
            <div v-if="!rows.length" class="account-documents__empty">
                {{ t('account.recentDocuments.empty') }}
            </div>
            <div v-for="doc in rows" :key="doc.id" class="account-documents__row">
                <div>
                    <div class="account-documents__doc-title">{{ doc.title }}</div>
                    <div class="account-documents__doc-note">{{ doc.note }}</div>
                </div>
                <a
                    v-if="doc.url"
                    :href="doc.url"
                    target="_blank"
                    download
                    class="account-documents__action"
                    >{{ t('account.recentDocuments.download') }}</a
                >
            </div>
            <div v-if="demoAllowed" class="account-documents__row">
                <div>
                    <div class="account-documents__doc-title">
                        {{ t('account.recentDocuments.reconciliation') }}
                    </div>
                    <div class="account-documents__doc-note">{{ demoReconciliationNote }}</div>
                </div>
                <RouterLink to="/reconciliation-acts" class="account-documents__action">{{
                    t('account.recentDocuments.open')
                }}</RouterLink>
            </div>
        </div>
    </div>
</template>

<style scoped>
.account-documents {
    background: #fff;
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    border: 1px solid rgba(221, 231, 226, 0.86);
    padding: 22px;
}

.account-documents__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
}

.account-documents__title {
    margin: 0 0 5px;
    font-size: 26px;
    letter-spacing: -0.045em;
}

.account-documents__subtitle {
    color: #66736e;
    font-size: 14px;
    line-height: 1.45;
}

.account-documents__link-more {
    color: #008a64;
    font-weight: 950;
    font-size: 14px;
    white-space: nowrap;
    text-decoration: none;
}

.account-documents__list {
    display: grid;
    gap: 10px;
}

.account-documents__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 58px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid #edf2ef;
    background: #fbfdfc;
}

.account-documents__doc-title {
    font-weight: 900;
    margin-bottom: 3px;
}

.account-documents__doc-note {
    color: #66736e;
    font-size: 13px;
    line-height: 1.3;
}

.account-documents__empty {
    padding: 22px 16px;
    border: 1px dashed #dde7e2;
    border-radius: 18px;
    color: #66736e;
    font-size: 14px;
    text-align: center;
}

.account-documents__action {
    color: #008a64;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
    text-decoration: none;
}
</style>
