import type { AuditDrafts } from "../../domain/audit-draft.ts";

export function auditPhotoReferences(drafts: readonly AuditDrafts[]): Set<string> {
  return new Set(drafts.flatMap((draft) => Object.values(draft).flatMap((responses) =>
    Object.values(responses).flatMap((response) => [
      ...(response.photos ?? []),
      ...(response.checks ?? []).flatMap((check) => check.photos ?? []),
    ]))));
}

/** Files belong to the workspace, including drafts that are not currently open. */
export function createAuditPhotoStore(initialDrafts: readonly AuditDrafts[] = []) {
  const files = new Map<string, File>();
  let references = auditPhotoReferences(initialDrafts);
  let generation = 0;

  return {
    get(reference: string) { return files.get(reference); },
    add(file: File): string {
      for (const [reference, existing] of files) if (existing === file) return reference;
      const extension = file.name.match(/\.[^.]+$/)?.[0] ?? "";
      const stem = extension ? file.name.slice(0, -extension.length) : file.name;
      let reference = file.name;
      let suffix = 2;
      // Phone cameras commonly reuse names. Do not replace another item's evidence.
      while (files.has(reference) || references.has(reference)) reference = `${stem} (${suffix++})${extension}`;
      files.set(reference, file);
      return reference;
    },
    retainDrafts(drafts: readonly AuditDrafts[]) {
      references = auditPhotoReferences(drafts);
      for (const reference of files.keys()) if (!references.has(reference)) files.delete(reference);
    },
    discardUnreferenced(selected: readonly string[]) {
      for (const reference of selected) if (!references.has(reference)) files.delete(reference);
    },
    async load(reference: string, loader: (signal: AbortSignal) => Promise<File | null>, signal: AbortSignal): Promise<File | null> {
      if (signal.aborted) return null;
      const existing = files.get(reference);
      if (existing) return existing;
      const startedGeneration = generation;
      try {
        const file = await loader(signal);
        // A fetch may finish after the item, its last reference, or the workspace was closed.
        if (!file || signal.aborted || startedGeneration !== generation || !references.has(reference)) return null;
        files.set(reference, file);
        return file;
      } catch (error) {
        if (signal.aborted) return null;
        throw error;
      }
    },
    clear() {
      generation += 1;
      references.clear();
      files.clear();
    },
  };
}

export type AuditPhotoStore = ReturnType<typeof createAuditPhotoStore>;
