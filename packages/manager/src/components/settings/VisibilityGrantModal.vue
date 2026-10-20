<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    MvButton,
    MvDatePicker,
    MvFormField,
    MvInput,
    MvModal,
    MvNotice,
    MvSelect,
} from '@mivend/ui-kit';
import type { AdministratorOption, GrantInput } from '../../api/visibilityGrants';
import { periodEndIso, periodStartIso } from '../../utils/visibilityPeriod';

const props = defineProps<{
    administrators: AdministratorOption[];
    error: string;
    saving: boolean;
}>();
const emit = defineEmits<{ close: []; save: [input: GrantInput] }>();

const grantee = ref('');
const manager = ref('');
const from = ref('');
const until = ref('');
const reason = ref('');

const options = computed(() => [{ value: '', label: 'Select…' }, ...props.administrators]);
const invalid = computed(
    () =>
        !grantee.value || !manager.value || grantee.value === manager.value || !reason.value.trim(),
);

function save(): void {
    emit('save', {
        granteeAdministratorId: grantee.value,
        managerAdministratorId: manager.value,
        validFrom: periodStartIso(from.value),
        validTo: periodEndIso(until.value),
        reason: reason.value.trim(),
    });
}
</script>

<template>
    <MvModal title="Add visibility grant" @close="emit('close')">
        <div class="visibility-grant-form">
            <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
            <MvFormField label="Administrator who gets access" required>
                <MvSelect v-model="grantee" :options="options" />
            </MvFormField>
            <MvFormField label="Manager whose clients become visible" required>
                <MvSelect v-model="manager" :options="options" />
            </MvFormField>
            <MvFormField label="From (optional)">
                <MvDatePicker v-model="from" />
            </MvFormField>
            <MvFormField label="Until, inclusive (optional, empty means permanent)">
                <MvDatePicker v-model="until" />
            </MvFormField>
            <MvFormField label="Reason" required>
                <MvInput v-model="reason" placeholder="Why this access is needed" />
            </MvFormField>
            <div class="visibility-grant-form__actions">
                <MvButton variant="secondary" @click="emit('close')">Cancel</MvButton>
                <MvButton :disabled="invalid" :loading="saving" @click="save">Add grant</MvButton>
            </div>
        </div>
    </MvModal>
</template>

<style scoped>
.visibility-grant-form {
    display: grid;
    gap: 14px;
}

.visibility-grant-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
