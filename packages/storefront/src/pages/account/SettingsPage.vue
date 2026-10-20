<script setup lang="ts">
import { useAuthStore } from '../../stores/auth';
import { endAllSessions } from '../../api/sessions';
import AccountSidebar from './AccountSidebar.vue';
import SettingsSecurity from './SettingsSecurity.vue';
import SettingsProfile from './SettingsProfile.vue';
import SettingsPreferences from './SettingsPreferences.vue';

const authStore = useAuthStore();

async function signOutAll() {
    // Ends every session including this one; logout() sets the local mv_logged_out guard.
    await endAllSessions();
    await authStore.logout();
    window.location.href = '/login';
}
</script>

<template>
    <div class="set-page">
        <AccountSidebar />

        <section class="set-content">
            <div class="set-head">
                <div>
                    <h1 class="set-title">{{ $t('settings.title') }}</h1>
                    <p class="set-subtitle">
                        {{ $t('settings.subtitle') }}
                    </p>
                </div>
            </div>

            <div class="set-notice">
                <span>ℹ️</span>
                <div>
                    <strong>{{ $t('settings.noticeTitle') }}</strong>
                    {{ $t('settings.noticeText') }}
                </div>
            </div>

            <SettingsProfile />
            <SettingsPreferences />

            <SettingsSecurity />

            <div class="set-block set-block--danger">
                <div class="set-block__head">
                    <div>
                        <h2 class="set-block__title">{{ $t('settings.signOut.title') }}</h2>
                        <div class="set-block__sub">
                            {{ $t('settings.signOut.sub') }}
                        </div>
                    </div>
                    <button class="set-btn set-btn--danger" @click="signOutAll">
                        {{ $t('settings.signOut.everywhere') }}
                    </button>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped src="./SettingsPage.css"></style>
