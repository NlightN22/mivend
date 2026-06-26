import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';

import App from './App.vue';
import { router } from './router';
import ru from './i18n/ru';

const i18n = createI18n({
    legacy: false,
    locale: 'ru',
    messages: { ru },
});

const app = createApp(App);

for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component);
}

app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(ElementPlus);

app.mount('#app');
