const DEMO_ONLY_PATHS = ['/reconciliation-acts', '/requests', '/account/employees'];

export function withoutDemoOnly<T extends { to: string }>(links: T[], demoAllowed: boolean): T[] {
    return demoAllowed ? links : links.filter(link => !DEMO_ONLY_PATHS.includes(link.to));
}
