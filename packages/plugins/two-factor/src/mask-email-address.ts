export function maskEmailAddress(address: string): string {
    const at = address.lastIndexOf('@');
    const local = at > 0 ? address.slice(0, at) : address;
    return `${local.charAt(0)}***${at > 0 ? address.slice(at) : ''}`;
}
