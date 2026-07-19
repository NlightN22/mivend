import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import PrimeVue from 'primevue/config';
import 'element-plus/dist/index.css';
import '@mivend/ui-kit/src/styles/tokens.css';
import { mivendPrimeVuePreset } from './primevue-preset';

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
} from '@mivend/ui-kit';

import App from './App.vue';
import { router } from './router';

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
app.use(router);
app.use(ElementPlus);
// PrimeVue only powers the new PrimeVue-based Orders desktop table for now (see
// OrdersDataTable.vue) — not yet a project-wide replacement of element-plus/ui-kit. Themed via
// mivendPrimeVuePreset so it matches the portal's own design tokens (tokens.css) instead of
// PrimeVue's default Aura look.
app.use(PrimeVue, {
    theme: { preset: mivendPrimeVuePreset, options: { darkModeSelector: '.mv-never-dark' } },
});

app.mount('#app');
