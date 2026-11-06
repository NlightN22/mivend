<script setup lang="ts">
import SettingsSideNav from '../../components/settings/SettingsSideNav.vue';
</script>

<template>
    <div class="settings-layout">
        <SettingsSideNav class="settings-layout__nav" />
        <div class="settings-layout__content">
            <RouterView />
        </div>
    </div>
</template>

<style scoped>
.settings-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 28px;
    align-items: start;
}

.settings-layout__content {
    min-width: 0;
    max-width: 1200px;
}

@media (max-width: 800px) {
    .settings-layout {
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
    }
}
</style>
