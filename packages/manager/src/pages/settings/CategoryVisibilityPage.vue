<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import CategoryVisibilityCurationTable from '../../components/settings/CategoryVisibilityCurationTable.vue';
import {
    fetchCategoryVisibilityCollections,
    setCategoryVisibilityOverride,
    type CategoryVisibilityCollection,
} from '../../api/categoryVisibility';

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
        loadError.value = e instanceof Error ? e.message : 'Could not load categories';
    } finally {
        loading.value = false;
    }
}

const savingCollectionId = ref<string | null>(null);
const saveError = ref('');

async function onSetOverride(payload: { id: string; visibilityOverride: string | null }): Promise<void> {
    savingCollectionId.value = payload.id;
    saveError.value = '';
    try {
        const updated = await setCategoryVisibilityOverride(payload.id, payload.visibilityOverride);
        const index = collections.value.findIndex(c => c.id === updated.id);
        if (index !== -1) collections.value[index] = updated;
    } catch (e) {
        saveError.value = e instanceof Error ? e.message : 'Could not update category visibility';
    } finally {
        savingCollectionId.value = null;
    }
}

onMounted(loadAll);
</script>

<template>
    <!-- Gated on UpdateCatalog, not ManageAccessControl (Settings' own sidebar-level gate) —
    that's the permission setCategoryVisibilityOverride's updateCollection mutation actually
    requires, per mivend.audit.90. Today portal-admin is the only role with either, but checking
    the permission the page truly needs keeps this page correct if that ever changes. -->
    <div v-if="!authStore.hasPermission('UpdateCatalog')" class="category-visibility-page__not-authorized">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage category visibility.</p>
    </div>

    <div v-else class="category-visibility-page">
        <div class="category-visibility-page__breadcrumb">Workspace / Settings</div>
        <h1 class="category-visibility-page__title">Category visibility</h1>
        <SettingsSubNav active="category-visibility" />

        <MvNotice v-if="loadError" variant="error">{{ loadError }}</MvNotice>

        <MvPanel title="Manual visibility overrides">
            <template #subheader>
                <p class="category-visibility-page__description">
                    Force a category's storefront visibility regardless of what the 1C feed
                    reports. "Auto" follows the feed (hidden when the upstream category is
                    inactive or deleted); "Hidden"/"Visible" pin the category and survive the next
                    feed update.
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
    max-width: 1000px;
}

.category-visibility-page__description {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.category-visibility-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
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
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
