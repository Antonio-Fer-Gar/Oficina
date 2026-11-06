import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Frame, type Page } from 'puppeteer-core';

export interface CatalogSkill { name: string; category: string; description: string; version: string }

const CATALOG_URL = 'https://script.google.com/a/macros/nter.es/s/AKfycbw79FApw9mMGP1Zi5hSmtZ06elk6HhaKigUpXTI3L856UDZhYu5jXM4SnMTFC4xKTg/exec';
const LOGIN_TIMEOUT = 3 * 60_000;
const REQUEST_TIMEOUT = 60_000;
const MAX_ZIP_BYTES = 20 * 1024 * 1024;

function chromePath(): string {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA];
  const path = roots.filter((root): root is string => Boolean(root))
    .map(root => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    .find(existsSync);
  if (!path) throw new Error('No se encontró Google Chrome. Instálalo para acceder al catálogo.');
  return path;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class CatalogBrowser {
  private browser?: Browser;
  private page?: Page;
  private starting?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly cancelled = new AbortController();

  constructor(private readonly dataDir: string) {}

  private async start(): Promise<void> {
    if (this.browser?.connected && this.page && !this.page.isClosed()) return;
    if (!this.starting) {
      this.starting = (async () => {
        const executablePath = chromePath();
        let browser: Browser;
        try {
          browser = await puppeteer.launch({ executablePath, headless: false, pipe: true, ignoreDefaultArgs: ['--enable-automation'],
            userDataDir: join(this.dataDir, 'catalog-browser'), timeout: 30_000 });
        } catch {
          throw new Error('No se pudo iniciar Chrome para el catálogo. Cierra cualquier ventana del catálogo e inténtalo de nuevo.');
        }
        if (this.closed) { await browser.close(); throw new Error('El navegador del catálogo está cerrado.'); }
        this.browser = browser;
        const page = (await browser.pages())[0] ?? await browser.newPage();
        this.page = page;
        try {
          await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        } catch {
          const disconnected = !browser.connected || page.isClosed();
          if (browser.connected) await browser.close().catch(() => undefined);
          this.browser = undefined;
          this.page = undefined;
          if (disconnected) throw new Error('Se cerró Chrome durante el acceso al catálogo.');
          throw new Error('No se pudo abrir el catálogo. Comprueba la conexión e inténtalo de nuevo.');
        }
      })().finally(() => { this.starting = undefined; });
    }
    await this.starting;
  }

  private async frame(): Promise<Frame> {
    const deadline = Date.now() + LOGIN_TIMEOUT;
    while (Date.now() < deadline) {
      if (this.closed) throw new Error('El navegador del catálogo está cerrado.');
      if (!this.browser?.connected || !this.page || this.page.isClosed()) {
        throw new Error('Se cerró Chrome. Vuelve a abrir el catálogo.');
      }
      for (const frame of this.page.frames()) {
        if (frame.name() !== 'userHtmlFrame') continue;
        try {
          const url = new URL(frame.url());
          const parent = frame.parentFrame();
          const parentUrl = parent ? new URL(parent.url()) : null;
          if (url.protocol === 'https:' && url.hostname.endsWith('-script.googleusercontent.com') &&
              (url.pathname === '/blank' || url.pathname === '/userCodeAppPanel') &&
              parentUrl?.hostname === url.hostname && parentUrl.pathname === '/userCodeAppPanel' &&
              await frame.evaluate(() => 'google' in window).catch(() => false)) return frame;
        } catch { /* El iframe todavía está navegando. */ }
      }
      const delay = Promise.withResolvers<void>();
      setTimeout(delay.resolve, 500);
      await delay.promise;
    }
    throw new Error('No se pudo acceder al catálogo a tiempo. Completa el inicio de sesión con tu cuenta corporativa y vuelve a intentarlo.');
  }

  private async invoke(method: 'getCatalogView' | 'downloadSkill', args: string[]): Promise<unknown> {
    await this.start();
    const frame = await this.frame();
    try {
      return await frame.evaluate(({ method, args, id, timeout, maxBase64 }) => {
        const { promise, resolve, reject } = Promise.withResolvers<unknown>();
        const eventName = `oficina-catalog-${id}`;
        const timer = setTimeout(() => { document.removeEventListener(eventName, listener); reject(new Error('timeout')); }, timeout);
        const listener = (event: Event) => {
          clearTimeout(timer);
          document.removeEventListener(eventName, listener);
          try {
            const result = JSON.parse((event as CustomEvent<string>).detail) as { ok: boolean; value?: unknown };
            if (result.ok) resolve(result.value); else reject(new Error('bridge'));
          } catch { reject(new Error('bridge')); }
        };
        document.addEventListener(eventName, listener, { once: true });
        const script = document.createElement('script');
        // JSON is encoded as data, never interpolated as JavaScript source.
        const payload = JSON.stringify({ method, args, eventName, maxBase64 });
        script.textContent = `(() => { const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${btoa(unescape(encodeURIComponent(payload)))}'), c => c.charCodeAt(0)))); const send = (ok, value) => document.dispatchEvent(new CustomEvent(p.eventName, {detail: JSON.stringify({ok, value})})); try { const run = window.google.script.run.withSuccessHandler(value => { if (p.method === 'downloadSkill' && (!value || typeof value.base64 !== 'string' || value.base64.length > p.maxBase64)) return send(false); send(true, value); }).withFailureHandler(() => send(false)); run[p.method](...p.args); } catch { send(false); } })();`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        return promise;
      }, { method, args, id: randomUUID(), timeout: REQUEST_TIMEOUT, maxBase64: Math.ceil(MAX_ZIP_BYTES / 3) * 4 });
    } catch {
      if (this.closed || !this.browser?.connected || this.page?.isClosed()) throw new Error('Se cerró Chrome durante la operación del catálogo.');
      throw new Error('No se pudo consultar el catálogo. Comprueba la sesión corporativa y vuelve a intentarlo.');
    }
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      if (this.closed) throw new Error('El navegador del catálogo está cerrado.');
      const { promise, resolve, reject } = Promise.withResolvers<T>();
      const cancel = () => reject(new Error('El navegador del catálogo está cerrado.'));
      this.cancelled.signal.addEventListener('abort', cancel, { once: true });
      operation().then(resolve, reject).finally(() => this.cancelled.signal.removeEventListener('abort', cancel));
      return await promise;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  list(): Promise<CatalogSkill[]> {
    return this.run(async () => {
      const result = await this.invoke('getCatalogView', []);
      if (!record(result) || !Array.isArray(result.skills)) throw new Error('El catálogo devolvió una respuesta inválida.');
      return result.skills.map((skill: unknown) => {
        if (!record(skill) || typeof skill.name !== 'string' || typeof skill.category !== 'string' || typeof skill.latest !== 'string' || !Array.isArray(skill.versions)) {
          throw new Error('El catálogo devolvió una skill inválida.');
        }
        const latest = skill.versions.find((version: unknown) => record(version) && version.version === skill.latest);
        if (!record(latest) || !record(latest.description)) throw new Error('El catálogo devolvió una versión inválida.');
        const description = typeof latest.description.es === 'string' ? latest.description.es : latest.description.en;
        if (typeof description !== 'string') throw new Error('El catálogo devolvió una descripción inválida.');
        return { name: skill.name, category: skill.category, description, version: skill.latest };
      });
    });
  }

  download(name: string, version: string): Promise<{ filename: string; base64: string }> {
    return this.run(async () => {
      if (typeof name !== 'string' || !name.trim() || typeof version !== 'string' || !version.trim()) throw new Error('Selecciona una skill y una versión válidas.');
      const result = await this.invoke('downloadSkill', [name, version]);
      if (!record(result) || typeof result.filename !== 'string' || !result.filename || typeof result.base64 !== 'string' || !result.base64 || result.base64.length > Math.ceil(MAX_ZIP_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.base64) || Buffer.byteLength(result.base64, 'base64') > MAX_ZIP_BYTES) {
        throw new Error('La descarga del catálogo no es válida o supera el límite de 20 MiB.');
      }
      return { filename: result.filename, base64: result.base64 };
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.cancelled.abort();
    if (this.starting) await this.starting.catch(() => undefined);
    if (this.browser?.connected) await this.browser.close();
    this.browser = undefined;
    this.page = undefined;
  }
}
