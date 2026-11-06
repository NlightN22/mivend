<script setup lang="ts">
import { useDemoMode } from '../../composables/useDemoMode';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const search = ref('');

function doSearch() {
    if (search.value.trim()) router.push({ path: '/catalog', query: { q: search.value.trim() } });
}
const { demoAllowed } = useDemoMode();
</script>

<template>
    <div class="nf-page">
        <div class="nf-card">
            <div class="nf-code">{{ $t('errorPages.notFoundCode') }}</div>
            <h1 class="nf-title">{{ $t('errorPages.notFoundTitle') }}</h1>
            <p class="nf-sub">
                {{ $t('errorPages.notFoundText') }}
            </p>

            <div class="nf-search">
                <input
                    v-model="search"
                    class="nf-search__input"
                    :placeholder="$t('errorPages.searchPlaceholder')"
                    type="search"
                    @keydown.enter="doSearch"
                />
                <button class="nf-search__btn" type="button" @click="doSearch">
                    {{ $t('errorPages.find') }}
                </button>
            </div>

            <div class="nf-actions">
                <RouterLink to="/" class="nf-btn nf-btn--primary">{{ $t('nav.home') }}</RouterLink>
                <RouterLink to="/catalog" class="nf-btn">{{
                    $t('errorPages.openCatalog')
                }}</RouterLink>
                <RouterLink to="/orders" class="nf-btn">{{ $t('errorPages.myOrders') }}</RouterLink>
            </div>

            <div v-if="demoAllowed" class="nf-links">
                <a href="#">{{ $t('common.help') }}</a> &middot;
                <a href="#">{{ $t('common.support') }}</a>
            </div>
        </div>
    </div>
</template>

<style scoped>
.nf-page {
    min-height: 70vh;
    display: grid;
    place-items: center;
    padding: 40px 24px;
}

.nf-card {
    max-width: 600px;
    width: 100%;
    text-align: center;
}

.nf-code {
    display: inline-block;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-nav-label);
    background: var(--app-nav-border);
    border-radius: 999px;
    padding: 4px 14px;
    margin-bottom: 20px;
}

.nf-title {
    margin: 0 0 12px;
    font-size: clamp(32px, 4vw, 52px);
    line-height: 1;
    letter-spacing: -0.05em;
    color: var(--app-nav-text-strong);
}

.nf-sub {
    margin: 0 0 24px;
    color: var(--app-nav-label);
    font-size: 15px;
    line-height: 1.5;
}

.nf-search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-bottom: 20px;
}

.nf-search__input {
    min-height: 50px;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 16px;
    padding: 0 16px;
    font: inherit;
    font-size: 15px;
    outline: none;
}
.nf-search__input:focus {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 3px var(--app-green-glow);
}

.nf-search__btn {
    min-height: 50px;
    padding: 0 22px;
    border: none;
    border-radius: 16px;
    background: var(--app-brand-fill);
    color: var(--app-on-accent);
    font: inherit;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
}
.nf-search__btn:hover {
    background: var(--app-brand-fill-hover);
}

.nf-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
}

.nf-btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 14px;
    border: 1px solid var(--app-nav-border-strong);
    background: var(--app-fill-soft);
    color: var(--app-text-deep);
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    transition: 0.14s;
}
.nf-btn:hover {
    background: var(--app-nav-border);
}
.nf-btn--primary {
    background: var(--app-brand-fill);
    border-color: transparent;
    color: var(--app-on-accent);
}
.nf-btn--primary:hover {
    background: var(--app-brand-fill-hover);
}

.nf-links {
    font-size: 13px;
    color: var(--app-nav-label);
}
.nf-links a {
    color: var(--app-nav-accent);
    font-weight: 700;
    text-decoration: none;
}
</style>
