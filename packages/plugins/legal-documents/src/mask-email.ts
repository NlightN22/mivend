// a***@d***.tld: enough for the owner to recognize the address, not enough to reuse it.
export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');
    if (at < 1) return '***';
    const domain = email.slice(at + 1);
    const dot = domain.lastIndexOf('.');
    const tld = dot > 0 ? domain.slice(dot) : '';
    return `${email[0]}***@${domain[0] ?? ''}***${tld}`;
}
