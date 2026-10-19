<script setup lang="ts">
import { toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUrlState } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import RequestsToolbar from './RequestsToolbar.vue';
import RequestCard from './RequestCard.vue';
import { DEMO_REQUESTS } from './requestsDemo';

const { t } = useI18n();

const { filters: urlState } = useUrlState(
    { status: 'all', topic: '', q: '', sort: 'newest' },
    { typingKeys: ['q'] },
);
const activeStatus = toRef(urlState, 'status');
const activeTopic = toRef(urlState, 'topic');
const search = toRef(urlState, 'q');
const sort = toRef(urlState, 'sort');

function handleQuickSubmit(_topic: string, _message: string) {
    // placeholder: send quick request
}
</script>

<template>
    <div class="requests-page">
        <AccountSidebar />

        <section class="requests-page__content">
            <div class="requests-page__head">
                <div>
                    <h1 class="requests-page__title">{{ t('requests.title') }}</h1>
                    <p class="requests-page__subtitle">{{ t('requests.subtitle') }}</p>
                </div>
                <div class="requests-page__head-actions">
                    <button class="requests-page__btn">{{ t('requests.templates') }}</button>
                    <button class="requests-page__btn requests-page__btn--primary">
                        {{ t('requests.create') }}
                    </button>
                </div>
            </div>

            <div class="requests-page__main">
                <RequestsToolbar
                    :search="search"
                    :sort="sort"
                    :active-status="activeStatus"
                    :active-topic="activeTopic"
                    @update:search="search = $event"
                    @update:sort="sort = $event"
                    @update:active-status="activeStatus = $event"
                    @update:active-topic="activeTopic = $event"
                    @quick-submit="handleQuickSubmit"
                />

                <div class="requests-page__notice">
                    <span>ℹ️</span>
                    <div>
                        <strong>{{ t('requests.notice.title') }}</strong>
                        {{ t('requests.notice.text') }}
                    </div>
                </div>

                <div class="requests-page__list">
                    <RequestCard v-for="req in DEMO_REQUESTS" :key="req.id" :request="req" />
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.requests-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.requests-page__content {
    min-width: 0;
}

.requests-page__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
}

.requests-page__title {
    margin: 0 0 6px;
    font-size: clamp(34px, 3.6vw, 50px);
    line-height: 0.98;
    letter-spacing: -0.055em;
}

.requests-page__subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
    line-height: 1.45;
}

.requests-page__head-actions {
    display: flex;
    gap: 9px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.requests-page__btn {
    border: 0;
    min-height: 40px;
    border-radius: 12px;
    padding: 0 14px;
    background: #f3f8f6;
    color: #263732;
    font: inherit;
    font-weight: 950;
    cursor: pointer;
    white-space: nowrap;
}

.requests-page__btn--primary {
    background: #00a878;
    color: #fff;
}

.requests-page__main {
    display: grid;
    gap: 16px;
    min-width: 0;
}

.requests-page__notice {
    padding: 15px 16px;
    border-radius: 18px;
    border: 1px solid rgba(255, 138, 0, 0.22);
    background: #fff5df;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    color: #573a14;
    font-size: 14px;
    line-height: 1.42;
}

.requests-page__notice strong {
    display: block;
    color: #33210a;
    margin-bottom: 2px;
}

.requests-page__list {
    display: grid;
    gap: 12px;
}

@media (max-width: 960px) {
    .requests-page {
        grid-template-columns: 1fr;
        padding-left: 16px;
        padding-right: 16px;
    }
    .requests-page__head {
        display: grid;
    }
    .requests-page__head-actions {
        justify-content: flex-start;
    }
}
</style>
