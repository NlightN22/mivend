// PrimeVue's dark selector cannot be an attribute selector (it nests :root inside it), so mirror data-theme as a class.
export function syncPrimeDarkClass(): void {
    const root = document.documentElement;
    const apply = (): void =>
        root.classList.toggle('p-dark', root.getAttribute('data-theme') === 'dark');
    new MutationObserver(apply).observe(root, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });
    apply();
}
