<script setup lang="ts">
import { ref } from 'vue';

export interface CollectionNode {
    id: string;
    name: string;
    slug: string;
    children: CollectionNode[];
}

const props = defineProps<{
    collections: CollectionNode[];
    open: boolean;
}>();

const emit = defineEmits<{
    close: [];
    navigate: [slug: string];
}>();

const activeId = ref<string | null>(null);

function activeCollection(): CollectionNode | null {
    const id = activeId.value ?? props.collections[0]?.id ?? null;
    return props.collections.find(c => c.id === id) ?? props.collections[0] ?? null;
}

function setActive(id: string): void {
    activeId.value = id;
}

function navigate(slug: string): void {
    emit('navigate', slug);
    emit('close');
}
</script>

<template>
    <Transition name="catalog-drop">
        <div v-if="open" class="mv-catalog-dropdown" @click.self="emit('close')">
            <div class="mv-catalog-dropdown__inner">
                <aside class="mv-catalog-dropdown__left">
                    <p class="mv-catalog-dropdown__label">Catalogue</p>
                    <nav class="mv-catalog-dropdown__cat-list">
                        <button
                            v-for="col in collections"
                            :key="col.id"
                            :class="['mv-catalog-dropdown__cat', { 'mv-catalog-dropdown__cat--active': (activeId ?? collections[0]?.id) === col.id }]"
                            type="button"
                            @mouseenter="setActive(col.id)"
                            @click="navigate(col.slug)"
                        >
                            {{ col.name }}
                        </button>
                    </nav>
                </aside>

                <div v-if="activeCollection()" class="mv-catalog-dropdown__content">
                    <div class="mv-catalog-dropdown__head">
                        <h2 class="mv-catalog-dropdown__title">{{ activeCollection()!.name }}</h2>
                    </div>
                    <div v-if="activeCollection()!.children.length > 0" class="mv-catalog-dropdown__grid">
                        <button
                            v-for="child in activeCollection()!.children"
                            :key="child.id"
                            class="mv-catalog-dropdown__sub"
                            type="button"
                            @click="navigate(child.slug)"
                        >
                            {{ child.name }}
                        </button>
                    </div>
                    <div v-else class="mv-catalog-dropdown__empty">
                        <button class="mv-catalog-dropdown__sub mv-catalog-dropdown__sub--browse" type="button" @click="navigate(activeCollection()!.slug)">
                            Browse all →
                        </button>
                    </div>
                </div>

                <div v-else class="mv-catalog-dropdown__content mv-catalog-dropdown__content--empty">
                    No categories available
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.mv-catalog-dropdown {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    background: rgba(255, 255, 255, 0.98);
    border-top: 1px solid #edf2ef;
    border-bottom: 1px solid #dde7e2;
    box-shadow: 0 26px 60px rgba(20, 35, 31, 0.16);
    backdrop-filter: blur(18px);
    z-index: 10;
}

.mv-catalog-dropdown__inner {
    max-width: 1440px;
    margin: 0 auto;
    padding: 18px 28px 26px;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 24px;
    min-height: 480px;
}

.mv-catalog-dropdown__left {
    border-right: 1px solid #edf2ef;
    padding-right: 16px;
}

.mv-catalog-dropdown__label {
    margin: 0 0 12px;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #66736e;
}

.mv-catalog-dropdown__cat-list {
    display: grid;
    gap: 3px;
}

.mv-catalog-dropdown__cat {
    min-height: 42px;
    padding: 0 14px;
    border-radius: 12px;
    border: none;
    background: transparent;
    text-align: left;
    font-size: 15px;
    font-weight: 700;
    color: #26342f;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, color 0.12s;
}

.mv-catalog-dropdown__cat:hover {
    background: #f3f7f5;
}

.mv-catalog-dropdown__cat--active {
    background: #e2f8ef;
    color: #008a64;
    font-weight: 900;
}

.mv-catalog-dropdown__content {
    padding: 0 4px;
}

.mv-catalog-dropdown__content--empty {
    display: flex;
    align-items: center;
    color: #a8b8b2;
    font-size: 15px;
}

.mv-catalog-dropdown__head {
    margin-bottom: 20px;
}

.mv-catalog-dropdown__title {
    margin: 0;
    font-size: 28px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: #14231f;
}

.mv-catalog-dropdown__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 10px 32px;
}

.mv-catalog-dropdown__sub {
    min-height: 36px;
    padding: 0 10px;
    border: none;
    background: transparent;
    text-align: left;
    font-size: 14px;
    color: #62736c;
    cursor: pointer;
    font-family: inherit;
    border-radius: 8px;
    transition: color 0.12s, background 0.12s;
}

.mv-catalog-dropdown__sub:hover {
    color: #008a64;
    background: #f3f7f5;
}

.mv-catalog-dropdown__sub--browse {
    font-weight: 850;
    color: #00a878;
}

.catalog-drop-enter-active,
.catalog-drop-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}

.catalog-drop-enter-from,
.catalog-drop-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}

@media (max-width: 960px) {
    .mv-catalog-dropdown__inner {
        grid-template-columns: 1fr;
        min-height: 0;
    }

    .mv-catalog-dropdown__left {
        border-right: none;
        padding-right: 0;
    }

    .mv-catalog-dropdown__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
