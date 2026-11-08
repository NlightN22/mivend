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
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load the setting';
    }
});

async function toggle(value: boolean): Promise<void> {
    saving.value = true;
    error.value = '';
    try {
        enabled.value = await setNewDeviceEmail(value);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not save the setting';
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <MvPanel title="Sign-in notifications">
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <MvSwitch
            :model-value="enabled"
            :disabled="!loaded || saving"
            label="E-mail me when my account is signed in to from a new device"
            @update:model-value="toggle"
        />
    </MvPanel>
</template>
