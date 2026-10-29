export type LogoMark = { kind: 'image'; src: string } | { kind: 'letter'; letter: string };

export function resolveLogoMark(
    name: string,
    iconUrl: string | null | undefined,
    iconFailed = false,
): LogoMark {
    if (iconUrl && !iconFailed) return { kind: 'image', src: iconUrl };
    return { kind: 'letter', letter: name.charAt(0).toUpperCase() };
}
