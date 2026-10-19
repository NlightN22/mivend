<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { endAllSessions } from '../../api/sessions';
import AccountSidebar from './AccountSidebar.vue';
import SettingsSecurity from './SettingsSecurity.vue';
import { DEMO_TRADING_POINTS } from './employeesDemo';

const { t, locale } = useI18n();
const authStore = useAuthStore();

async function signOutAll() {
    // Ends every session including this one; logout() sets the local mv_logged_out guard.
    await endAllSessions();
    await authStore.logout();
    window.location.href = '/login';
}

const profile = ref({
    name: t('demo.people.ivanPetrov.name'),
    position: t('demo.position'),
    email: 'ivan.petrov@example.ru',
    phone: '+7 913 000-00-11',
    defaultPoint: 'main',
});
watch(locale, () => {
    profile.value.name = t('demo.people.ivanPetrov.name');
    profile.value.position = t('demo.position');
});
const profileSaving = ref(false);
const profileSaved = ref(false);

async function saveProfile() {
    profileSaving.value = true;
    await new Promise(r => setTimeout(r, 600));
    profileSaving.value = false;
    profileSaved.value = true;
    setTimeout(() => (profileSaved.value = false), 2000);
}

const NOTIFICATION_KEYS = ['orderStatus', 'documents', 'payments', 'marketing'] as const;
const notifications = ref<Record<(typeof NOTIFICATION_KEYS)[number], boolean>>({
    orderStatus: true,
    documents: true,
    payments: true,
    marketing: false,
});

const DEMO_POINTS = computed(() =>
    DEMO_TRADING_POINTS.map(value => ({
        value,
        label: `${t(`demo.points.${value}`)} · ${t(`demo.pointAddresses.${value}`)}`,
    })),
);

const catalogView = ref<'grid' | 'list'>('grid');
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

            <div class="set-block">
                <div class="set-block__head">
                    <div>
                        <h2 class="set-block__title">{{ $t('settings.profile.title') }}</h2>
                        <div class="set-block__sub">
                            {{ $t('settings.profile.sub') }}
                        </div>
                    </div>
                    <span class="set-pill">{{ $t('settings.profile.primaryContact') }}</span>
                </div>

                <div class="set-form">
                    <label class="set-field">
                        <span>{{ $t('settings.profile.fullName') }}</span>
                        <input v-model="profile.name" />
                    </label>
                    <label class="set-field">
                        <span>{{ $t('settings.profile.position') }}</span>
                        <input v-model="profile.position" />
                    </label>
                    <label class="set-field">
                        <span>{{ $t('settings.profile.email') }}</span>
                        <input v-model="profile.email" type="email" />
                    </label>
                    <label class="set-field">
                        <span>{{ $t('settings.profile.phone') }}</span>
                        <input v-model="profile.phone" type="tel" />
                    </label>
                    <label class="set-field set-field--wide">
                        <span>{{ $t('settings.profile.defaultPoint') }}</span>
                        <select v-model="profile.defaultPoint">
                            <option v-for="o in DEMO_POINTS" :key="o.value" :value="o.value">
                                {{ o.label }}
                            </option>
                        </select>
                    </label>
                </div>

                <div class="set-block__footer">
                    <button
                        class="set-btn set-btn--primary"
                        :disabled="profileSaving"
                        @click="saveProfile"
                    >
                        {{
                            profileSaving
                                ? $t('settings.profile.saving')
                                : profileSaved
                                  ? $t('settings.profile.saved')
                                  : $t('settings.profile.save')
                        }}
                    </button>
                </div>
            </div>

            <div class="set-block">
                <div class="set-block__head">
                    <div>
                        <h2 class="set-block__title">{{ $t('settings.notifications.title') }}</h2>
                        <div class="set-block__sub">
                            {{ $t('settings.notifications.sub') }}
                        </div>
                    </div>
                </div>

                <div class="set-toggles">
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
                                :class="{ 'set-segmented__btn--active': catalogView === 'grid' }"
                                @click="catalogView = 'grid'"
                            >
                                {{ $t('settings.interface.grid') }}
                            </button>
                            <button
                                class="set-segmented__btn"
                                :class="{ 'set-segmented__btn--active': catalogView === 'list' }"
                                @click="catalogView = 'list'"
                            >
                                {{ $t('settings.interface.list') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

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
