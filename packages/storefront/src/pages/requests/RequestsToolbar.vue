<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUICK_TOPICS, REQUEST_STATUS_COUNTS, REQUEST_TOPICS } from './requestsDemo';

const props = defineProps<{
    search: string;
    sort: string;
    activeStatus: string;
    activeTopic: string;
}>();

const emit = defineEmits<{
    'update:search': [value: string];
    'update:sort': [value: string];
    'update:activeStatus': [value: string];
    'update:activeTopic': [value: string];
    quickSubmit: [topic: string, message: string];
}>();

const { t } = useI18n();

const showQuick = ref(false);
const quickTopic = ref('order');
const quickMessage = ref('');

function handleQuickSubmit() {
    if (!quickMessage.value.trim()) return;
    emit('quickSubmit', quickTopic.value, quickMessage.value.trim());
    quickMessage.value = '';
    showQuick.value = false;
}
</script>

<template>
    <div class="req-toolbar">
        <div class="req-toolbar__line">
            <input
                class="req-toolbar__search"
                :value="props.search"
                :placeholder="t('requests.toolbar.searchPlaceholder')"
                @input="emit('update:search', ($event.target as HTMLInputElement).value)"
            />
            <select
                class="req-toolbar__select"
                :value="props.sort"
                @change="emit('update:sort', ($event.target as HTMLSelectElement).value)"
            >
                <option value="newest">{{ t('requests.toolbar.newest') }}</option>
                <option value="oldest">{{ t('requests.toolbar.oldest') }}</option>
                <option value="status">{{ t('requests.toolbar.byStatus') }}</option>
            </select>
            <button
                class="req-toolbar__quick-btn"
                :class="{ 'req-toolbar__quick-btn--active': showQuick }"
                type="button"
                @click="showQuick = !showQuick"
            >
                {{ t('requests.toolbar.quick') }}
            </button>
        </div>

        <div class="req-toolbar__chips">
            <button
                v-for="s in REQUEST_STATUS_COUNTS"
                :key="s.key"
                class="req-toolbar__chip"
                :class="{ 'req-toolbar__chip--active': props.activeStatus === s.key }"
                @click="emit('update:activeStatus', s.key)"
            >
                {{ t(`requests.status.${s.key}`)
                }}<span class="req-toolbar__count">{{ s.count }}</span>
            </button>
        </div>

        <div class="req-toolbar__chips">
            <button
                v-for="topic in REQUEST_TOPICS"
                :key="topic"
                class="req-toolbar__chip req-toolbar__chip--sm"
                :class="{ 'req-toolbar__chip--active': props.activeTopic === topic }"
                @click="emit('update:activeTopic', props.activeTopic === topic ? '' : topic)"
            >
                {{ t(`requests.topics.${topic}`) }}
            </button>
        </div>

        <div v-if="showQuick" class="req-toolbar__quick">
            <div class="req-toolbar__quick-fields">
                <div class="req-toolbar__field">
                    <label>{{ t('requests.toolbar.topic') }}</label>
                    <select v-model="quickTopic">
                        <option v-for="topic in QUICK_TOPICS" :key="topic" :value="topic">
                            {{ t(`requests.quickTopics.${topic}`) }}
                        </option>
                    </select>
                </div>
                <div class="req-toolbar__field req-toolbar__field--grow">
                    <label>{{ t('requests.toolbar.message') }}</label>
                    <textarea
                        v-model="quickMessage"
                        :placeholder="t('requests.toolbar.messagePlaceholder')"
                        rows="2"
                    ></textarea>
                </div>
                <button class="req-toolbar__submit" @click="handleQuickSubmit">
                    {{ t('requests.toolbar.send') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped src="./RequestsToolbar.css"></style>
