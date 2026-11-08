<script setup lang="ts">
import MvCopyButton from '../MvCopyButton/MvCopyButton.vue';
import { AUTHENTICATOR_APPS } from '../../data/authenticatorApps';
import { useQrPath } from '../../composables/twoFactor/useQrPath';
import type { TwoFactorEnrolment } from '../../composables/twoFactor/twoFactorTypes';
import type { TwoFactorLabels } from '../../composables/twoFactor/twoFactorLabels';

const props = defineProps<{ enrolment: TwoFactorEnrolment; labels: TwoFactorLabels }>();
const qr = useQrPath(() => props.enrolment.otpauthUri);
const spacedSecret = (secret: string): string => secret.replace(/(.{4})/g, '$1 ').trim();
</script>

<template>
    <div class="mv-tf-enrol">
        <ol class="mv-tf-enrol__steps">
            <li>{{ labels.stepInstall }}</li>
            <li>{{ labels.stepScan }}</li>
            <li>{{ labels.stepCode }}</li>
        </ol>

        <ul class="mv-tf-enrol__apps" :aria-label="labels.appsTitle">
            <li v-for="app in AUTHENTICATOR_APPS" :key="app.name">
                <span class="mv-tf-enrol__app-name">{{ app.name }}</span>
                <a :href="app.playStoreUrl" target="_blank" rel="noopener noreferrer">{{
                    labels.playStore
                }}</a>
                <a :href="app.appStoreUrl" target="_blank" rel="noopener noreferrer">{{
                    labels.appStore
                }}</a>
            </li>
        </ul>

        <svg
            class="mv-tf-enrol__qr"
            role="img"
            :aria-label="labels.qrAlt"
            :viewBox="`0 0 ${qr.size} ${qr.size}`"
            shape-rendering="crispEdges"
        >
            <rect :width="qr.size" :height="qr.size" class="mv-tf-enrol__qr-bg" />
            <path :d="qr.path" class="mv-tf-enrol__qr-fg" />
        </svg>

        <div class="mv-tf-enrol__key">
            <span class="mv-tf-enrol__key-label">{{ labels.manualKey }}</span>
            <div class="mv-tf-enrol__key-row">
                <code>{{ spacedSecret(enrolment.secret) }}</code>
                <MvCopyButton :value="enrolment.secret" :label="labels.copyKey" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.mv-tf-enrol {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    justify-items: center;
}
.mv-tf-enrol__steps {
    margin: 0;
    padding-left: 20px;
    justify-self: stretch;
    font-size: 13px;
    line-height: 1.5;
    color: var(--app-text-body2);
}
.mv-tf-enrol__apps {
    justify-self: stretch;
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
    font-size: 13px;
}
.mv-tf-enrol__apps li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
}
.mv-tf-enrol__app-name {
    flex: 1 1 150px;
    font-weight: 700;
    color: var(--el-text-color-primary);
}
.mv-tf-enrol__apps a {
    color: var(--app-nav-accent);
    font-weight: 700;
    text-decoration: none;
}
.mv-tf-enrol__apps a:hover {
    text-decoration: underline;
}
.mv-tf-enrol__qr {
    width: min(220px, 100%);
    height: auto;
    border-radius: 12px;
}
.mv-tf-enrol__qr-bg {
    fill: var(--app-qr-bg);
}
.mv-tf-enrol__qr-fg {
    fill: var(--app-qr-fg);
}
.mv-tf-enrol__key {
    justify-self: stretch;
    display: grid;
    gap: 6px;
}
.mv-tf-enrol__key-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--app-text-body3);
}
.mv-tf-enrol__key-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.mv-tf-enrol__key-row code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--el-bg-color-page);
    color: var(--el-text-color-primary);
    font-size: 14px;
    letter-spacing: 0.06em;
}
</style>
