<script setup lang="ts">
import { onMounted } from 'vue';
import { MvTwoFactorSettings, useTwoFactorSettings } from '@mivend/ui-kit';
import { twoFactorSettingsApi } from '../../api/twoFactor';
import { useTwoFactorLabels } from '../auth/useTwoFactorLabels';

const labels = useTwoFactorLabels();
const tf = useTwoFactorSettings(twoFactorSettingsApi);
const { status, enrolment, error, loading, justEnabled } = tf;

onMounted(tf.load);
</script>

<template>
    <div class="set-block">
        <MvTwoFactorSettings
            :status="status"
            :enrolment="enrolment"
            :error="error"
            :loading="loading"
            :just-enabled="justEnabled"
            :labels="labels"
            @begin="tf.begin"
            @confirm="tf.confirm"
            @cancel="tf.cancel"
        />
    </div>
</template>

<style scoped src="./SettingsPage.css"></style>
