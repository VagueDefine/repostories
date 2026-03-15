export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: string;
  description?: string;
  createdAt: number;
  type: 'link' | 'folder';
  parentId?: string;
}

export interface AIModelConfig {
  id: string;
  name: string;
  apiKey: string;
  apiUrl?: string;
  model?: string;
}

export interface StorageConfig {
  type: 'local' | 'github';
  github?: {
    token: string;
    repo: string;
    branch: string;
    path: string; // e.g., "zenspace.md"
    syncProfile?: boolean;
    syncBookmarks?: boolean;
    notebookRepo?: string;
    notebookBranch?: string;
  };
  aiModels: AIModelConfig[];
  activeAIId?: string;
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'image';
  content?: string; // For files
  url?: string; // For images
  children?: FileNode[]; // For folders
  path: string; // GitHub path
  sha?: string; // GitHub SHA for updates
}

export interface UserProfile {
  name: string;
  bio: string;
  avatar?: string;
  links: { label: string; url: string; icon: string }[];
  content: string; // Markdown body
  files?: FileNode[];
}

export interface AppData {
  bookmarks: Bookmark[];
  profile: Omit<UserProfile, 'content'>;
  content: string;
}

export type TabType = 'bookmarks' | 'profile' | 'settings' | 'ai';
