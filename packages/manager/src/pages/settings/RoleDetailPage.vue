<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    MvButton,
    MvCheckbox,
    MvFormField,
    MvInput,
    MvNotice,
    MvPanel,
    MvSelect,
} from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchRoleDetail,
    updateRolePermissions,
    fetchAccessScopeConfig,
    setAccessScopeConfig,
    fetchCreditTermLimit,
    setCreditTermLimit,
    fetchPermissionCatalog,
    KNOWN_ROLE_CODES,
    PERMISSION_CATEGORIES,
    SCOPE_RESOURCES,
    SCOPE_KINDS,
    type RoleDetail,
    type PermissionInfo,
    type ScopeKind,
} from '../../api/settings';

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();

const code = computed(() => route.params.code as string);
const notFound = computed(
    () => !KNOWN_ROLE_CODES.includes(code.value as (typeof KNOWN_ROLE_CODES)[number]),
);

const scopeOptions = computed(() =>
    SCOPE_KINDS.map(value => ({ value, label: t(`settingsAccess.scopeKinds.${value}`) })),
);

const role = ref<RoleDetail | null>(null);
const permissionCatalog = ref<PermissionInfo[]>([]);
const loading = ref(true);
const saving = ref(false);
const loadError = ref('');

const form = reactive({
    permissions: new Set<string>(),
    scopeConfig: {} as Record<string, ScopeKind>,
    maxExtraDays: '',
    maxAmount: '',
});

type SectionOutcome = { ok: boolean; message?: string } | null;
const saveResults = reactive<{
    permissions: SectionOutcome;
    scope: SectionOutcome;
    credit: SectionOutcome;
}>({
    permissions: null,
    scope: null,
    credit: null,
});

function permissionDescription(name: string): string {
    return permissionCatalog.value.find(p => p.name === name)?.description ?? '';
}

async function load(): Promise<void> {
    if (notFound.value) return;
    loading.value = true;
    loadError.value = '';
    saveResults.permissions = null;
    saveResults.scope = null;
    saveResults.credit = null;
    try {
        const [detail, scope, credit, catalog] = await Promise.all([
            fetchRoleDetail(code.value),
            fetchAccessScopeConfig(code.value),
            fetchCreditTermLimit(code.value),
            fetchPermissionCatalog(),
        ]);
        role.value = detail;
        permissionCatalog.value = catalog;
        form.permissions = new Set(detail?.permissions ?? []);
        form.scopeConfig = Object.fromEntries(
            SCOPE_RESOURCES.map(resource => [resource, scope?.[resource] ?? 'own']),
        );
        form.maxExtraDays = credit ? String(credit.maxExtraDays) : '';
        form.maxAmount = credit?.maxAmount != null ? String(credit.maxAmount) : '';
    } catch (e) {
        // Same cause as RolesListPage.vue's load() — surface it rather than leaving a blank page.
        loadError.value =
            e instanceof Error ? e.message : t('settingsAccess.roleDetail.loadFailed');
    } finally {
        loading.value = false;
    }
}

onMounted(load);

function togglePermission(name: string, checked: boolean): void {
    if (checked) form.permissions.add(name);
    else form.permissions.delete(name);
}

