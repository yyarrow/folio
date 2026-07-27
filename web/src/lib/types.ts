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

export interface SharedContext {
  title?: string;
  text?: string;
  url?: string;
}
