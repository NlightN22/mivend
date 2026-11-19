<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';
import { fetchLegalDocument, type LegalDocument } from '../../api/legal';
import { parseLegalMarkdown } from './legalMarkdown';

const route = useRoute();
const { t, locale } = useI18n();
const document = ref<LegalDocument | null>(null);
const failed = ref(false);
const loading = ref(true);

const blocks = computed(() => (document.value ? parseLegalMarkdown(document.value.body) : []));

async function load(): Promise<void> {
    loading.value = true;
    failed.value = false;
    try {
        document.value = await fetchLegalDocument(String(route.params.kind), locale.value);
    } catch {
        document.value = null;
        failed.value = true;
    } finally {
        loading.value = false;
    }
}

watch(() => [route.params.kind, locale.value], load, { immediate: true });
</script>

<template>
    <main class="legal-page">
        <MvNotice v-if="failed" variant="error">{{ t('legal.loadFailed') }}</MvNotice>
        <MvNotice v-else-if="!loading && !document" variant="info">
            {{ t('legal.notPublished') }}
        </MvNotice>
        <article v-else-if="document" class="legal-doc">
            <template v-for="(block, index) in blocks" :key="index">
                <hr v-if="block.type === 'hr'" />
                <ul v-else-if="block.type === 'ul'">
                    <li v-for="(item, i) in block.items" :key="i">
                        <template v-for="(part, j) in item" :key="j">
                            <strong v-if="part.bold">{{ part.text }}</strong>
                            <template v-else>{{ part.text }}</template>
                        </template>
                    </li>
                </ul>
                <component :is="block.type" v-else>
                    <template v-for="(part, j) in block.parts" :key="j">
                        <strong v-if="part.bold">{{ part.text }}</strong>
                        <template v-else>{{ part.text }}</template>
                    </template>
                </component>
            </template>
        </article>
    </main>
</template>

<style scoped>
.legal-page {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 16px 48px;
}

.legal-doc {
    line-height: 1.55;
    color: var(--el-text-color-primary);
}

.legal-doc :deep(h1) {
    margin: 0 0 12px;
    font-size: 32px;
    font-weight: 900;
    letter-spacing: -0.05em;
}

.legal-doc :deep(h2) {
    margin: 24px 0 8px;
    font-size: 20px;
}

.legal-doc :deep(p),
.legal-doc :deep(ul) {
    margin: 0 0 10px;
}

.legal-doc :deep(p) {
    white-space: pre-line;
}

.legal-doc :deep(hr) {
    border: 0;
    border-top: 1px solid var(--el-border-color);
    margin: 24px 0;
}
</style>
