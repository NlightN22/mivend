<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';
import { useLegalStore } from '../../stores/legal';

const { t, locale } = useI18n();
const legal = useLegalStore();
const failed = ref(false);

async function toggle(): Promise<void> {
    const current = legal.marketing;
    if (!current) return;
    failed.value = false;
    try {
        await legal.accept(
            [{ kind: current.kind, version: current.version, accepted: !current.accepted }],
            locale.value,
        );
    } catch {
        failed.value = true;
    }
}
</script>

<template>
    <div v-if="legal.marketing" class="set-block">
        <div class="set-block__head">
            <div>
                <h2 class="set-block__title">{{ t('legal.marketing.title') }}</h2>
                <div class="set-block__sub">{{ t('legal.marketing.sub') }}</div>
            </div>
        </div>
        <MvNotice v-if="failed" variant="error">{{ t('legal.marketing.failed') }}</MvNotice>
        <div class="set-toggles">
            <div class="set-toggle-row">
                <div class="set-toggle-title">{{ t('legal.marketing.toggle') }}</div>
                <button
                    type="button"
                    class="set-switch"
                    :class="{ 'set-switch--on': legal.marketing.accepted }"
                    :aria-pressed="legal.marketing.accepted"
                    data-testid="marketing-consent-switch"
                    @click="toggle"
                />
            </div>
        </div>
    </div>
</template>

<style scoped src="./SettingsPage.css"></style>
