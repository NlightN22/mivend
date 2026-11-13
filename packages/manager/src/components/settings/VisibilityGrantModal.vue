<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n();
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

const options = computed(() => [
    { value: '', label: t('settingsAccess.grants.select') },
    ...props.administrators,
]);
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
    <MvModal :title="t('settingsAccess.grants.modalTitle')" @close="emit('close')">
        <div class="visibility-grant-form">
            <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
            <MvFormField :label="t('settingsAccess.grants.fields.grantee')" required>
                <MvSelect v-model="grantee" :options="options" />
            </MvFormField>
            <MvFormField :label="t('settingsAccess.grants.fields.manager')" required>
                <MvSelect v-model="manager" :options="options" />
            </MvFormField>
            <MvFormField :label="t('settingsAccess.grants.fields.from')">
                <MvDatePicker v-model="from" />
            </MvFormField>
            <MvFormField :label="t('settingsAccess.grants.fields.until')">
                <MvDatePicker v-model="until" />
            </MvFormField>
            <MvFormField :label="t('settingsAccess.grants.fields.reason')" required>
                <MvInput
                    v-model="reason"
                    :placeholder="t('settingsAccess.grants.fields.reasonHint')"
                />
            </MvFormField>
            <div class="visibility-grant-form__actions">
                <MvButton variant="secondary" @click="emit('close')">{{
                    t('common.cancel')
                }}</MvButton>
                <MvButton :disabled="invalid" :loading="saving" @click="save">{{
                    t('settingsAccess.grants.add')
                }}</MvButton>
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
