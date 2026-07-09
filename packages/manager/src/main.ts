import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import '@mivend/ui-kit/src/styles/tokens.css';

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

app.mount('#app');
