<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconChevronLeft } from '@tabler/icons-vue';

export interface CategoryNavItem {
    id: string;
    name: string;
    slug: string;
}

export interface CategoryNavPanel {
    current?: CategoryNavItem;
    ancestors: CategoryNavItem[];
    level: CategoryNavItem[];
    levelIsChildren: boolean;
}

const MAX_ROWS = 7;

const props = defineProps<{ panel: CategoryNavPanel }>();

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
        </button>
        <span
            v-if="panel.current && panel.levelIsChildren"
            class="mv-category-nav__item mv-category-nav__item--current"
            aria-current="page"
        >
            {{ panel.current.name }}
        </span>
        <div :class="{ 'mv-category-nav__children': panel.levelIsChildren }">
            <template v-for="item in visibleLevel" :key="item.id">
                <span
                    v-if="!panel.levelIsChildren && item.id === panel.current?.id"
                    class="mv-category-nav__item mv-category-nav__item--current"
                    aria-current="page"
                >
                    {{ item.name }}
                </span>
                <button v-else type="button" class="mv-category-nav__item" @click="emit('navigate', item.slug)">
                    {{ item.name }}
                </button>
            </template>
            <button
                v-if="canExpand"
                type="button"
                class="mv-category-nav__item mv-category-nav__more"
                @click="expanded = !expanded"
            >
                {{ expanded ? 'Less' : 'More' }}
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
    color: #44534d;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
}

.mv-category-nav__item:hover {
    color: #008a64;
    background: #f3f7f5;
}

.mv-category-nav__item--current {
    background: #e2f8ef;
    color: #008a64;
    font-weight: 900;
    cursor: default;
}

.mv-category-nav__back {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mv-category-nav__more {
    color: #008a64;
    font-weight: 700;
}

.mv-category-nav__children {
    display: grid;
    gap: 2px;
    margin-left: 14px;
    padding-left: 8px;
    border-left: 1px solid #edf2ef;
}
</style>
