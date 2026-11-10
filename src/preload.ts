import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentInfo, AgentRef, CommandResult, OfficeCommand } from './bridge/protocol.ts';
import type { ConversationRecord } from './conversation.ts';
import type { ConversationMessage } from './conversation-view.ts';
import type { FocusResult } from './terminal.ts';
import type { Appearance } from './office/appearance.ts';
import type { OfficeNames, Rename } from './office/names.ts';
import type { UsageResult } from './usage.ts';
import type { InstalledSkill, ManagedSkill } from './skills.ts';
import type { CatalogSkill } from './catalog-browser.ts';

export interface OfficeUpdate { agents: AgentInfo[]; complete: boolean }
export interface OfficeApi {
  snapshot(): Promise<OfficeUpdate>;
  subscribe(listener: (update: OfficeUpdate) => void): () => void;
  onVisibility(listener: (visible: boolean) => void): () => void;
  bridgeStatus(): Promise<'install' | 'update' | 'unchanged' | 'refuse' | 'remove' | 'absent'>;
  installBridge(): Promise<{ ok: boolean; message: string }>;
  appearance(): Promise<Appearance | null>;
  setAppearance(appearance: Appearance): Promise<void>;
  tokenSaving(): Promise<boolean>;
  setTokenSaving(enabled: boolean): Promise<void>;
  ompAutoUpdate(): Promise<boolean>;
  setOmpAutoUpdate(enabled: boolean): Promise<void>;
  restoreBounds(): void;
  alwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(alwaysOnTop: boolean): void;
  names(): Promise<OfficeNames>;
  rename(request: Rename): Promise<OfficeNames>;
  usage(): Promise<UsageResult>;
  skillsList(): Promise<ManagedSkill[]>;
  skillsInstalled(): Promise<InstalledSkill[]>;
  skillsImport(kind: 'folder' | 'file'): Promise<ManagedSkill[] | null>;
  skillsSetEnabled(id: string, enabled: boolean): Promise<ManagedSkill[]>;
  listCatalogSkills(): Promise<CatalogSkill[]>;
  installCatalogSkill(name: string, version: string): Promise<ManagedSkill[]>;
  version(): Promise<string>;
  checkAppUpdate(): Promise<{ version: string; currentVersion: string; notes: string } | null>;
  installAppUpdate(): Promise<{ ok: boolean; message: string }>;
  send(command: OfficeCommand): Promise<CommandResult>;
  focusSession(ref: AgentRef): Promise<FocusResult>;
  history(): Promise<ConversationRecord[]>;
  readConversation(profile: string, sessionId: string): Promise<ConversationMessage[]>;
  openConversation(profile: string, sessionId: string): Promise<string | null>;
  maximized(): Promise<boolean>;
  onMaximized(listener: (maximized: boolean) => void): () => void;
  toggleMaximize(): void;
  showFolder(profile: string, sessionId: string): Promise<string | null>;
  minimize(): void;
  close(): void;
  muted(): Promise<boolean>;
  setMuted(muted: boolean): void;
}
function listen<T>(channel: string, listener: (value: T) => void) {
  const wrapped = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => { ipcRenderer.off(channel, wrapped); };
}
const api: OfficeApi = {
  snapshot: () => ipcRenderer.invoke('office:snapshot'),
  subscribe: listener => listen('office:agents', listener),
  onVisibility: listener => listen('office:visibility', listener),
  bridgeStatus: () => ipcRenderer.invoke('office:bridge-status'),
  installBridge: () => ipcRenderer.invoke('office:bridge-install'),
  appearance: () => ipcRenderer.invoke('office:appearance'),
  setAppearance: appearance => ipcRenderer.invoke('office:set-appearance', appearance),
  tokenSaving: () => ipcRenderer.invoke('office:token-saving'),
  setTokenSaving: enabled => ipcRenderer.invoke('office:set-token-saving', enabled),
  ompAutoUpdate: () => ipcRenderer.invoke('office:omp-auto-update'),
  setOmpAutoUpdate: enabled => ipcRenderer.invoke('office:set-omp-auto-update', enabled),
  restoreBounds: () => ipcRenderer.send('office:restore-bounds'),
  alwaysOnTop: () => ipcRenderer.invoke('office:always-on-top'),
  setAlwaysOnTop: alwaysOnTop => ipcRenderer.send('office:set-always-on-top', alwaysOnTop),
  names: () => ipcRenderer.invoke('office:names'),
  rename: request => ipcRenderer.invoke('office:rename', request),
  usage: () => ipcRenderer.invoke('office:usage'),
  skillsList: () => ipcRenderer.invoke('office:skills-list'),
  skillsInstalled: () => ipcRenderer.invoke('office:skills-installed'),
  skillsImport: kind => ipcRenderer.invoke('office:skills-import', kind),
  skillsSetEnabled: (id, enabled) => ipcRenderer.invoke('office:skills-set-enabled', id, enabled),
  listCatalogSkills: () => ipcRenderer.invoke('office:catalog-list'),
  installCatalogSkill: (name, version) => ipcRenderer.invoke('office:catalog-install', name, version),
  version: () => ipcRenderer.invoke('office:version'),
  checkAppUpdate: () => ipcRenderer.invoke('office:check-app-update'),
  installAppUpdate: () => ipcRenderer.invoke('office:install-app-update'),
  send: command => ipcRenderer.invoke('office:send', command),
  focusSession: ref => ipcRenderer.invoke('office:focus', ref),
  history: () => ipcRenderer.invoke('office:history'),
  readConversation: (profile, sessionId) => ipcRenderer.invoke('office:read-conversation', profile, sessionId),
  openConversation: (profile, sessionId) => ipcRenderer.invoke('office:open-conversation', profile, sessionId),
  maximized: () => ipcRenderer.invoke('office:maximized'),
  onMaximized: listener => listen('office:maximized', listener),
  toggleMaximize: () => ipcRenderer.send('office:toggle-maximize'),
  showFolder: (profile, sessionId) => ipcRenderer.invoke('office:show-folder', profile, sessionId),
  minimize: () => ipcRenderer.send('office:minimize'),
  close: () => ipcRenderer.send('office:close'),
  muted: () => ipcRenderer.invoke('office:muted'),
  setMuted: muted => ipcRenderer.send('office:set-muted', muted),
};
contextBridge.exposeInMainWorld('office', api);
