import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentInfo, AgentRef, CommandResult, OfficeCommand } from './bridge/protocol.ts';
import type { ConversationRecord } from './conversation.ts';
import type { FocusResult } from './terminal.ts';
import type { Appearance } from './office/appearance.ts';
import type { OfficeNames, Rename } from './office/names.ts';
import type { UsageResult } from './usage.ts';

export interface OfficeUpdate { agents: AgentInfo[]; complete: boolean }
export interface OfficeApi {
  snapshot(): Promise<OfficeUpdate>;
  subscribe(listener: (update: OfficeUpdate) => void): () => void;
  onBriefing(listener: (id: string) => void): () => void;
  onVisibility(listener: (visible: boolean) => void): () => void;
  bridgeStatus(): Promise<'install' | 'update' | 'unchanged' | 'refuse' | 'remove' | 'absent'>;
  installBridge(): Promise<{ ok: boolean; message: string }>;
  appearance(): Promise<Appearance | null>;
  setAppearance(appearance: Appearance): Promise<void>;
  tokenSaving(): Promise<boolean>;
  setTokenSaving(enabled: boolean): Promise<void>;
  restoreBounds(): void;
  alwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(alwaysOnTop: boolean): void;
  names(): Promise<OfficeNames>;
  rename(request: Rename): Promise<OfficeNames>;
  usage(): Promise<UsageResult>;
  version(): Promise<string>;
  checkAppUpdate(): Promise<{ version: string; currentVersion: string } | null>;
  installAppUpdate(): Promise<{ ok: boolean; message: string }>;
  send(command: OfficeCommand): Promise<CommandResult>;
  focusSession(ref: AgentRef): Promise<FocusResult>;
  history(): Promise<ConversationRecord[]>;
  openConversation(profile: string, sessionId: string): Promise<string | null>;
  showFolder(profile: string, sessionId: string): Promise<string | null>;
  acknowledgeBriefing(id: string): Promise<boolean>;
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
  onBriefing: listener => listen('office:briefing', listener),
  onVisibility: listener => listen('office:visibility', listener),
  bridgeStatus: () => ipcRenderer.invoke('office:bridge-status'),
  installBridge: () => ipcRenderer.invoke('office:bridge-install'),
  appearance: () => ipcRenderer.invoke('office:appearance'),
  setAppearance: appearance => ipcRenderer.invoke('office:set-appearance', appearance),
  tokenSaving: () => ipcRenderer.invoke('office:token-saving'),
  setTokenSaving: enabled => ipcRenderer.invoke('office:set-token-saving', enabled),
  restoreBounds: () => ipcRenderer.send('office:restore-bounds'),
  alwaysOnTop: () => ipcRenderer.invoke('office:always-on-top'),
  setAlwaysOnTop: alwaysOnTop => ipcRenderer.send('office:set-always-on-top', alwaysOnTop),
  names: () => ipcRenderer.invoke('office:names'),
  rename: request => ipcRenderer.invoke('office:rename', request),
  usage: () => ipcRenderer.invoke('office:usage'),
  version: () => ipcRenderer.invoke('office:version'),
  checkAppUpdate: () => ipcRenderer.invoke('office:check-app-update'),
  installAppUpdate: () => ipcRenderer.invoke('office:install-app-update'),
  send: command => ipcRenderer.invoke('office:send', command),
  focusSession: ref => ipcRenderer.invoke('office:focus', ref),
  history: () => ipcRenderer.invoke('office:history'),
  openConversation: (profile, sessionId) => ipcRenderer.invoke('office:open-conversation', profile, sessionId),
  showFolder: (profile, sessionId) => ipcRenderer.invoke('office:show-folder', profile, sessionId),
  acknowledgeBriefing: id => ipcRenderer.invoke('office:briefed', id),
  minimize: () => ipcRenderer.send('office:minimize'),
  close: () => ipcRenderer.send('office:close'),
  muted: () => ipcRenderer.invoke('office:muted'),
  setMuted: muted => ipcRenderer.send('office:set-muted', muted),
};
contextBridge.exposeInMainWorld('office', api);
