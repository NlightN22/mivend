<script setup lang="ts">
export interface CategoryNavItem {
    id: string;
    name: string;
    slug: string;
}

export interface CategoryNavPanel {
    current?: CategoryNavItem;
    siblings: CategoryNavItem[];
    children: CategoryNavItem[];
}

defineProps<{ panel: CategoryNavPanel }>();

const emit = defineEmits<{ navigate: [slug: string] }>();
</script>

<template>
    <nav class="mv-category-nav" aria-label="Categories">
        <template v-if="panel.current">
            <template v-for="item in panel.siblings" :key="item.id">
                <span
                    v-if="item.id === panel.current.id"
                    class="mv-category-nav__item mv-category-nav__item--current"
                    aria-current="page"
                >
                    {{ item.name }}
                </span>
                <button v-else type="button" class="mv-category-nav__item" @click="emit('navigate', item.slug)">
                    {{ item.name }}
                </button>
                <div v-if="item.id === panel.current.id && panel.children.length > 0" class="mv-category-nav__children">
                    <button
                        v-for="child in panel.children"
                        :key="child.id"
                        type="button"
                        class="mv-category-nav__item"
                        @click="emit('navigate', child.slug)"
                    >
                        {{ child.name }}
                    </button>
                </div>
            </template>
        </template>
        <template v-else>
            <button
                v-for="child in panel.children"
                :key="child.id"
                type="button"
                class="mv-category-nav__item"
                @click="emit('navigate', child.slug)"
            >
                {{ child.name }}
            </button>
        </template>
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

.mv-category-nav__children {
    display: grid;
    gap: 2px;
    margin-left: 14px;
    padding-left: 8px;
    border-left: 1px solid #edf2ef;
}
</style>
