<script setup lang="ts">
import { onMounted } from 'vue';
import { MvPanel, MvTwoFactorSettings, useTwoFactorSettings } from '@mivend/ui-kit';
import { twoFactorSettingsApi } from '../../api/twoFactor';
import { TWO_FACTOR_LABELS as labels } from '../auth/twoFactorLabels';

const tf = useTwoFactorSettings(twoFactorSettingsApi);
const { status, enrolment, error, loading, justEnabled } = tf;

onMounted(tf.load);
</script>

<template>
    <MvPanel>
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
    </MvPanel>
</template>
