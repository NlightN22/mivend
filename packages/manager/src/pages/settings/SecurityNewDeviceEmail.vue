<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvNotice, MvPanel, MvSwitch } from '@mivend/ui-kit';
import { fetchNewDeviceEmail, setNewDeviceEmail } from '../../api/sessions';

const enabled = ref(true);
const loaded = ref(false);
const saving = ref(false);
const error = ref('');

onMounted(async () => {
    try {
        enabled.value = await fetchNewDeviceEmail();
        loaded.value = true;
    } catch {
        error.value = 'Не удалось загрузить настройку';
    }
});

async function toggle(value: boolean): Promise<void> {
    saving.value = true;
    error.value = '';
    try {
        enabled.value = await setNewDeviceEmail(value);
    } catch {
        error.value = 'Не удалось сохранить настройку';
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <MvPanel title="Уведомления о входе">
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <MvSwitch
            :model-value="enabled"
            :disabled="!loaded || saving"
            label="Писать мне на почту, когда в мою учётную запись входят с нового устройства"
            @update:model-value="toggle"
        />
    </MvPanel>
</template>
