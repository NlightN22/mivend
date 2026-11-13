<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel, MvSwitch } from '@mivend/ui-kit';
import { fetchNewDeviceEmail, setNewDeviceEmail } from '../../api/sessions';

const { t } = useI18n();
const enabled = ref(true);
const loaded = ref(false);
const saving = ref(false);
const error = ref('');

onMounted(async () => {
    try {
        enabled.value = await fetchNewDeviceEmail();
        loaded.value = true;
    } catch {
        error.value = t('settingsSystem.security.newDevice.loadFailed');
    }
});

async function toggle(value: boolean): Promise<void> {
    saving.value = true;
    error.value = '';
    try {
        enabled.value = await setNewDeviceEmail(value);
    } catch {
        error.value = t('settingsSystem.security.newDevice.saveFailed');
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <MvPanel :title="t('settingsSystem.security.newDevice.title')">
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <MvSwitch
            :model-value="enabled"
            :disabled="!loaded || saving"
            :label="t('settingsSystem.security.newDevice.label')"
            @update:model-value="toggle"
        />
    </MvPanel>
</template>
