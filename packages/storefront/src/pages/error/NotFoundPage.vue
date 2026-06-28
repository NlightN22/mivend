<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const search = ref('');

function doSearch() {
    if (search.value.trim()) router.push({ path: '/catalog', query: { q: search.value.trim() } });
}
</script>

<template>
  <div class="nf-page">
    <div class="nf-card">
      <div class="nf-code">404 · Not found</div>
      <h1 class="nf-title">We looked, but didn't find it</h1>
      <p class="nf-sub">
        The page may have been moved, deleted, or the link is incorrect.
        Try searching the catalog or go back to the homepage.
      </p>

      <div class="nf-search">
        <input
          v-model="search"
          class="nf-search__input"
          placeholder="Search catalog…"
          type="search"
          @keydown.enter="doSearch"
        />
        <button class="nf-search__btn" type="button" @click="doSearch">Find</button>
      </div>

      <div class="nf-actions">
        <RouterLink to="/" class="nf-btn nf-btn--primary">Home</RouterLink>
        <RouterLink to="/catalog" class="nf-btn">Open catalog</RouterLink>
        <RouterLink to="/orders" class="nf-btn">My orders</RouterLink>
      </div>

      <div class="nf-links">
        <a href="#">Help</a> · <a href="#">Support</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf-page {
  min-height: 70vh;
  display: grid;
  place-items: center;
  padding: 40px 24px;
}

.nf-card {
  max-width: 600px;
  width: 100%;
  text-align: center;
}

.nf-code {
  display: inline-block;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #66736e;
  background: #edf2ef;
  border-radius: 999px;
  padding: 4px 14px;
  margin-bottom: 20px;
}

.nf-title {
  margin: 0 0 12px;
  font-size: clamp(32px, 4vw, 52px);
  line-height: 1;
  letter-spacing: -0.05em;
  color: #14231f;
}

.nf-sub {
  margin: 0 0 24px;
  color: #66736e;
  font-size: 15px;
  line-height: 1.5;
}

.nf-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-bottom: 20px;
}

.nf-search__input {
  min-height: 50px;
  border: 1px solid #dde7e2;
  border-radius: 16px;
  padding: 0 16px;
  font: inherit;
  font-size: 15px;
  outline: none;
}
.nf-search__input:focus { border-color: #00a878; box-shadow: 0 0 0 3px rgba(0,168,120,0.1); }

.nf-search__btn {
  min-height: 50px;
  padding: 0 22px;
  border: none;
  border-radius: 16px;
  background: #00a878;
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.nf-search__btn:hover { background: #008a64; }

.nf-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 20px;
}

.nf-btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid #dde7e2;
  background: #f3f8f6;
  color: #263732;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: 0.14s;
}
.nf-btn:hover { background: #e8f2ed; }
.nf-btn--primary { background: #00a878; border-color: transparent; color: #fff; }
.nf-btn--primary:hover { background: #008a64; }

.nf-links {
  font-size: 13px;
  color: #66736e;
}
.nf-links a { color: #008a64; font-weight: 700; text-decoration: none; }
</style>
