<script setup lang="ts">
import AccountSidebar from '../account/AccountSidebar.vue';
</script>

<template>
    <div class="acts-page">
        <AccountSidebar />

        <section class="acts-page__content">
            <h1 class="acts-page__title">Reconciliation acts</h1>
            <p class="acts-page__note">Not implemented yet.</p>
        </section>
    </div>
</template>

<style scoped>
.acts-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.acts-page__title {
    margin: 0 0 6px;
    font-size: clamp(32px, 3vw, 44px);
    line-height: 1;
    letter-spacing: -0.055em;
}

.acts-page__note {
    margin: 0;
    color: #66736e;
    font-size: 14px;
}

@media (max-width: 960px) {
    .acts-page {
        grid-template-columns: 1fr;
    }
}
</style>
