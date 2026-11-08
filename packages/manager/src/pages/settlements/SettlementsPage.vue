<script setup lang="ts">
import SettlementsList from '../../components/settlements/SettlementsList.vue';
</script>

<template>
    <div class="settlements-page">
        <div class="settlements-page__header">
            <div class="settlements-page__breadcrumb">Workspace / Settlements</div>
            <h1 class="settlements-page__title">Settlements</h1>
        </div>

        <SettlementsList />
    </div>
</template>

<style scoped>
.settlements-page__header {
    margin-bottom: 14px;
}

.settlements-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.settlements-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .settlements-page__breadcrumb {
        display: none;
    }

    .settlements-page__title {
        font-size: 22px;
    }
}
</style>
