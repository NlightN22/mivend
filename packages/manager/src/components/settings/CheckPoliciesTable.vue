<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton, MvInput, MvSelect, MvStatusBadge, MvSwitch } from '@mivend/ui-kit';
import { isRowDirty, policyCaption, type PolicyRow } from '../../utils/checkPolicyRows';

defineProps<{ rows: PolicyRow[]; savingKey: string | null }>();
defineEmits<{ save: [row: PolicyRow]; reset: [row: PolicyRow] }>();
const { t } = useI18n();
</script>

<template>
    <div class="policies__scroll">
        <table class="policies">
            <thead>
                <tr>
                    <th>{{ t('settingsSystem.policies.columns.control') }}</th>
                    <th>{{ t('settingsSystem.policies.columns.stage') }}</th>
                    <th>{{ t('settingsSystem.policies.columns.consequence') }}</th>
                    <th>{{ t('settingsSystem.policies.columns.recipient') }}</th>
                    <th>{{ t('settingsSystem.policies.columns.enabled') }}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in rows" :key="row.key">
                    <td>
                        <strong>{{ row.checkCode }}</strong>
                        <div class="policies__desc">{{ row.description }}</div>
                    </td>
                    <td>
                        {{ row.stage }}
                        <MvStatusBadge v-if="row.branchId && row.inherited" variant="neutral">
                            {{ t('settingsSystem.policies.globalDefault') }}
                        </MvStatusBadge>
                        <MvStatusBadge v-else-if="row.branchId" variant="info">
                            {{ t('settingsSystem.policies.branchOverride') }}
                        </MvStatusBadge>
                    </td>
                    <td>
                        <MvSelect
                            v-model="row.consequence"
                            :options="row.allowedConsequences.map(c => ({ value: c, label: c }))"
                        />
                        <div v-if="policyCaption(row)" class="policies__desc">
                            {{ policyCaption(row) }}
                        </div>
                    </td>
                    <td>
                        <MvInput
                            v-model="row.recipient"
                            :placeholder="t('settingsSystem.policies.recipientPlaceholder')"
                        />
                    </td>
                    <td><MvSwitch v-model="row.enabled" /></td>
                    <td>
                        <MvButton
                            size="sm"
                            :disabled="!isRowDirty(row) || savingKey === row.key"
                            @click="$emit('save', row)"
                        >
                            {{ t('settingsSystem.policies.save') }}
                        </MvButton>
                        <MvButton
                            v-if="row.branchId && !row.inherited"
                            size="sm"
                            variant="secondary"
                            :disabled="savingKey === row.key"
                            @click="$emit('reset', row)"
                        >
                            {{ t('settingsSystem.policies.resetToGlobal') }}
                        </MvButton>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.policies__scroll {
    overflow-x: auto;
}

.policies {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.policies th {
    text-align: left;
    color: var(--el-text-color-secondary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color);
}

.policies td {
    padding: 10px;
    border-bottom: 1px solid var(--el-border-color);
    vertical-align: middle;
}

.policies__desc {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    margin-top: 2px;
}
</style>
