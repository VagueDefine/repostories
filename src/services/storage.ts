import yaml from 'js-yaml';
import { Bookmark, StorageConfig, UserProfile, AppData } from '../types';

const STORAGE_KEY = 'zenspace_data_md';
const CONFIG_KEY = 'zenspace_config';

export const defaultProfile: UserProfile = {
  name: '您的名字',
  bio: '保持好奇，继续探索。',
  avatar: 'https://picsum.photos/seed/avatar/200/200',
  links: [
    { label: 'GitHub', url: 'https://github.com', icon: 'github' },
    { label: 'Twitter', url: 'https://twitter.com', icon: 'twitter' }
  ],
  content: '# 关于我\n\n这里是您的个人介绍。您可以使用 Markdown 编写。'
};

export const defaultBookmarks: Bookmark[] = [
  {
    id: '1',
    title: 'Google',
    url: 'https://google.com',
    category: '搜索',
    description: '全球最大的搜索引擎',
    createdAt: Date.now(),
    type: 'link'
  }
];

// 将数据序列化为 Markdown + YAML 格式
export const stringifyToMd = (data: AppData): string => {
  const frontmatter = yaml.dump({
    bookmarks: data.bookmarks,
    profile: data.profile
  });
  return `---\n${frontmatter}---\n\n${data.content}`;
};

// 从 Markdown + YAML 格式解析数据
export const parseFromMd = (md: string): AppData => {
  try {
    const parts = md.split('---');
    if (parts.length >= 3) {
      const frontmatter = yaml.load(parts[1]) as any;
      const content = parts.slice(2).join('---').trim();
      return {
        bookmarks: frontmatter.bookmarks || [],
        profile: frontmatter.profile || defaultProfile,
        content: content || ''
      };
    }
  } catch (e) {
    console.error('Failed to parse MD storage:', e);
  }
  return { bookmarks: defaultBookmarks, profile: defaultProfile, content: '' };
};

export const loadConfig = (): StorageConfig => {
  const data = localStorage.getItem(CONFIG_KEY);
  const config = data ? JSON.parse(data) : { type: 'local', aiModels: [] };
  
  // Migration for old config format
  if (config.ai && !config.aiModels) {
    config.aiModels = [{ ...config.ai, id: 'default' }];
    config.activeAIId = 'default';
    delete config.ai;
  }
  
  if (!config.aiModels) config.aiModels = [];
  
  return config;
};

export const saveConfig = (config: StorageConfig) => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

export const syncToGithub = async (config: StorageConfig, data: AppData) => {
  if (config.type !== 'github' || !config.github) return;
  
  const { token, repo, branch, path } = config.github;
  const mdContent = stringifyToMd(data);
  
  try {
    const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `token ${token}` }
    });
    
    let sha;
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }
    
    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Sync to Markdown via ZenSpace',
        content: btoa(unescape(encodeURIComponent(mdContent))),
        branch,
        sha
      })
    });
    
    return putRes.ok;
  } catch (error) {
    console.error('GitHub sync failed:', error);
    return false;
  }
};

export const fetchGithubTree = async (config: StorageConfig, path: string = '') => {
  if (config.type !== 'github' || !config.github) return [];
  
  const { token, repo, branch } = config.github;
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
  
  try {
    const res = await fetch(url, {
      headers: { Authorization: `token ${token}` }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.error('Fetch GitHub tree failed:', error);
  }
  return [];
};

export const fetchGithubFile = async (config: StorageConfig, path: string) => {
  if (config.type !== 'github' || !config.github) return null;
  
  const { token, repo, branch } = config.github;
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
  
  try {
    const res = await fetch(url, {
      headers: { Authorization: `token ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      return {
        content: decodeURIComponent(escape(atob(data.content))),
        sha: data.sha
      };
    }
  } catch (error) {
    console.error('Fetch GitHub file failed:', error);
  }
  return null;
};
