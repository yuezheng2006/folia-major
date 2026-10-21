import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

// Exercise the inline recovery without loading any application or runtime-config scripts.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(source => source.includes('app-load-recovery'))!;

describe('startup recovery without application bundles', () => {
    it.each(['folia-player.cyber101.cc', 'folia-web.zeabur.app'])('offers recovery on %s', (host) => {
        const dom = new JSDOM('<div id="app-splash"></div>', { url: `https://${host}`, runScripts: 'outside-only' });
        let recover = () => {};
        dom.window.setTimeout = vi.fn((callback: () => void) => { recover = callback; return 1; }) as any;
        dom.window.eval(script);
        expect(dom.window.document.querySelector('#app-load-recovery')).toBeNull();
        recover();
        expect(dom.window.document.querySelector('button')?.textContent).toContain('Reload');
        expect(dom.window.document.querySelectorAll('a')).toHaveLength(host.startsWith('folia-player') ? 1 : 0);
        dom.window.close();
    });

    it('does not show an error once the application has mounted', () => {
        const dom = new JSDOM('<div id="app-splash" class="is-hiding"></div>', { runScripts: 'outside-only' });
        dom.window.setTimeout = ((callback: () => void) => { callback(); return 1; }) as any;
        dom.window.eval(script);
        expect(dom.window.document.querySelector('#app-load-recovery')).toBeNull();
        dom.window.close();
    });
});
