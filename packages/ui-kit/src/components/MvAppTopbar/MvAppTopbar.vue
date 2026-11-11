<script setup lang="ts">
// Backoffice topbar shell (logo + global search placeholder + user pill with its menu) — shared
// across every manager portal page. On phone: logo mark, search button, actions and a round avatar; search takes over the row.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import { IconSearch } from '@tabler/icons-vue';
import MvAppTopbarPhoneSearch from './MvAppTopbarPhoneSearch.vue';
import MvAppTopbarSearchBox from './MvAppTopbarSearchBox.vue';
import MvLogo from '../MvLogo/MvLogo.vue';
import MvPopover from '../MvPopover/MvPopover.vue';

withDefaults(
    defineProps<{
        userName: string;
        userRoleLabel?: string | null;
        userInitials: string;
        brandTo?: string;
        searchPlaceholder?: string;
        phoneSearchPlaceholder?: string;
        searchActiveId?: string;
    }>(),
    {
        brandTo: '/',
        searchPlaceholder: 'Search…',
        phoneSearchPlaceholder: 'Search…',
        userRoleLabel: null,
        searchActiveId: undefined,
    },
);

const query = defineModel<string>('query', { default: '' });
const emit = defineEmits<{ search: [value: string]; 'search-keydown': [event: KeyboardEvent] }>();

const menuOpen = ref(false);
const searching = ref(false);
const isPhone = useIsMobileViewport(800);
watch(isPhone, phone => {
    if (!phone) searching.value = false;
});
const searchButton = ref<HTMLButtonElement | null>(null);
const searchBox = ref<InstanceType<typeof MvAppTopbarSearchBox> | null>(null);

async function closeSearch(): Promise<void> {
    searching.value = false;
    query.value = '';
    await nextTick();
    searchButton.value?.focus();
}

function onShortcut(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (isPhone.value) searching.value = true;
    else searchBox.value?.focus();
}

onMounted(() => document.addEventListener('keydown', onShortcut));
onBeforeUnmount(() => document.removeEventListener('keydown', onShortcut));
defineExpose({ closeSearch });
</script>

<template>
    <header :class="['mv-app-topbar', { 'mv-app-topbar--searching': searching }]">
        <RouterLink class="mv-app-topbar__brand" :to="brandTo">
            <MvLogo size="sm" />
        </RouterLink>

        <MvAppTopbarSearchBox
            ref="searchBox"
            v-model:query="query"
            class="mv-app-topbar__search"
            :placeholder="searchPlaceholder"
            :active-id="searchActiveId"
            @keydown="emit('search-keydown', $event)"
        >
            <template #default="{ close }">
                <slot name="search-panel" :close="close" :desktop="true" />
            </template>
        </MvAppTopbarSearchBox>

        <MvAppTopbarPhoneSearch
            v-if="searching"
            class="mv-app-topbar__phone-search"
            v-model:query="query"
            :placeholder="phoneSearchPlaceholder"
            @search="emit('search', $event)"
            @close="closeSearch"
        />

        <div v-if="searching && $slots['search-panel']" class="mv-app-topbar__panel">
            <slot name="search-panel" :close="closeSearch" :desktop="false" />
        </div>

        <div class="mv-app-topbar__actions">
            <button
                ref="searchButton"
                type="button"
                class="mv-app-topbar__search-button"
                aria-label="Search"
                title="Search"
                @click="searching = true"
            >
                <IconSearch :size="20" aria-hidden="true" />
            </button>
            <slot name="actions" />
        </div>

        <MvPopover
            v-model:open="menuOpen"
            :width="isPhone ? 340 : 260"
            :sheet="false"
            glass
            placement="bottom-end"
        >
            <template #trigger>
                <button
                    class="mv-app-topbar__user"
                    type="button"
                    aria-haspopup="menu"
                    :aria-label="userName"
                    :aria-expanded="menuOpen"
                >
                    <span class="mv-app-topbar__avatar">{{ userInitials }}</span>
                    <span class="mv-app-topbar__user-text">
                        {{ userName
                        }}<template v-if="userRoleLabel"> · {{ userRoleLabel }}</template>
                    </span>
                </button>
            </template>
            <div @click="menuOpen = false">
                <slot name="user-menu" />
            </div>
        </MvPopover>
    </header>
</template>

<style scoped>
.mv-app-topbar {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 64px;
    padding: 0 24px;
    background: var(--app-surface);
    border-bottom: 1px solid var(--el-border-color);
    position: sticky;
    top: 0;
    z-index: var(--mv-z-sticky);
}

.mv-app-topbar__brand {
    display: flex;
    align-items: center;
    color: inherit;
    text-decoration: none;
}

.mv-app-topbar__actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
}

.mv-app-topbar__user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: none;
    color: inherit;
    cursor: pointer;
    font-size: 13px;
}

.mv-app-topbar__user:hover {
    background: var(--el-fill-color-light);
}

.mv-app-topbar__avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--el-color-primary);
    color: var(--app-on-accent);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
}

.mv-app-topbar__search-button {
    display: none;
    width: 40px;
    height: 40px;
    border: 1px solid var(--el-border-color);
    border-radius: 50%;
    place-items: center;
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    cursor: pointer;
}

.mv-app-topbar .mv-app-topbar__phone-search,
.mv-app-topbar__panel {
    display: none;
}

@media (max-width: 800px) {
    .mv-app-topbar {
        height: auto;
        min-height: 58px;
        padding: 8px 12px;
        gap: 8px;
        justify-content: space-between;
    }

    .mv-app-topbar__brand :deep(.mv-logo__name),
    .mv-app-topbar__search {
        display: none;
    }

    .mv-app-topbar__actions {
        gap: 8px;
    }

    .mv-app-topbar__user {
        padding: 0;
        border: 0;
        border-radius: 50%;
    }

    .mv-app-topbar__search-button {
        display: grid;
        place-items: center;
    }

    .mv-app-topbar .mv-app-topbar__phone-search {
        display: flex;
    }

    .mv-app-topbar__panel {
        display: block;
        position: fixed;
        inset: 58px 0 0;
        overflow-y: auto;
        background: var(--el-bg-color-page);
    }

    .mv-app-topbar--searching {
        z-index: var(--mv-z-floating);
    }

    .mv-app-topbar--searching .mv-app-topbar__brand,
    .mv-app-topbar--searching .mv-app-topbar__actions,
    .mv-app-topbar--searching .mv-app-topbar__user {
        display: none;
    }

    .mv-app-topbar__avatar {
        width: 40px;
        height: 40px;
        font-size: 14px;
    }

    .mv-app-topbar__user-text {
        display: none;
    }
}
</style>
