<script setup lang="ts">
import { ref } from 'vue';
import { MvNotImplemented } from '@mivend/ui-kit';
import { useDemoMode } from '../../composables/useDemoMode';
import { useViewMode } from '../../composables/useViewMode';

const { demoAllowed } = useDemoMode();
const { viewMode, setViewMode } = useViewMode();

const NOTIFICATION_KEYS = ['orderStatus', 'documents', 'payments', 'marketing'] as const;
const notifications = ref<Record<(typeof NOTIFICATION_KEYS)[number], boolean>>({
    orderStatus: true,
    documents: true,
    payments: true,
    marketing: false,
});
</script>

<template>
    <div class="set-block">
        <div class="set-block__head">
            <div>
                <h2 class="set-block__title">{{ $t('settings.notifications.title') }}</h2>
                <div class="set-block__sub">
                    {{ $t('settings.notifications.sub') }}
                </div>
            </div>
        </div>

        <MvNotImplemented
            v-if="!demoAllowed"
            size="widget"
            :title="$t('common.notImplemented.title')"
            :message="$t('common.notImplemented.message')"
        />
        <div v-else class="set-toggles">
            <div v-for="key in NOTIFICATION_KEYS" :key="key" class="set-toggle-row">
                <div>
                    <div class="set-toggle-title">
                        {{ $t(`settings.notifications.${key}`) }}
                    </div>
                    <div class="set-toggle-note">
                        {{ $t(`settings.notifications.${key}Note`) }}
                    </div>
                </div>
                <button
                    class="set-switch"
                    :class="{ 'set-switch--on': notifications[key] }"
                    @click="notifications[key] = !notifications[key]"
                />
            </div>
        </div>
    </div>

    <div class="set-block">
        <div class="set-block__head">
            <div>
                <h2 class="set-block__title">{{ $t('settings.interface.title') }}</h2>
                <div class="set-block__sub">
                    {{ $t('settings.interface.sub') }}
                </div>
            </div>
        </div>

        <div class="set-toggles">
            <div class="set-toggle-row">
                <div>
                    <div class="set-toggle-title">
                        {{ $t('settings.interface.catalogView') }}
                    </div>
                    <div class="set-toggle-note">
                        {{ $t('settings.interface.catalogViewNote') }}
                    </div>
                </div>
                <div class="set-segmented">
                    <button
                        class="set-segmented__btn"
                        :class="{ 'set-segmented__btn--active': viewMode === 'grid' }"
                        @click="setViewMode('grid')"
                    >
                        {{ $t('settings.interface.grid') }}
                    </button>
                    <button
                        class="set-segmented__btn"
                        :class="{ 'set-segmented__btn--active': viewMode === 'list' }"
                        @click="setViewMode('list')"
                    >
                        {{ $t('settings.interface.list') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped src="./SettingsPage.css"></style>
