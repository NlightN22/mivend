<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import CategoryVisibilityCurationTable from '../../components/settings/CategoryVisibilityCurationTable.vue';
import {
    fetchCategoryVisibilityCollections,
    setCategoryVisibilityOverride,
    type CategoryVisibilityCollection,
} from '../../api/categoryVisibility';

const { t } = useI18n();
const authStore = useAuthStore();

const collections = ref<CategoryVisibilityCollection[]>([]);
const loading = ref(true);
const loadError = ref('');

async function loadAll(): Promise<void> {
    loading.value = true;
    loadError.value = '';
    try {
        collections.value = await fetchCategoryVisibilityCollections();
    } catch (e) {
        loadError.value =
            e instanceof Error ? e.message : t('settingsAccess.categories.loadFailed');
    } finally {
        loading.value = false;
    }
}

const savingCollectionId = ref<string | null>(null);
const saveError = ref('');

async function onSetOverride(payload: {
    id: string;
    visibilityOverride: string | null;
}): Promise<void> {
    savingCollectionId.value = payload.id;
    saveError.value = '';
    try {
        const updated = await setCategoryVisibilityOverride(payload.id, payload.visibilityOverride);
        const index = collections.value.findIndex(c => c.id === updated.id);
        if (index !== -1) collections.value[index] = updated;
    } catch (e) {
        saveError.value =
            e instanceof Error ? e.message : t('settingsAccess.categories.saveFailed');
    } finally {
        savingCollectionId.value = null;
    }
}

onMounted(loadAll);
</script>

<template>
    <!-- Gated on UpdateCatalog, the permission the updateCollection mutation actually requires. -->
    <div
        v-if="!authStore.hasPermission('UpdateCatalog')"
        class="category-visibility-page__not-authorized"
    >
        <h1>{{ t('settingsAccess.notAuthorized') }}</h1>
        <p>{{ t('settingsAccess.categories.denied') }}</p>
    </div>

    <div v-else class="category-visibility-page">
        <div class="category-visibility-page__breadcrumb">{{ t('settingsAccess.breadcrumb') }}</div>
        <h1 class="category-visibility-page__title">{{ t('settingsAccess.categories.title') }}</h1>

        <MvNotice v-if="loadError" variant="error">{{ loadError }}</MvNotice>

        <MvPanel :title="t('settingsAccess.categories.panel')">
            <template #subheader>
                <p class="category-visibility-page__description">
                    {{ t('settingsAccess.categories.description') }}
                </p>
            </template>

            <MvNotice v-if="saveError" variant="error">{{ saveError }}</MvNotice>
            <CategoryVisibilityCurationTable
                :collections="collections"
                :loading="loading"
                :saving-collection-id="savingCollectionId"
                :administrator-id="authStore.administrator?.id ?? 'anonymous'"
                @set-override="onSetOverride"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.category-visibility-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.category-visibility-page__description {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.category-visibility-page__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.category-visibility-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.category-visibility-page__not-authorized {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary);
}
</style>
