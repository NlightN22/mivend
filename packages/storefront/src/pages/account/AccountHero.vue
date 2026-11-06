<script setup lang="ts">
import { useCompanyName } from './useCompanyName';

const { companyName: displayName } = useCompanyName();
</script>

<template>
    <div class="account-hero">
        <div class="account-hero__copy">
            <div class="account-hero__kicker">{{ $t('account.hero.kicker') }}</div>
            <h1 class="account-hero__title">
                {{ $t('account.hero.greeting', { name: displayName }) }}
            </h1>
            <p class="account-hero__text">
                {{ $t('account.hero.text') }}
            </p>
        </div>
    </div>
</template>

<style scoped>
.account-hero {
    position: relative;
    overflow: hidden;
    min-height: 170px;
    border-radius: 28px;
    background:
        radial-gradient(
            circle at 88% 20%,
            color-mix(in srgb, var(--app-lime-bg) 78%, transparent),
            transparent 32%
        ),
        linear-gradient(135deg, var(--app-surface) 0%, var(--el-color-primary-light-9) 100%);
    border: 1px solid var(--app-border-glass);
    box-shadow: 0 14px 36px var(--app-ink-08);
    padding: 28px;
    margin-bottom: 22px;
}

.account-hero::after {
    content: '';
    position: absolute;
    right: -84px;
    bottom: -120px;
    width: 280px;
    height: 280px;
    border-radius: 50%;
    background: var(--app-green-glow);
}

.account-hero__copy {
    position: relative;
    z-index: 1;
    max-width: 680px;
}

.account-hero__kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong);
    color: var(--app-nav-accent);
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 850;
    margin-bottom: 14px;
}

.account-hero__title {
    margin: 0 0 10px;
    font-size: clamp(32px, 3.6vw, 48px);
    line-height: 1;
    letter-spacing: -0.055em;
}

.account-hero__text {
    margin: 0;
    color: var(--app-text-body3);
    font-size: 16px;
    line-height: 1.48;
}
</style>
