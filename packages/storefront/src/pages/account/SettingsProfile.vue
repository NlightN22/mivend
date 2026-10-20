<script setup lang="ts">
import { useSettingsProfile } from './useSettingsProfile';

const { form, email, pointId, points, loading, saving, save } = useSettingsProfile();
</script>

<template>
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
                <span>{{ $t('settings.profile.firstName') }}</span>
                <input v-model="form.firstName" :disabled="loading" autocomplete="given-name" />
            </label>
            <label class="set-field">
                <span>{{ $t('settings.profile.lastName') }}</span>
                <input v-model="form.lastName" :disabled="loading" autocomplete="family-name" />
            </label>
            <label class="set-field">
                <span>{{ $t('settings.profile.email') }}</span>
                <input :value="email" type="email" readonly disabled />
                <small class="set-field__note">{{ $t('settings.profile.emailNote') }}</small>
            </label>
            <label class="set-field">
                <span>{{ $t('settings.profile.phone') }}</span>
                <input
                    v-model="form.phoneNumber"
                    :disabled="loading"
                    type="tel"
                    autocomplete="tel"
                />
            </label>
            <label class="set-field set-field--wide">
                <span>{{ $t('settings.profile.defaultPoint') }}</span>
                <select v-model="pointId" :disabled="loading || !points.length">
                    <option v-if="!points.length" value="">
                        {{ $t('settings.profile.noPoints') }}
                    </option>
                    <option v-for="p in points" :key="p.id" :value="p.id">
                        {{ p.address ? `${p.name} · ${p.address}` : p.name }}
                    </option>
                </select>
            </label>
        </div>

        <div class="set-block__footer">
            <button class="set-btn set-btn--primary" :disabled="loading || saving" @click="save">
                {{ saving ? $t('settings.profile.saving') : $t('settings.profile.save') }}
            </button>
        </div>
    </div>
</template>

<style scoped src="./SettingsPage.css"></style>

<style scoped>
.set-field__note {
    font-size: 12px;
    font-weight: 500;
    color: #66736e;
}
.set-field input:disabled,
.set-field select:disabled {
    background: #f3f6f5;
    color: #66736e;
}
</style>
