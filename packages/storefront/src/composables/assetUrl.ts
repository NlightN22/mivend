export type AssetPreset = 'thumb' | 'small' | 'large';

export function assetUrl(preview: string, preset: AssetPreset): string {
    return `${preview}${preview.includes('?') ? '&' : '?'}preset=${preset}`;
}
