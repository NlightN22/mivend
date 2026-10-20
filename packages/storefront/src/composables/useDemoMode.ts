export function useDemoMode(): { demoAllowed: boolean } {
    return { demoAllowed: !import.meta.env.PROD };
}
