import { computed, createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import PrimeVue from 'primevue/config';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import '@mivend/ui-kit/src/styles/tokens.css';
import { mivendPrimeVuePreset } from './primevue-preset';
import { syncPrimeDarkClass } from './utils/sync-prime-dark-class';

import {
    MvButton,
    MvStatusTag,
    MvAmountDisplay,
    MvSearchInput,
    MvTable,
    MvPageHeader,
    MvNotice,
    MvLogo,
    MvCard,
    MvBreadcrumbs,
    layers,
    reloadOnStaleChunk,
    initTheme,
    UI_LOCALE_KEY,
    UI_LABELS_KEY,
} from '@mivend/ui-kit';

import App from './App.vue';
import { i18n, initLocale } from './i18n';
import { activeTag } from './i18n/format';
import { router } from './router';

reloadOnStaleChunk();
initTheme();
syncPrimeDarkClass();

const app = createApp(App);

for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component);
}

app.component('MvButton', MvButton);
app.component('MvStatusTag', MvStatusTag);
app.component('MvAmountDisplay', MvAmountDisplay);
app.component('MvSearchInput', MvSearchInput);
app.component('MvTable', MvTable);
app.component('MvPageHeader', MvPageHeader);
app.component('MvNotice', MvNotice);
app.component('MvLogo', MvLogo);
app.component('MvCard', MvCard);
app.component('MvBreadcrumbs', MvBreadcrumbs);

app.use(createPinia());
app.use(i18n);
app.provide(
    UI_LOCALE_KEY,
    computed(() => activeTag()),
);
app.provide(
    UI_LABELS_KEY,
    computed(
        () =>
            (i18n.global.messages.value[i18n.global.locale.value]?.ui ?? {}) as Record<
                string,
                string
            >,
    ),
);
app.use(router);
app.use(ElementPlus, { zIndex: layers.popover });
// PrimeVue is scoped to the Orders desktop table only; element-plus/ui-kit remain the rest of the app.
// mivendPrimeVuePreset maps it to tokens.css so it doesn't show PrimeVue's default Aura theme.
app.use(PrimeVue, {
    theme: {
        preset: mivendPrimeVuePreset,
        options: { darkModeSelector: '.p-dark' },
    },
    zIndex: {
        modal: layers.modal,
        overlay: layers.popover,
        menu: layers.popover,
        tooltip: layers.popover,
    },
});

initLocale().finally(() => app.mount('#app'));
