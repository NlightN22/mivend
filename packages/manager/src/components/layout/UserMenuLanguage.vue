<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { setLocale } from '../../i18n';
import { SUPPORTED_LOCALES } from '../../i18n/locales';

const { t, locale } = useI18n();
</script>

<template>
    <div class="user-menu-language" role="group" :aria-label="t('common.language')">
        <span>{{ t('common.language') }}</span>
        <div class="user-menu-language__segments">
            <button
                v-for="code in SUPPORTED_LOCALES"
                :key="code"
                type="button"
                class="user-menu-language__segment"
                role="menuitemradio"
                :aria-checked="locale === code"
                @click.stop="setLocale(code)"
            >
                {{ code.toUpperCase() }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.user-menu-language {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 8px;
    color: var(--app-text-body2);
    font-size: 14px;
}

.user-menu-language__segments {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    background: var(--el-fill-color-light);
}

.user-menu-language__segment {
    min-width: 36px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--app-text-body2);
    font-size: 13px;
    cursor: pointer;
}

.user-menu-language__segment[aria-checked='true'] {
    border-color: var(--el-border-color);
    background: var(--app-surface);
    color: var(--el-text-color-primary);
}

.user-menu-language__segment:hover:not([aria-checked='true']),
.user-menu-language__segment:focus-visible {
    background: var(--app-row-hover);
}
</style>
