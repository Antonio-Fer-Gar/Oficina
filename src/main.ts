import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { copyFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { AgentInfoSchema, AgentRefSchema, OfficeCommandSchema, type AgentInfo, type AgentRef } from './bridge/protocol.ts';
import type { ConversationRecord } from './conversation.ts';
import { readConversation } from './conversation-view.ts';
import { focusTerminal, type FocusResult } from './terminal.ts';
import { applyBridgeInstall, autoUpdateInstalledBridges, planBridgeInstall } from './install.ts';
import { AppearanceSchema } from './office/appearance.ts';
import { OfficeNamesSchema, RenameSchema, catNameKey, projectNameKey, type OfficeNames } from './office/names.ts';
import { fetchUsage } from './usage.ts';
import { conversationAction } from './resume.ts';
import { checkAppUpdate, downloadInstaller, latestAppUpdate, type DownloadedUpdate } from './app-update.ts';
import { importManagedSkill, listInstalledSkills, listManagedSkills, setManagedSkillEnabled } from './skills.ts';
import { CatalogBrowser, type CatalogSkill } from './catalog-browser.ts';
import { extractCatalogZip } from './catalog-archive.ts';
import { startOmpMaintenance } from './omp-maintenance.ts';
import { z } from 'zod';

const dataDir = process.env.NTER_OFFICE_DATA ?? join(process.env.LOCALAPPDATA ?? homedir(), 'nter-omp-office');
const preferencesFile = join(dataDir, 'preferences.json');
const root = app.getAppPath();
const catalog = new CatalogBrowser(dataDir);
let catalogSkills: CatalogSkill[] = [];
let window: BrowserWindow | null = null;
let worker: ChildProcessWithoutNullStreams | null = null;
let latest: { agents: AgentInfo[]; complete: boolean } = { agents: [], complete: false };
let history: ConversationRecord[] = [];
const resuming = new Set<string>();
let attention = new Set<string>();
let quitting = false;
let updateInstallInProgress = false;
let installingUpdate = false;
let updateSignalSent = false;
let updateExitTimer: ReturnType<typeof setTimeout> | null = null;
let updateHelper: ChildProcessWithoutNullStreams | null = null;
let offeredUpdateVersion: string | null = null;
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();

const PreferencesSchema = z.object({
  muted: z.boolean().catch(false),
  appearance: AppearanceSchema.nullable().catch(null),
  position: z.object({ x: z.number(), y: z.number(), width: z.number().optional(), height: z.number().optional() }).nullable().catch(null),
  alwaysOnTop: z.boolean().catch(false),
  tokenSaving: z.boolean().catch(true),
  ompAutoUpdate: z.boolean().catch(true),
  names: OfficeNamesSchema.catch({ cats: {}, projects: {} }),
});
type Preferences = z.infer<typeof PreferencesSchema>;
function preferences(): Preferences {
  try { return PreferencesSchema.parse(JSON.parse(readFileSync(preferencesFile, 'utf8'))); }
  catch { return { muted: false, appearance: null, position: null, alwaysOnTop: false, tokenSaving: true, ompAutoUpdate: true, names: { cats: {}, projects: {} } }; }
}
function savePreferences(change: Partial<Preferences>) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(preferencesFile, JSON.stringify({ ...preferences(), ...change }));
}
function startWorker() {
  const bun = app.isPackaged ? join(process.resourcesPath, 'bun', 'bun.exe') : process.env.NTER_BUN ?? join(root, '.superpowers', 'tools', 'bun-windows-x64', 'bun.exe');
  // Bun cannot read inside app.asar, so the helper ships unpacked next to it.
  const script = app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'worker.js') : join(root, 'dist', 'worker.js');
  mkdirSync(dataDir, { recursive: true });
  worker = spawn(bun, [script], { cwd: dataDir, env: { ...process.env, NTER_OFFICE_DATA: dataDir }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  worker.stderr.on('data', chunk => console.error('[worker]', String(chunk)));
  createInterface({ input: worker.stdout }).on('line', line => {
    let message: { type: string; id?: string; result?: unknown; error?: string; agents?: unknown[]; complete?: boolean; message?: string };
    try { message = JSON.parse(line); } catch { return; }
    if (message.type === 'reply' && message.id) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error)); else waiter?.resolve(message.result);
    } else if (message.type === 'agents') {
      const agents = (message.agents ?? []).flatMap(agent => { const parsed = AgentInfoSchema.safeParse(agent); return parsed.success ? [parsed.data] : []; });
      latest = { agents, complete: message.complete === true };
      const now = new Set(agents.filter(agent => agent.phase === 'waiting-human').map(agent => key(agent.ref)));
      // Flash the taskbar for new requests only; never restore, show or focus the office.
      if ([...now].some(id => !attention.has(id)) && window && !window.isFocused()) window.flashFrame(true);
      if (!now.size) window?.flashFrame(false);
      attention = now;
      window?.webContents.send('office:agents', latest);
    } else if (message.type === 'warning') console.warn('[worker]', message.message);
  });
  worker.on('exit', code => {
    for (const waiter of pending.values()) waiter.reject(new Error('El ayudante de la oficina se ha detenido'));
    pending.clear();
    worker = null;
    if (!quitting) { console.error('[worker] exited', code); setTimeout(startWorker, 2000); }
  });
}
function ask<T>(request: Record<string, unknown>): Promise<T> {
  if (!worker) return Promise.reject(new Error('El ayudante de la oficina no está en marcha'));
  const id = randomUUID(), done = Promise.withResolvers<T>();
  pending.set(id, done as never);
  worker.stdin.write(JSON.stringify({ ...request, id }) + '\n');
  return done.promise;
}
const key = (ref: AgentRef) => JSON.stringify([ref.instanceId, ref.generation, ref.sessionId, ref.agentId]);
async function focusSession(ref: AgentRef): Promise<FocusResult> {
  let agent = latest.agents.find(item => key(item.ref) === key(ref));
  if (!agent) return { ok: false, code: 'closed', message: 'La sesión ya no está abierta' };
  // A child's decision is answered in the console of the root that owns it.
  for (let hops = 0; agent && !agent.terminal && agent.parent && hops < 64; hops++) {
    const parent: AgentRef = agent.parent;
    agent = latest.agents.find(item => key(item.ref) === key(parent));
  }
  if (!agent?.terminal) return { ok: false, code: 'unavailable', message: 'Esta sesión no se ejecuta en una consola visible' };
  return focusTerminal(agent.terminal);
}
/** Start a real interactive shell; detached omp with ignored stdio has no Windows console. */
async function launchResume(cwd: string, args: string[]): Promise<string | null> {
  const omp = join(process.env.LOCALAPPDATA ?? '', 'omp', 'omp.exe');
  if (!existsSync(omp)) return 'No se encontró omp en este equipo.';
  try { if (!statSync(cwd).isDirectory()) return 'La carpeta de la conversación ya no existe.'; }
  catch { return 'La carpeta de la conversación ya no existe.'; }
  // Values travel in the environment, not PowerShell source; the inner shell remains open if omp exits.
  const inner = "$values = @(ConvertFrom-Json -InputObject $env:NTER_RESUME_ARGS); & $env:NTER_RESUME_OMP @values";
  const encoded = Buffer.from(inner, 'utf16le').toString('base64');
  const outer = `Start-Process -FilePath 'powershell.exe' -WorkingDirectory $env:NTER_RESUME_CWD -ArgumentList @('-NoLogo','-NoExit','-NoProfile','-EncodedCommand','${encoded}') -ErrorAction Stop`;
  const env: NodeJS.ProcessEnv = { ...process.env, NTER_RESUME_ARGS: JSON.stringify(args), NTER_RESUME_OMP: omp, NTER_RESUME_CWD: cwd };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OMP_PROFILE;
  return new Promise(resolve => execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', outer],
    { cwd, env, windowsHide: true, timeout: 15000 },
    error => resolve(error ? 'No se pudo abrir una consola para reanudar la conversación.' : null)));
}
// Leaves the top strip free so the tab headers of maximized consoles stay visible above the office.
const HEADER_GAP = 34, MIN_WINDOW_WIDTH = 600, MIN_WINDOW_HEIGHT = 240;
function fitBounds(requested: Electron.Rectangle, area: Electron.Rectangle): Electron.Rectangle {
  const width = Math.max(MIN_WINDOW_WIDTH, Math.min(requested.width, area.width));
  const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(requested.height, area.height));
  return {
    x: Math.max(area.x, Math.min(requested.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(requested.y, area.y + area.height - height)),
    width, height,
  };
}
function bounds(area: Electron.Rectangle): Electron.Rectangle {
  return fitBounds({ x: area.x, y: area.y + HEADER_GAP, width: area.width, height: Math.round(area.height / 3) }, area);
}
/** Restore saved bounds on a connected display, or move an off-screen window onto the primary display. */
function savedBounds(): Electron.Rectangle | null {
  const position = preferences().position;
  if (!position) return null;
  const displays = screen.getAllDisplays();
  const underTopLeft = displays.find(({ workArea: a }) =>
    position.x >= a.x && position.x < a.x + a.width && position.y >= a.y && position.y < a.y + a.height);
  const defaultArea = underTopLeft?.workArea ?? screen.getPrimaryDisplay().workArea;
  const requested = {
    x: position.x, y: position.y,
    width: position.width ?? defaultArea.width,
    height: position.height ?? Math.round(defaultArea.height / 3),
  };
  const matching = screen.getDisplayMatching(requested);
  const a = matching.workArea;
  const intersects = requested.x < a.x + a.width && requested.x + requested.width > a.x
    && requested.y < a.y + a.height && requested.y + requested.height > a.y;
  const display = underTopLeft ?? (intersects ? matching : screen.getPrimaryDisplay());
  return fitBounds(requested, display.workArea);
}
function place() {
  if (!window || window.isMaximized()) return;
  window.setBounds(savedBounds() ?? bounds(screen.getDisplayMatching(window.getBounds()).workArea));
}
function createWindow() {
  window = new BrowserWindow({
    frame: false, resizable: true, maximizable: true, fullscreenable: false, skipTaskbar: false, show: false,
    minWidth: MIN_WINDOW_WIDTH, minHeight: MIN_WINDOW_HEIGHT,
    alwaysOnTop: preferences().alwaysOnTop, backgroundColor: '#b4b5ad', title: 'Oficina nter', icon: join(root, 'assets', 'nter-logo.png'),
    webPreferences: { preload: join(root, 'dist', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  window.setBounds(savedBounds() ?? bounds(screen.getPrimaryDisplay().workArea));
  const rememberBounds = () => {
    if (!window || window.isMaximized() || window.isMinimized()) return;
    const { x, y, width, height } = window.getBounds();
    savePreferences({ position: { x, y, width, height } });
  };
  window.on('moved', rememberBounds);
  window.on('resize', rememberBounds);
  window.on('maximize', () => window?.webContents.send('office:maximized', true));
  window.on('unmaximize', () => window?.webContents.send('office:maximized', false));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('minimize', () => window?.webContents.send('office:visibility', false));
  window.on('restore', () => window?.webContents.send('office:visibility', true));
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });
  void window.loadFile(join(root, 'dist', 'index.html'));
}
ipcMain.handle('office:snapshot', () => latest);
ipcMain.handle('office:send', (_event, command: unknown) => ask({ type: 'command', command: OfficeCommandSchema.parse(command) }));
ipcMain.handle('office:focus', (_event, ref: unknown) => focusSession(AgentRefSchema.parse(ref)));
ipcMain.handle('office:history', async () => (history = await ask<ConversationRecord[]>({ type: 'history' })));
ipcMain.handle('office:read-conversation', async (_event, profile: unknown, sessionId: unknown) => {
  const live = latest.agents.find(agent => !agent.parent && agent.conversation?.profile === profile && agent.conversation?.sessionId === sessionId);
  const record = live?.conversation ?? history.find(item => item.profile === profile && item.sessionId === sessionId);
  if (!record) throw new Error('Esta conversación ya no está disponible.');
  if (!record.sessionFile) throw new Error('Esta sesión no tiene un archivo de conversación guardado.');
  try { return await readConversation(record.sessionFile); }
  catch (error) {
    if (error instanceof Error && (error.message.startsWith('La conversación') || error.message.startsWith('La rama') || error.message.startsWith('El archivo') || error.message.startsWith('Este formato'))) throw error;
    throw new Error('No se pudo leer el archivo de conversación. Puede que se haya movido o eliminado.');
  }
});
ipcMain.handle('office:open-conversation', async (_event, profile: unknown, sessionId: unknown) => {
  const record = history.find(item => item.profile === profile && item.sessionId === sessionId);
  if (!record) return 'Esta conversación no está en la lista';
  const action = conversationAction(record, latest.agents);
  if (action.kind === 'error') return action.message;
  if (action.kind === 'focus') { const result = await focusSession(action.ref); return result.ok ? null : result.message; }
  if (!latest.complete) return 'No se puede comprobar si la conversación ya está abierta. Inténtalo de nuevo cuando la oficina esté conectada.';
  const resumeKey = JSON.stringify([record.profile, record.sessionId]);
  if (resuming.has(resumeKey)) return 'La conversación ya se está abriendo.';
  resuming.add(resumeKey);
  try {
    const error = await launchResume(action.cwd, action.args);
    if (error) resuming.delete(resumeKey);
    else setTimeout(() => resuming.delete(resumeKey), 15000);
    return error;
  } catch {
    resuming.delete(resumeKey);
    return 'No se pudo abrir una consola para reanudar la conversación.';
  }
});
ipcMain.handle('office:show-folder', async (_event, profile: unknown, sessionId: unknown) => {
  const record = history.find(item => item.profile === profile && item.sessionId === sessionId);
  if (!record) return 'Esta conversación no está en la lista';
  if (!existsSync(record.cwd) || !statSync(record.cwd).isDirectory()) return 'La carpeta ya no existe';
  const error = await shell.openPath(record.cwd);
  return error || null;
});
ipcMain.handle('office:muted', () => preferences().muted);
ipcMain.handle('office:skills-list', () => listManagedSkills(homedir(), dataDir));
ipcMain.handle('office:skills-installed', () => listInstalledSkills(homedir(), dataDir));
ipcMain.handle('office:skills-import', async (_event, input: unknown) => {
  const kind = z.enum(['folder', 'file']).parse(input);
  const options: Electron.OpenDialogOptions = kind === 'folder'
    ? { title: 'Selecciona una carpeta que contenga SKILL.md', properties: ['openDirectory'] }
    : { title: 'Selecciona un archivo SKILL.md', properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md'] }] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  return importManagedSkill(homedir(), dataDir, result.filePaths[0]);
});
ipcMain.handle('office:skills-set-enabled', (_event, id: unknown, enabled: unknown) =>
  setManagedSkillEnabled(homedir(), dataDir, z.string().parse(id), z.boolean().parse(enabled)));
ipcMain.handle('office:catalog-list', async () => {
  const skills = await catalog.list();
  catalogSkills = skills;
  return skills;
});
ipcMain.handle('office:catalog-install', async (_event, inputName: unknown, inputVersion: unknown) => {
  const name = z.string().min(1).max(64).parse(inputName);
  const version = z.string().min(1).max(128).parse(inputVersion);
  if (!catalogSkills.some(skill => skill.name === name && skill.version === version)) {
    throw new Error('La skill ya no está en el catálogo cargado. Actualiza la lista.');
  }
  const archive = await catalog.download(name, version);
  const extracted = await extractCatalogZip(archive.base64);
  try {
    return await importManagedSkill(homedir(), dataDir, extracted.directory, name);
  } finally {
    await extracted.cleanup();
  }
});
const bridgePlan = () => planBridgeInstall({ source: join(root, 'dist', 'extension.js'), profile: 'default' });
ipcMain.handle('office:bridge-status', () => bridgePlan().action);
ipcMain.handle('office:bridge-install', () => {
  const plan = bridgePlan();
  try { applyBridgeInstall(plan); return { ok: true, message: 'Puente instalado en ' + plan.target + '. Las nuevas consolas omp aparecerán solas; reinicia las ya abiertas para verlas.' }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
});
ipcMain.on('office:set-muted', (_event, muted: unknown) => savePreferences({ muted: muted === true }));
ipcMain.handle('office:appearance', () => preferences().appearance);
ipcMain.handle('office:set-appearance', (_event, value: unknown) => { savePreferences({ appearance: AppearanceSchema.parse(value) }); });
ipcMain.handle('office:token-saving', () => preferences().tokenSaving);
ipcMain.handle('office:set-token-saving', (_event, enabled: unknown) => {
  savePreferences({ tokenSaving: z.boolean().parse(enabled) });
});
ipcMain.handle('office:omp-auto-update', () => preferences().ompAutoUpdate);
ipcMain.handle('office:set-omp-auto-update', (_event, enabled: unknown) => {
  savePreferences({ ompAutoUpdate: z.boolean().parse(enabled) });
});
ipcMain.handle('office:names', () => preferences().names);
ipcMain.handle('office:rename', (_event, value: unknown): OfficeNames => {
  const request = RenameSchema.parse(value);
  const exists = latest.agents.some(info => request.kind === 'cat'
    ? !info.parent && catNameKey(info) === request.key
    : projectNameKey(info.cwd) === request.key);
  if (!exists) throw new Error('Este agente o proyecto ya no está en la oficina.');
  const names = preferences().names;
  const entries = request.kind === 'cat' ? names.cats : names.projects;
  if (request.name) entries[request.key] = request.name; else delete entries[request.key];
  savePreferences({ names });
  return names;
});
ipcMain.handle('office:usage', () => fetchUsage());
ipcMain.handle('office:version', () => app.getVersion());
ipcMain.handle('office:check-app-update', async () => {
  const update = await checkAppUpdate(app.getVersion());
  offeredUpdateVersion = update?.version ?? null;
  return update;
});
async function installAppUpdate() {
  if (!app.isPackaged || process.platform !== 'win32' || process.arch !== 'x64') {
    return { ok: false, message: 'La instalación automática solo está disponible en la aplicación instalada para Windows x64.' };
  }
  if (updateInstallInProgress || installingUpdate) return { ok: false, message: 'Ya hay una instalación de actualización en curso.' };
  updateInstallInProgress = true;
  let downloaded: DownloadedUpdate | null = null;
  try {
    const release = await latestAppUpdate(app.getVersion());
    if (!release) return { ok: false, message: 'No hay una release más reciente para instalar.' };
    if (release.version !== offeredUpdateVersion) return { ok: false, message: 'Hay una versión distinta a la del aviso. Cierra y abre la oficina para ver sus novedades antes de actualizar.' };
    downloaded = await downloadInstaller(release);
    updateHelper = await startUpdateHelper(downloaded);
    installingUpdate = true;
    updateSignalSent = false;
    const helperFailedWhileOpen = (code: number | null) => {
      if (quitting || !installingUpdate) return;
      if (updateExitTimer) clearTimeout(updateExitTimer);
      updateExitTimer = null;
      installingUpdate = false;
      updateInstallInProgress = false;
      updateHelper = null;
      try { publishLauncher(process.pid); } catch {}
      const message = consumeUpdateError() ?? `El helper de actualización se detuvo antes de cerrar la oficina (código ${code ?? 'desconocido'}). No se instaló nada; puedes volver a intentarlo.`;
      void rm(downloaded!.directory, { recursive: true, force: true }).catch(() => {});
      void (window
        ? dialog.showMessageBox(window, { type: 'error', title: 'No se pudo iniciar la actualización', message })
        : dialog.showMessageBox({ type: 'error', title: 'No se pudo iniciar la actualización', message }));
    };
    updateHelper.once('exit', helperFailedWhileOpen);
    updateExitTimer = setTimeout(() => {
      updateExitTimer = null;
      if (updateHelper && (updateHelper.exitCode !== null || updateHelper.signalCode !== null)) helperFailedWhileOpen(updateHelper.exitCode);
      else app.quit();
    }, 300);
    return { ok: true, message: 'La actualización se descargó y verificó. La oficina se cerrará para instalarla y se abrirá de nuevo.' };
  } catch (error) {
    try { publishLauncher(process.pid); } catch {}
    if (downloaded) {
      try { await rm(downloaded.directory, { recursive: true, force: true }); } catch {}
    }
    return { ok: false, message: error instanceof Error ? error.message : 'No se pudo preparar la actualización.' };
  } finally {
    if (!installingUpdate) updateInstallInProgress = false;
  }
}
ipcMain.handle('office:install-app-update', () => installAppUpdate());
ipcMain.handle('office:always-on-top', () => preferences().alwaysOnTop);
ipcMain.on('office:set-always-on-top', (_event, value: unknown) => {
  const alwaysOnTop = value === true;
  savePreferences({ alwaysOnTop });
  window?.setAlwaysOnTop(alwaysOnTop, 'floating');
});
ipcMain.on('office:restore-bounds', () => { savePreferences({ position: null }); place(); });
ipcMain.on('office:minimize', () => window?.minimize());
ipcMain.handle('office:maximized', () => window?.isMaximized() ?? false);
ipcMain.on('office:toggle-maximize', () => {
  if (!window) return;
  if (window.isMaximized()) window.unmaximize(); else window.maximize();
});
ipcMain.on('office:close', () => window?.close());

// The helper PID reserves the launcher while Windows replaces the installed files.
function publishLauncher(pid: number | null, installing = false) {
  mkdirSync(dataDir, { recursive: true });
  const args = app.isPackaged ? [] : [root];
  writeFileSync(join(dataDir, 'launcher.json'), JSON.stringify({ command: process.execPath, args, pid, ...(installing ? { installing: true } : {}) }));
}
function updateInstallationActive(): boolean {
  try {
    const launcher: unknown = JSON.parse(readFileSync(join(dataDir, 'launcher.json'), 'utf8'));
    if (typeof launcher !== 'object' || launcher === null || !('installing' in launcher) || launcher.installing !== true
      || !('pid' in launcher) || typeof launcher.pid !== 'number' || !Number.isSafeInteger(launcher.pid) || launcher.pid < 1) return false;
    try { process.kill(launcher.pid, 0); return true; } catch { return false; }
  } catch { return false; }
}
function consumeUpdateError(): string | null {
  const file = join(dataDir, 'app-update-error.json');
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    rmSync(file, { force: true });
    return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string' ? value.message : null;
  } catch {
    try { rmSync(file, { force: true }); } catch {}
    return null;
  }
}
async function startUpdateHelper(downloaded: DownloadedUpdate): Promise<ChildProcessWithoutNullStreams> {
  const executable = app.getPath('exe');
  const helperSource = join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'app-update-helper.js');
  const bunSource = join(process.resourcesPath, 'bun', 'bun.exe');
  if (!existsSync(helperSource) || !existsSync(bunSource)) throw new Error('No se encontró el helper instalado para actualizar la oficina.');
  // NSIS replaces resources/bun/bun.exe too, so the detached helper must run from the temp staging directory.
  const helper = join(downloaded.directory, 'app-update-helper.js');
  const bun = join(downloaded.directory, 'app-update-helper.exe');
  await copyFile(helperSource, helper);
  await copyFile(bunSource, bun);
  const child = spawn(bun, [helper, downloaded.installer, downloaded.digest, dirname(executable), executable, dataDir, String(process.pid)], {
    detached: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    let errors = '';
    const lines = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => fail(new Error('El helper de instalación no respondió a tiempo.')), 15_000);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) reject(error);
      else {
        child.kill();
        child.once('close', () => reject(error));
      }
    };
    lines.on('line', line => {
      if (line !== 'READY' || settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      resolve(child);
    });
    child.stderr.on('data', chunk => { if (errors.length < 2048) errors += String(chunk).slice(0, 2048 - errors.length); });
    child.once('error', error => fail(new Error(`No se pudo iniciar el helper de actualización: ${error.message}`)));
    child.once('exit', code => {
      if (!settled) fail(new Error(`El helper de actualización terminó antes de prepararse${errors ? `: ${errors}` : ` (código ${code}).`}`));
    });
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else if (updateInstallationActive()) app.quit();
else {
  app.setAppUserModelId('es.nter.oficina-omp');
  // Launches requested by an omp session must not restore a window the user minimized.
  app.on('second-instance', (_event, argv) => { if (!argv.includes('--from-omp') && window?.isMinimized()) window.restore(); });
  app.whenReady().then(() => {
    const updateError = consumeUpdateError();
    autoUpdateInstalledBridges(join(root, 'dist', 'extension.js'));
    publishLauncher(process.pid);
    startWorker();
    createWindow();
    startOmpMaintenance(dataDir, () => preferences().ompAutoUpdate);
    if (updateError) window?.once('ready-to-show', () => {
      if (window) void dialog.showMessageBox(window, { type: 'error', title: 'No se pudo instalar la actualización', message: updateError });
    });
    screen.on('display-metrics-changed', place);
    screen.on('display-removed', place);
  });
  app.on('before-quit', () => {
    quitting = true;
    void catalog.close();
    if (updateExitTimer) { clearTimeout(updateExitTimer); updateExitTimer = null; }
    if (installingUpdate) {
      if (!updateSignalSent) { updateSignalSent = true; updateHelper?.stdin.end('INSTALL\n'); }
    } else publishLauncher(null);
    worker?.stdin.end();
  });
  // Closing the office only stops the office: omp sessions keep running untouched.
  app.on('window-all-closed', () => { quitting = true; worker?.stdin.end(); app.quit(); });
}
