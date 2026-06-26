<template>
    <div>
        <h1>Login</h1>
        <form @submit.prevent="handleSubmit">
            <input v-model="email" type="email" placeholder="Email" required />
            <input v-model="password" type="password" placeholder="Password" required />
            <button type="submit" :disabled="loading">Sign in</button>
            <p v-if="error">{{ error }}</p>
        </form>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleSubmit() {
    loading.value = true;
    error.value = '';
    try {
        const ok = await authStore.login(email.value, password.value);
        if (ok) {
            const redirect = (route.query.redirect as string) ?? '/';
            await router.push(redirect);
        } else {
            error.value = 'Invalid credentials';
        }
    } finally {
        loading.value = false;
    }
}
</script>
