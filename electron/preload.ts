import { contextBridge, ipcRenderer } from 'electron';
import { CH } from './ipc/channels';

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api = {
  agents: {
    list: () => invoke(CH.agents.list),
    get: (id: number) => invoke(CH.agents.get, id),
    create: (data: unknown) => invoke(CH.agents.create, data),
    update: (id: number, patch: unknown) => invoke(CH.agents.update, id, patch),
    delete: (id: number) => invoke(CH.agents.delete, id),
    reorder: (orderedIds: number[]) => invoke(CH.agents.reorder, orderedIds),
    listTools: (id: number) => invoke(CH.agents.listTools, id),
    setTool: (id: number, name: string, enabled: boolean) => invoke(CH.agents.setTool, id, name, enabled),
    run: (id: number, opportunityId: number | null) => invoke(CH.agents.run, id, opportunityId),
    cancel: (runId: number) => invoke(CH.agents.cancel, runId),
    cancelAll: () => invoke(CH.agents.cancelAll),
    clearRuns: () => invoke(CH.agents.clearRuns),
    openExecutionsDir: () => invoke(CH.agents.openExecutionsDir),
    activeRuns: () => invoke(CH.agents.activeRuns),
    runs: (agentId?: number) => invoke(CH.agents.runs, agentId),
    artifacts: (runId: number) => invoke(CH.agents.artifacts, runId),
    onRunEvent: (cb: (evt: unknown) => void) => {
      const handler = (_: unknown, evt: unknown) => cb(evt);
      ipcRenderer.on(CH.agents.runEvent, handler);
      return () => ipcRenderer.removeListener(CH.agents.runEvent, handler);
    },
    runTeam: (opps: unknown) => invoke(CH.agents.runTeam, opps),
    importTeam: (agents: unknown) => invoke(CH.agents.importTeam, agents),
    onTeamEvent: (cb: (evt: unknown) => void) => {
      const handler = (_: unknown, evt: unknown) => cb(evt);
      ipcRenderer.on(CH.agents.teamEvent, handler);
      return () => ipcRenderer.removeListener(CH.agents.teamEvent, handler);
    },
  },
  opportunities: {
    list: (opts?: { limit?: number }) => invoke(CH.opportunities.list, opts),
    get: (id: number) => invoke(CH.opportunities.get, id),
    listFromFreelas: (opts?: { limit?: number }) => invoke(CH.opportunities.listFromFreelas, opts),
    rescore: () => invoke(CH.opportunities.rescore),
    openJson: (id: number) => invoke(CH.opportunities.openJson, id),
    openFreelasDir: () => invoke(CH.opportunities.openFreelasDir),
  },
  sites: {
    list: () => invoke(CH.sites.list),
    create: (data: unknown) => invoke(CH.sites.create, data),
    update: (id: number, patch: unknown) => invoke(CH.sites.update, id, patch),
    delete: (id: number) => invoke(CH.sites.delete, id),
    scanNow: (slug?: string) => invoke(CH.sites.scanNow, slug),
  },
  scrapper: {
    start: (opts: unknown) => invoke(CH.scrapper.start, opts),
    cancel: () => invoke(CH.scrapper.cancel),
    onEvent: (cb: (evt: unknown) => void) => {
      const handler = (_: unknown, evt: unknown) => cb(evt);
      ipcRenderer.on(CH.scrapper.event, handler);
      return () => ipcRenderer.removeListener(CH.scrapper.event, handler);
    },
  },
  tags: {
    list: () => invoke(CH.tags.list),
    create: (name: string) => invoke(CH.tags.create, name),
    update: (id: number, patch: unknown) => invoke(CH.tags.update, id, patch),
    delete: (id: number) => invoke(CH.tags.delete, id),
  },
  settings: {
    getAll: () => invoke(CH.settings.getAll),
    get: (key: string) => invoke(CH.settings.get, key),
    set: (key: string, value: string) => invoke(CH.settings.set, key, value),
  },
  activity: {
    recent: (limit?: number) => invoke(CH.activity.recent, limit),
    onEvent: (cb: (evt: unknown) => void) => {
      const handler = (_: unknown, evt: unknown) => cb(evt);
      ipcRenderer.on(CH.activity.event, handler);
      return () => ipcRenderer.removeListener(CH.activity.event, handler);
    },
  },
  summary: {
    daily: () => invoke(CH.summary.daily),
  },
  system: {
    window: (action: 'minimize' | 'maximize' | 'close') => invoke(CH.system.window, action),
    ready: () => invoke(CH.system.ready),
  },
  app: {
    getConfig: () => invoke(CH.app.getConfig),
    setConfig: (patch: unknown) => invoke(CH.app.setConfig, patch),
    pickFile: (opts?: unknown) => invoke(CH.app.pickFile, opts),
    pickDirectory: (opts?: unknown) => invoke(CH.app.pickDirectory, opts),
    restart: () => invoke(CH.app.restart),
    showItemInFolder: (fullPath: string) => invoke(CH.app.showItemInFolder, fullPath),
    openPath: (fullPath: string) => invoke(CH.app.openPath, fullPath),
    openWorkspaceDir: (name: string) => invoke(CH.app.openWorkspaceDir, name),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type FreelaApi = typeof api;
