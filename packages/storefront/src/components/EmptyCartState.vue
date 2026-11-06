<template>
    <div class="empty-cart">
        <div class="empty-cart__card">
            <div class="empty-cart__code">{{ $t('emptyCart.code') }}</div>
            <h2 class="empty-cart__title">{{ $t('emptyCart.title') }}</h2>
            <p class="empty-cart__sub">
                {{ $t('emptyCart.text') }}
            </p>
            <div class="empty-cart__actions">
                <RouterLink to="/catalog" class="empty-cart__btn empty-cart__btn--primary">
                    {{ $t('emptyCart.openCatalog') }}
                </RouterLink>
                <RouterLink to="/favorites" class="empty-cart__btn">{{
                    $t('emptyCart.favorites')
                }}</RouterLink>
                <RouterLink to="/orders" class="empty-cart__btn">{{
                    $t('emptyCart.orders')
                }}</RouterLink>
            </div>
        </div>
    </div>
</template>

<style scoped>
.empty-cart {
    min-height: 50vh;
    display: grid;
    place-items: center;
    padding: 40px 24px;
}

.empty-cart__card {
    max-width: 600px;
    width: 100%;
    text-align: center;
}

.empty-cart__code {
    display: inline-block;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-nav-label);
    background: var(--app-nav-border);
    border-radius: 999px;
    padding: 4px 14px;
    margin-bottom: 20px;
}

.empty-cart__title {
    margin: 0 0 12px;
    font-size: clamp(32px, 4vw, 52px);
    line-height: 1;
    letter-spacing: -0.05em;
    color: var(--app-nav-text-strong);
}

.empty-cart__sub {
    margin: 0 0 24px;
    color: var(--app-nav-label);
    font-size: 15px;
    line-height: 1.5;
}

.empty-cart__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
}

.empty-cart__btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 14px;
    border: 1px solid var(--app-nav-border-strong);
    background: var(--app-fill-soft);
    color: var(--app-text-deep);
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
    transition: 0.14s;
}
.empty-cart__btn:hover {
    background: var(--app-chip-bg);
}
.empty-cart__btn--primary {
    background: var(--app-brand-fill);
    border-color: transparent;
    color: var(--app-on-accent);
}
.empty-cart__btn--primary:hover {
    background: var(--app-brand-fill-hover);
}
</style>
