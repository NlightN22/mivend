<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconChevronLeft } from '@tabler/icons-vue';
import MvStatusTag from '../MvStatusTag/MvStatusTag.vue';

export interface CategoryNavItem {
    id: string;
    name: string;
    slug: string;
    isHidden?: boolean;
    count?: number;
}

export interface CategoryNavPanel {
    current?: CategoryNavItem;
    ancestors: CategoryNavItem[];
    level: CategoryNavItem[];
    levelIsChildren: boolean;
}

const MAX_ROWS = 7;

const props = withDefaults(
    defineProps<{
        panel: CategoryNavPanel;
        moreLabel?: string;
        lessLabel?: string;
        hiddenLabel?: string;
    }>(),
    { moreLabel: 'More', lessLabel: 'Less', hiddenLabel: 'Hidden' },
);

const emit = defineEmits<{ navigate: [slug: string] }>();

const expanded = ref(false);
watch(() => props.panel, () => (expanded.value = false));

const canExpand = computed(() => props.panel.level.length > MAX_ROWS);
const visibleLevel = computed(() => {
    const { level, current, levelIsChildren } = props.panel;
    if (expanded.value) return level;
    const keepId = levelIsChildren ? undefined : current?.id;
    return level.filter((item, i) => i < MAX_ROWS || item.id === keepId);
});
</script>

<template>
    <nav class="mv-category-nav" aria-label="Categories">
        <button
            v-for="item in panel.ancestors"
            :key="item.id"
            type="button"
            class="mv-category-nav__item mv-category-nav__back"
            @click="emit('navigate', item.slug)"
        >
            <IconChevronLeft :size="14" />
            {{ item.name }}
            <MvStatusTag v-if="item.isHidden" variant="unavailable" class="mv-category-nav__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
        </button>
        <span
            v-if="panel.current && panel.levelIsChildren"
            class="mv-category-nav__item mv-category-nav__item--current"
            aria-current="page"
        >
            {{ panel.current.name }}
            <MvStatusTag v-if="panel.current.isHidden" variant="unavailable" class="mv-category-nav__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
        </span>
        <div :class="{ 'mv-category-nav__children': panel.levelIsChildren }">
            <template v-for="item in visibleLevel" :key="item.id">
                <span
                    v-if="!panel.levelIsChildren && item.id === panel.current?.id"
                    class="mv-category-nav__item mv-category-nav__item--current"
                    aria-current="page"
                >
                    {{ item.name }}
                    <MvStatusTag v-if="item.isHidden" variant="unavailable" class="mv-category-nav__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
                </span>
                <button v-else type="button" class="mv-category-nav__item" @click="emit('navigate', item.slug)">
                    {{ item.name }}
                    <span v-if="item.count !== undefined" class="mv-category-nav__count">{{ item.count }}</span>
                    <MvStatusTag v-if="item.isHidden" variant="unavailable" class="mv-category-nav__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
                </button>
            </template>
            <button
                v-if="canExpand"
                type="button"
                class="mv-category-nav__item mv-category-nav__more"
                @click="expanded = !expanded"
            >
                {{ expanded ? lessLabel : moreLabel }}
            </button>
        </div>
    </nav>
</template>

<style scoped>
.mv-category-nav {
    display: grid;
    gap: 2px;
}

.mv-category-nav__item {
    display: block;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    text-align: left;
    font-size: 13px;
    font-family: inherit;
    color: var(--app-nav-text);
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
}

.mv-category-nav__item:hover {
    color: var(--app-nav-accent);
    background: var(--app-nav-hover-bg);
}

.mv-category-nav__item--current {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    font-weight: 900;
    cursor: default;
}

.mv-category-nav__back {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mv-category-nav__count {
    margin-left: 6px;
    color: #8a9a94;
    font-size: 12px;
}

.mv-category-nav__hidden {
    margin-left: 6px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 16px;
    font-weight: 600;
}

.mv-category-nav__more {
    color: var(--app-nav-accent);
    font-weight: 700;
}

.mv-category-nav__children {
    display: grid;
    gap: 2px;
    margin-left: 14px;
    padding-left: 8px;
    border-left: 1px solid var(--app-nav-border);
}
</style>
