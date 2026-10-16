<script setup lang="ts">
import { MvButton, MvInput, MvSelect, MvSwitch } from '@mivend/ui-kit';
import { isRowDirty, type PolicyRow } from '../../utils/checkPolicyRows';

defineProps<{ rows: PolicyRow[]; savingKey: string | null }>();
defineEmits<{ save: [row: PolicyRow] }>();
</script>

<template>
    <div class="policies__scroll">
        <table class="policies">
            <thead>
                <tr>
                    <th>Control</th>
                    <th>Stage</th>
                    <th>Consequence</th>
                    <th>Recipient</th>
                    <th>Enabled</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in rows" :key="row.key">
                    <td>
                        <strong>{{ row.checkCode }}</strong>
                        <div class="policies__desc">{{ row.description }}</div>
                    </td>
                    <td>{{ row.stage }}</td>
                    <td>
                        <MvSelect
                            v-model="row.consequence"
                            :options="row.allowedConsequences.map(c => ({ value: c, label: c }))"
                        />
                    </td>
                    <td><MvInput v-model="row.recipient" placeholder="Role or group" /></td>
                    <td><MvSwitch v-model="row.enabled" /></td>
                    <td>
                        <MvButton
                            size="sm"
                            :disabled="!isRowDirty(row) || savingKey === row.key"
                            @click="$emit('save', row)"
                        >
                            Save
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
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.policies td {
    padding: 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    vertical-align: middle;
}

.policies__desc {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
    margin-top: 2px;
}
</style>
