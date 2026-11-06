<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvSelect } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { buildSettingsNav } from './settingsNav';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const groups = computed(() => buildSettingsNav(authStore.hasPermission));
const mobileOptions = computed(() =>
    groups.value.flatMap(group => group.items.map(item => ({ value: item.to, label: item.label }))),
);
// Detail routes such as /settings/roles/:code stay on their section's entry.
const currentSection = computed(
    () => mobileOptions.value.find(option => route.path.startsWith(option.value))?.value ?? '',
);
</script>

<template>
    <nav class="settings-side-nav" aria-label="Settings sections">
        <div class="settings-side-nav__mobile">
            <MvSelect
                :model-value="currentSection"
                :options="mobileOptions"
                @update:model-value="router.push($event)"
            />
        </div>
        <div v-for="group in groups" :key="group.label" class="settings-side-nav__group">
            <div class="settings-side-nav__heading">{{ group.label }}</div>
            <RouterLink v-for="item in group.items" :key="item.to" :to="item.to">
                {{ item.label }}
            </RouterLink>
        </div>
    </nav>
</template>

<style scoped>
.settings-side-nav {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.settings-side-nav__mobile {
    display: none;
}

.settings-side-nav__group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.settings-side-nav__heading {
    padding: 0 12px 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--el-text-color-secondary, #6b7280);
}

.settings-side-nav a {
    display: block;
    padding: 8px 12px;
    border-radius: var(--app-radius-md, 12px);
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
    color: var(--el-text-color-regular, #374151);
}

.settings-side-nav a:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.settings-side-nav a.router-link-active {
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
}

@media (max-width: 800px) {
    .settings-side-nav__mobile {
        display: block;
    }

    .settings-side-nav__group {
        display: none;
    }
}
</style>
