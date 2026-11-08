<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvSwitch } from '@mivend/ui-kit';
import { fetchNewDeviceEmail, setNewDeviceEmail } from '../../api/sessions';

const enabled = ref(true);
const loaded = ref(false);
const saving = ref(false);
const failed = ref(false);

onMounted(async () => {
    try {
        enabled.value = await fetchNewDeviceEmail();
        loaded.value = true;
    } catch {
        failed.value = true;
    }
});

async function toggle(value: boolean): Promise<void> {
    saving.value = true;
    failed.value = false;
    try {
        enabled.value = await setNewDeviceEmail(value);
    } catch {
        failed.value = true;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <div class="set-toggle-row">
        <div>
            <div class="set-toggle-title">{{ $t('settings.notifications.newDevice') }}</div>
            <div class="set-toggle-note">
                {{
                    failed
                        ? $t('settings.notifications.newDeviceFailed')
                        : $t('settings.notifications.newDeviceNote')
                }}
            </div>
        </div>
        <MvSwitch
            :model-value="enabled"
            :disabled="!loaded || saving"
            :label="$t('settings.notifications.newDevice')"
            @update:model-value="toggle"
        />
    </div>
</template>

<style scoped src="./SettingsPage.css"></style>
