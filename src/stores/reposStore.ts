import { create } from "zustand";
import * as api from "../lib/tauri";
import type { RepoStatus, ScanAddResult } from "../types";

interface ReposState {
  statuses: RepoStatus[];
  loading: boolean;
  refreshing: boolean;
  refreshingIds: Set<number>;
  lastError: string | null;
  loadAll: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshOne: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  rename: (id: number, newName: string) => Promise<void>;
  reorder: (orderedIds: number[]) => Promise<void>;
  add: (path: string, name?: string) => Promise<void>;
  addMany: (paths: string[]) => Promise<ScanAddResult>;
}

function patchId(list: RepoStatus[], updated: RepoStatus): RepoStatus[] {
  return list.map((s) => (s.id === updated.id ? updated : s));
}

export const useReposStore = create<ReposState>((set, get) => ({
  statuses: [],
  loading: false,
  refreshing: false,
  refreshingIds: new Set<number>(),
  lastError: null,

  async loadAll() {
    set({ loading: true, lastError: null });
    try {
      const statuses = await api.getAllStatuses();
      set({ statuses, loading: false });
    } catch (e) {
      set({ loading: false, lastError: String(e) });
    }
  },

  async refreshAll() {
    set({ refreshing: true, lastError: null });
    try {
      const statuses = await api.getAllStatuses();
      set({ statuses, refreshing: false });
    } catch (e) {
      set({ refreshing: false, lastError: String(e) });
    }
  },

  async refreshOne(id: number) {
    const ids = new Set(get().refreshingIds);
    ids.add(id);
    set({ refreshingIds: ids });
    try {
      const s = await api.getRepoStatus(id);
      set((state) => ({
        statuses: patchId(state.statuses, s),
      }));
    } catch (e) {
      set({ lastError: String(e) });
    } finally {
      const ids2 = new Set(get().refreshingIds);
      ids2.delete(id);
      set({ refreshingIds: ids2 });
    }
  },

  async remove(id: number) {
    await api.removeRepo(id);
    set((state) => ({
      statuses: state.statuses.filter((s) => s.id !== id),
    }));
  },

  async rename(id: number, newName: string) {
    await api.renameRepo(id, newName);
    set((state) => ({
      statuses: state.statuses.map((s) =>
        s.id === id ? { ...s, name: newName } : s,
      ),
    }));
  },

  async reorder(orderedIds: number[]) {
    set((state) => {
      const byId = new Map(state.statuses.map((s) => [s.id, s]));
      return {
        statuses: orderedIds
          .map((id) => byId.get(id))
          .filter((s): s is RepoStatus => !!s),
      };
    });
    await api.reorderRepos(orderedIds);
  },

  async add(path: string, name?: string) {
    await api.addRepo(path, name);
    await get().refreshAll();
  },

  async addMany(paths: string[]) {
    const result = await api.addScannedRepos(paths);
    await get().refreshAll();
    return result;
  },
}));
