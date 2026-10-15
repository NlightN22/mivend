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
    layers,
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
app.use(ElementPlus, { zIndex: layers.popover });
// PrimeVue is scoped to the Orders desktop table only; element-plus/ui-kit remain the rest of the app.
// mivendPrimeVuePreset maps it to tokens.css so it doesn't show PrimeVue's default Aura theme.
app.use(PrimeVue, {
    theme: { preset: mivendPrimeVuePreset, options: { darkModeSelector: '.mv-never-dark' } },
    zIndex: {
        modal: layers.modal,
        overlay: layers.popover,
        menu: layers.popover,
        tooltip: layers.popover,
    },
});

app.mount('#app');
