import { computed, type ComputedRef } from 'vue';
import { encode } from 'uqr';

const QUIET_ZONE = 2;

export function useQrPath(text: () => string): ComputedRef<{ size: number; path: string }> {
    return computed(() => {
        const { data, size } = encode(text(), { ecc: 'M', border: 0 });
        let path = '';
        data.forEach((row, y) =>
            row.forEach((dark, x) => {
                if (dark) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
            }),
        );
        return { size: size + QUIET_ZONE * 2, path };
    });
}
