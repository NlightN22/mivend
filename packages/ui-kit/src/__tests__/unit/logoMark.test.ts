import { describe, it, expect } from 'vitest';
import { resolveLogoMark } from '../../components/MvLogo/logoMark';

describe('resolveLogoMark', () => {
    it('uses the image when an icon url is set', () => {
        expect(resolveLogoMark('acme', '/icon.ico')).toEqual({ kind: 'image', src: '/icon.ico' });
    });
    it('falls back to the upper-case first letter without an icon', () => {
        expect(resolveLogoMark('acme', null)).toEqual({ kind: 'letter', letter: 'A' });
        expect(resolveLogoMark('acme', undefined)).toEqual({ kind: 'letter', letter: 'A' });
    });
    it('falls back to the letter when the image failed to load', () => {
        expect(resolveLogoMark('acme', '/icon.ico', true)).toEqual({ kind: 'letter', letter: 'A' });
    });
});
