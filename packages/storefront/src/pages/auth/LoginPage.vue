<template>
    <div class="login-page">
        <el-card class="login-card">
            <h2 class="login-card__title">mivend</h2>
            <el-form :model="form" @submit.prevent="handleSubmit">
                <el-form-item>
                    <el-input
                        v-model="form.email"
                        type="email"
                        :placeholder="t('auth.email')"
                        required
                    />
                </el-form-item>
                <el-form-item>
                    <el-input
                        v-model="form.password"
                        type="password"
                        :placeholder="t('auth.password')"
                        show-password
                        required
                    />
                </el-form-item>
                <el-alert v-if="error" type="error" :title="t('auth.loginError')" show-icon />
                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
                        {{ t('auth.login') }}
                    </el-button>
                </el-form-item>
            </el-form>
        </el-card>
    </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();

const form = reactive({ email: '', password: '' });
const loading = ref(false);
const error = ref(false);

async function handleSubmit() {
    loading.value = true;
    error.value = false;
    try {
        const ok = await authStore.login(form.email, form.password);
        if (ok) {
            await router.push((route.query.redirect as string) ?? '/');
        } else {
            error.value = true;
        }
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--el-bg-color-page);
}
.login-card {
    width: 360px;
}
.login-card__title {
    text-align: center;
    margin-bottom: 24px;
    font-size: 22px;
}
</style>