async function save(): Promise<void> {
    if (!role.value) return;
    saving.value = true;
    saveResults.permissions = null;
    saveResults.scope = null;
    saveResults.credit = null;
    try {
        const [permissionsResult, scopeResult, creditResult] = await Promise.allSettled([
            updateRolePermissions(role.value.id, [...form.permissions]),
            setAccessScopeConfig(code.value, form.scopeConfig),
            setCreditTermLimit(
                code.value,
                Number(form.maxExtraDays) || 0,
                form.maxAmount.trim() ? Number(form.maxAmount) : null,
            ),
        ]);
        saveResults.permissions =
            permissionsResult.status === 'fulfilled'
                ? { ok: true }
                : { ok: false, message: (permissionsResult.reason as Error)?.message };
        saveResults.scope =
            scopeResult.status === 'fulfilled'
                ? { ok: true }
                : { ok: false, message: (scopeResult.reason as Error)?.message };
        saveResults.credit =
            creditResult.status === 'fulfilled'
                ? { ok: true }
                : { ok: false, message: (creditResult.reason as Error)?.message };
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAccessControl')" class="role-detail__not-authorized">
        <h1>{{ t('settingsAccess.notAuthorized') }}</h1>
        <p>{{ t('settingsAccess.roles.denied') }}</p>
    </div>

    <div v-else-if="notFound" class="role-detail__not-authorized">
        <h1>{{ t('settingsAccess.roleDetail.notFound') }}</h1>
        <RouterLink to="/settings/roles">{{ t('settingsAccess.roleDetail.back') }}</RouterLink>
    </div>

    <div v-else-if="!loading && loadError" class="role-detail__not-authorized">
        <h1>{{ t('settingsAccess.roleDetail.loadFailed') }}</h1>
        <MvNotice variant="error">{{ loadError }}</MvNotice>
        <RouterLink to="/settings/roles">{{ t('settingsAccess.roleDetail.back') }}</RouterLink>
    </div>

    <div v-else-if="!loading && !role" class="role-detail__not-authorized">
        <h1>{{ t('settingsAccess.roleDetail.notVisible') }}</h1>
        <RouterLink to="/settings/roles">{{ t('settingsAccess.roleDetail.back') }}</RouterLink>
    </div>

    <div v-else-if="!loading && role" class="role-detail">
        <div class="role-detail__breadcrumb">
            <RouterLink to="/settings/roles">{{ t('settingsAccess.roleDetail.crumb') }}</RouterLink>
            / {{ role.code }}
        </div>
        <h1 class="role-detail__title">{{ role.code }}</h1>
        <p class="role-detail__description">{{ role.description }}</p>

        <MvPanel :title="t('settingsAccess.roleDetail.scope')">
            <div class="role-detail__scope-grid">
                <MvFormField
                    v-for="resource in SCOPE_RESOURCES"
                    :key="resource"
                    :label="t(`settingsAccess.scopeResources.${resource}`)"
                >
                    <MvSelect
                        :model-value="form.scopeConfig[resource]"
                        :options="scopeOptions"
                        @update:model-value="form.scopeConfig[resource] = $event as ScopeKind"
                    />
                </MvFormField>
            </div>
        </MvPanel>

        <MvPanel :title="t('settingsAccess.roleDetail.credit')">
            <div class="role-detail__credit-grid">
                <MvFormField :label="t('settingsAccess.roleDetail.maxExtraDays')" required>
                    <MvInput
                        size="sm"
                        type="number"
                        :model-value="form.maxExtraDays"
                        @update:model-value="form.maxExtraDays = $event"
                    />
                </MvFormField>
                <MvFormField :label="t('settingsAccess.roleDetail.maxAmount')">
                    <MvInput
                        size="sm"
                        type="number"
                        :model-value="form.maxAmount"
                        @update:model-value="form.maxAmount = $event"
                    />
                </MvFormField>
            </div>
        </MvPanel>

        <MvPanel :title="t('settingsAccess.roleDetail.permissions')">
            <div class="role-detail__permission-categories">
                <div
                    v-for="category in PERMISSION_CATEGORIES"
                    :key="category.key"
                    class="role-detail__permission-category"
                >
                    <h3>{{ t(`settingsAccess.permissionCategories.${category.key}`) }}</h3>
                    <div
                        v-for="name in category.permissionNames"
                        :key="name"
                        class="role-detail__permission-row"
                    >
                        <MvCheckbox
                            :model-value="form.permissions.has(name)"
                            @update:model-value="togglePermission(name, $event)"
                        >
                            <strong>{{ name }}</strong>
                            <span
                                v-if="permissionDescription(name)"
                                class="role-detail__permission-desc"
                            >
                                — {{ permissionDescription(name) }}
                            </span>
                        </MvCheckbox>
                    </div>
                </div>
            </div>
        </MvPanel>

        <div class="role-detail__save-results">
            <MvNotice
                v-if="saveResults.permissions"
                :variant="saveResults.permissions.ok ? 'success' : 'error'"
            >
                {{
                    saveResults.permissions.ok
                        ? t('settingsAccess.roleDetail.saved.permissions')
                        : t('settingsAccess.roleDetail.failed.permissions', {
                              message: saveResults.permissions.message ?? '',
                          })
                }}
            </MvNotice>
            <MvNotice
                v-if="saveResults.scope"
                :variant="saveResults.scope.ok ? 'success' : 'error'"
            >
                {{
                    saveResults.scope.ok
                        ? t('settingsAccess.roleDetail.saved.scope')
                        : t('settingsAccess.roleDetail.failed.scope', {
                              message: saveResults.scope.message ?? '',
                          })
                }}
            </MvNotice>
            <MvNotice
                v-if="saveResults.credit"
                :variant="saveResults.credit.ok ? 'success' : 'error'"
            >
                {{
                    saveResults.credit.ok
                        ? t('settingsAccess.roleDetail.saved.credit')
                        : t('settingsAccess.roleDetail.failed.credit', {
                              message: saveResults.credit.message ?? '',
                          })
                }}
            </MvNotice>
        </div>

        <MvButton :loading="saving" @click="save">{{
            t('settingsAccess.roleDetail.saveChanges')
        }}</MvButton>
    </div>
</template>

<style scoped>
.role-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.role-detail__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.role-detail__breadcrumb a {
    color: inherit;
}

.role-detail__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.role-detail__description {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 14px;
}

.role-detail__scope-grid,
.role-detail__credit-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}

.role-detail__permission-categories {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.role-detail__permission-category h3 {
    margin: 0 0 8px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary);
}

.role-detail__permission-row {
    padding: 4px 0;
}

.role-detail__permission-desc {
    font-weight: 400;
    color: var(--el-text-color-secondary);
}

.role-detail__save-results {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.role-detail__not-authorized {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary);
}
</style>
