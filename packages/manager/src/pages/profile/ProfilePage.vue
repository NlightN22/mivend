<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton, MvPanel, setThemePreference, themePreference } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { setLocale } from '../../i18n';
import { SUPPORTED_LOCALES } from '../../i18n/locales';
import { THEME_CHOICES } from '../../components/layout/userMenuItems';
import ProfileSecurity from './ProfileSecurity.vue';

const { t, locale } = useI18n();
const authStore = useAuthStore();
</script>

<template>
    <div class="profile-page">
        <div class="profile-page__breadcrumb">{{ t('profile.breadcrumb') }}</div>
        <h1 class="profile-page__title">{{ t('profile.title') }}</h1>

        <MvPanel :title="t('profile.account.title')">
            <dl class="profile-page__facts">
                <dt>{{ t('profile.account.name') }}</dt>
                <dd>{{ authStore.fullName }}</dd>
                <dt>{{ t('profile.account.email') }}</dt>
                <dd>{{ authStore.administrator?.emailAddress }}</dd>
                <template v-if="authStore.roleLabel">
                    <dt>{{ t('profile.account.role') }}</dt>
                    <dd>{{ authStore.roleLabel }}</dd>
                </template>
            </dl>
        </MvPanel>

        <MvPanel :title="t('profile.preferences.title')">
            <div class="profile-page__preference">
                <span id="profile-language">{{ t('profile.preferences.language') }}</span>
                <div class="profile-page__choices" role="group" aria-labelledby="profile-language">
                    <MvButton
                        v-for="code in SUPPORTED_LOCALES"
                        :key="code"
                        size="sm"
                        :variant="locale === code ? 'primary' : 'secondary'"
                        :aria-pressed="locale === code"
                        @click="setLocale(code)"
                    >
                        {{ code.toUpperCase() }}
                    </MvButton>
                </div>
            </div>
            <div class="profile-page__preference">
                <span id="profile-theme">{{ t('profile.preferences.theme') }}</span>
                <div class="profile-page__choices" role="group" aria-labelledby="profile-theme">
                    <MvButton
                        v-for="choice in THEME_CHOICES"
                        :key="choice.value"
                        size="sm"
                        :variant="themePreference === choice.value ? 'primary' : 'secondary'"
                        :aria-pressed="themePreference === choice.value"
                        @click="setThemePreference(choice.value)"
                    >
                        {{ t(choice.labelKey) }}
                    </MvButton>
                </div>
            </div>
        </MvPanel>

        <h2 class="profile-page__section">{{ t('profile.security.title') }}</h2>
        <ProfileSecurity />
    </div>
</template>

<style scoped>
.profile-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.profile-page__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.profile-page__title,
.profile-page__section {
    margin: 0;
}

.profile-page__facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    margin: 0;
}

.profile-page__facts dt {
    color: var(--el-text-color-secondary);
}

.profile-page__facts dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.profile-page__preference {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.profile-page__preference + .profile-page__preference {
    margin-top: 12px;
}

.profile-page__choices {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
</style>
