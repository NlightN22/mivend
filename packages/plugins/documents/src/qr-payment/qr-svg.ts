import QRCode from 'qrcode';

export function renderQrSvg(payload: string): string {
    const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
    const size = modules.size;
    const quiet = 2;
    let path = '';
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (modules.get(x, y)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
        }
    }
    const full = size + quiet * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><rect width="${full}" height="${full}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
