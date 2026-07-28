export interface PageContext {
  title?: string;
  url?: string;
  selection?: string;
}

export interface Note extends PageContext {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Deletion {
  id: string;
  deletedAt: string;
}

export interface SyncState {
  notes: Note[];
  deletions: Deletion[];
}

export interface SharedContext {
  title?: string;
  text?: string;
  url?: string;
}
