import yaml from "js-yaml";
import { Bookmark, StorageConfig, UserProfile, AppData } from "../types";

const CONFIG_KEY = "zenspace_config";

// 请求缓存
const requestCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 30 * 1000; // 30秒缓存

// 待处理的请求（用于去重）
const pendingRequests = new Map<string, Promise<any>>();

export const defaultProfile: UserProfile = {
  name: "您的名字",
  bio: "保持好奇，继续探索。",
  avatar: "https://picsum.photos/seed/avatar/200/200",
  links: [
    { name: "GitHub", url: "https://github.com", icon: "github" },
    { name: "Twitter", url: "https://twitter.com", icon: "twitter" }
  ],
  content: "# 关于我\n\n这里是您的个人介绍。您可以使用 Markdown 编写。"
};

export const defaultBookmarks: Bookmark[] = [
  {
    id: "1",
    title: "Google",
    url: "https://google.com",
    category: "搜索",
    description: "全球最大的搜索引擎",
    createdAt: Date.now(),
    type: "link"
  }
];

// 统一的请求缓存函数
async function cachedRequest<T>(cacheKey: string, requestFn: () => Promise<T>, duration = CACHE_DURATION): Promise<T> {
  // 检查是否有进行中的相同请求
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // 检查缓存
  const cached = requestCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < duration) {
    return cached.data as T;
  }

  // 发起新请求
  const requestPromise = requestFn().finally(() => {
    pendingRequests.delete(cacheKey);
  });

  pendingRequests.set(cacheKey, requestPromise);

  try {
    const data = await requestPromise;
    requestCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    requestCache.delete(cacheKey);
    throw error;
  }
}

// 清理缓存
export function clearStorageCache(): void {
  requestCache.clear();
  pendingRequests.clear();
}

// 构建GitHub请求头
function buildGithubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

// 将数据序列化为 Markdown + JSON 格式
export const stringifyToMd = (data: AppData, config?: StorageConfig): string => {
  const syncProfile = config?.github?.syncProfile !== false;
  const syncBookmarks = config?.github?.syncBookmarks !== false;

  let md = "";

  if (syncProfile) {
    md += (data.content || "").trim() + "\n\n";
  }

  if (syncBookmarks) {
    md += "<!-- ZENSPACE_BOOKMARKS_START -->\n";
    md += "## 收藏夹\n\n";

    data.bookmarks.forEach((b) => {
      if (b.type === "link") {
        md += `- [${b.title}](${b.url || "#"}) ${b.description ? `- ${b.description}` : ""} \`${b.category}\`\n`;
      } else {
        md += `- 📁 **${b.title}** \`${b.category}\`\n`;
      }
    });
    md += "\n<!-- ZENSPACE_BOOKMARKS_END -->\n\n";
  }

  // Hidden JSON data for reliable parsing
  const hiddenData = {
    bookmarks: syncBookmarks ? data.bookmarks : undefined,
    profile: syncProfile ? data.profile : undefined,
    chatSessions: data.chatSessions,
    activeChatId: data.activeChatId
  };

  md += "<!-- ZENSPACE_DATA_START\n";
  md += JSON.stringify(hiddenData, null, 2);
  md += "\nZENSPACE_DATA_END -->\n";

  return md;
};

// 从 Markdown + JSON/YAML 格式解析数据
export const parseFromMd = (md: string): AppData => {
  try {
    // Try parsing new JSON format first
    const jsonMatch = md.match(/<!-- ZENSPACE_DATA_START\n([\s\S]*?)\nZENSPACE_DATA_END -->/);
    if (jsonMatch) {
      const parsedData = JSON.parse(jsonMatch[1]);

      let content = "";
      const bookmarksStartIdx = md.indexOf("<!-- ZENSPACE_BOOKMARKS_START -->");
      const dataStartIdx = md.indexOf("<!-- ZENSPACE_DATA_START");

      if (bookmarksStartIdx !== -1) {
        content = md.substring(0, bookmarksStartIdx).trim();
      } else if (dataStartIdx !== -1) {
        content = md.substring(0, dataStartIdx).trim();
      } else {
        content = md.trim();
      }

      return {
        bookmarks: parsedData.bookmarks || defaultBookmarks,
        profile: parsedData.profile || defaultProfile,
        content: content || "",
        chatSessions: parsedData.chatSessions,
        activeChatId: parsedData.activeChatId
      };
    }

    // Fallback to old YAML format
    const parts = md.split("---");
    if (parts.length >= 3) {
      const frontmatter = yaml.load(parts[1]) as any;
      const content = parts.slice(2).join("---").trim();
      return {
        bookmarks: frontmatter.bookmarks || defaultBookmarks,
        profile: frontmatter.profile || defaultProfile,
        content: content || ""
      };
    }
  } catch (e) {
    console.error("Failed to parse MD storage:", e);
  }
  return { bookmarks: defaultBookmarks, profile: defaultProfile, content: "" };
};

// 加载配置
export const loadConfig = (): StorageConfig => {
  const data = localStorage.getItem(CONFIG_KEY);
  const config = data
    ? JSON.parse(data)
    : {
        type: "local",
        theme: "light",
        aiModels: [],
        aiPermissions: { profile: true, files: true, bookmarks: true, listRepos: true }
      };

  // 设置默认权限
  config.aiPermissions = {
    profile: true,
    files: true,
    bookmarks: true,
    listRepos: true,
    ...config.aiPermissions
  };

  // Migration for old config format
  if (config.ai && !config.aiModels) {
    config.aiModels = [{ ...config.ai, id: "default" }];
    config.activeAIId = "default";
    delete config.ai;
  }

  if (!config.aiModels) config.aiModels = [];

  // Initialize GitHub sync defaults
  if (config.github) {
    config.github.syncProfile = config.github.syncProfile !== false;
    config.github.syncBookmarks = config.github.syncBookmarks !== false;
  }

  return config;
};

// 保存配置
export const saveConfig = (config: StorageConfig) => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

// 同步到GitHub
export const syncToGithub = async (config: StorageConfig, data: AppData, isNotebook = false): Promise<boolean> => {
  if (config.type !== "github" || !config.github?.token || !config.github?.repo) return false;

  const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch, path: defaultPath } = config.github;
  const repo = isNotebook ? notebookRepo || defaultRepo : defaultRepo;
  const branch = (isNotebook ? notebookBranch || defaultBranch : defaultBranch) || "main";
  const path = defaultPath || "zenspace.md";

  const cleanToken = token.trim();
  const encodedPath = path.split("/").map((p) => encodeURIComponent(p)).join("/");

  const cacheKey = `sync_${repo}_${branch}_${path}`;

  try {
    return await cachedRequest(
      cacheKey,
      async () => {
        const getUrl = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
        const headers = buildGithubHeaders(cleanToken);

        // 获取现有文件SHA
        const getRes = await fetch(getUrl, { headers });
        let sha;
        if (getRes.ok) {
          const fileData = await getRes.json();
          sha = fileData.sha;
        }

        const mdContent = stringifyToMd(data, config);

        // 更新文件
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: "Sync to Markdown via WangLI",
            content: btoa(unescape(encodeURIComponent(mdContent))),
            branch,
            sha
          })
        });

        return putRes.ok;
      },
      0 // 同步操作不缓存
    );
  } catch (error) {
    console.error("GitHub sync failed:", error);
    return false;
  }
};

// 获取GitHub目录树
export const fetchGithubTree = async (
  config: StorageConfig,
  path = "",
  isNotebook = false,
  repoOverride?: string,
  branchOverride?: string
): Promise<any[]> => {
  if (config.type !== "github" || !config.github?.token || !config.github?.repo) return [];

  const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
  const repo = repoOverride || (isNotebook ? notebookRepo || defaultRepo : defaultRepo);
  const branch = branchOverride || (isNotebook ? notebookBranch || defaultBranch : defaultBranch) || "main";

  const cleanToken = token.trim();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const encodedPath = cleanPath ? cleanPath.split("/").map((p) => encodeURIComponent(p)).join("/") : "";
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const cacheKey = `tree_${repo}_${branch}_${path}`;

  return cachedRequest(
    cacheKey,
    async () => {
      const res = await fetch(url, { headers: buildGithubHeaders(cleanToken) });

      if (res.ok) {
        return await res.json();
      }

      const errorData = await res.json().catch(() => ({}));
      if (res.status === 404) {
        return [];
      }

      throw new Error(errorData.message || `GitHub API Error: ${res.status}`);
    },
    CACHE_DURATION
  );
};

// 获取GitHub文件内容
export const fetchGithubFile = async (
  config: StorageConfig,
  path: string,
  isNotebook = false,
  repoOverride?: string,
  branchOverride?: string
): Promise<{ content: string; sha: string } | null> => {
  if (config.type !== "github" || !config.github?.token || !config.github?.repo) return null;

  const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
  const repo = repoOverride || (isNotebook ? notebookRepo || defaultRepo : defaultRepo);
  const branch = branchOverride || (isNotebook ? notebookBranch || defaultBranch : defaultBranch) || "main";

  const cleanToken = token.trim();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const encodedPath = cleanPath.split("/").map((p) => encodeURIComponent(p)).join("/");
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const cacheKey = `file_${repo}_${branch}_${path}`;

  return cachedRequest(
    cacheKey,
    async () => {
      const res = await fetch(url, { headers: buildGithubHeaders(cleanToken) });

      if (res.ok) {
        const data = await res.json();
        return {
          content: decodeURIComponent(escape(atob(data.content))),
          sha: data.sha
        };
      }

      const errorData = await res.json().catch(() => ({}));
      if (res.status === 404) {
        return null;
      }

      throw new Error(errorData.message || `GitHub API Error: ${res.status}`);
    },
    CACHE_DURATION
  );
};

// 写入GitHub文件
export const writeGithubFile = async (
  config: StorageConfig,
  path: string,
  content: string,
  message = "Update via AI",
  isNotebook = false,
  repoOverride?: string,
  branchOverride?: string
): Promise<boolean> => {
  if (config.type !== "github" || !config.github?.token || !config.github?.repo) return false;

  const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
  const repo = repoOverride || (isNotebook ? notebookRepo || defaultRepo : defaultRepo);
  const branch = branchOverride || (isNotebook ? notebookBranch || defaultBranch : defaultBranch) || "main";

  const cleanToken = token.trim();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const encodedPath = cleanPath.split("/").map((p) => encodeURIComponent(p)).join("/");
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;

  try {
    const headers = buildGithubHeaders(cleanToken);

    // 获取当前SHA（如果文件存在）
    const getRes = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
    let sha;
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }

    const putRes = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        content: btoa(unescape(encodeURIComponent(content))),
        branch,
        sha
      })
    });

    if (!putRes.ok) {
      const errorData = await putRes.json();
      throw new Error(errorData.message || `GitHub API Error: ${putRes.status}`);
    }

    // 清除相关缓存
    requestCache.delete(`file_${repo}_${branch}_${path}`);
    requestCache.delete(`tree_${repo}_${branch}_${path.split("/").slice(0, -1).join("/")}`);

    return true;
  } catch (error) {
    console.error("Write GitHub file failed:", error);
    throw error;
  }
};

// 删除GitHub文件
export const deleteGithubFile = async (
  config: StorageConfig,
  path: string,
  message = "Delete via AI",
  isNotebook = false,
  repoOverride?: string,
  branchOverride?: string
): Promise<boolean> => {
  if (config.type !== "github" || !config.github?.token || !config.github?.repo) return false;

  const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
  const repo = repoOverride || (isNotebook ? notebookRepo || defaultRepo : defaultRepo);
  const branch = branchOverride || (isNotebook ? notebookBranch || defaultBranch : defaultBranch) || "main";

  const cleanToken = token.trim();
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const encodedPath = cleanPath.split("/").map((p) => encodeURIComponent(p)).join("/");
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;

  try {
    const headers = buildGithubHeaders(cleanToken);

    // 获取当前SHA
    const getRes = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
    if (!getRes.ok) {
      const errorData = await getRes.json();
      if (getRes.status === 404) return true; // 已删除
      throw new Error(errorData.message || `GitHub API Error: ${getRes.status}`);
    }

    const fileData = await getRes.json();
    const sha = fileData.sha;

    const delRes = await fetch(url, {
      method: "DELETE",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        sha,
        branch
      })
    });

    if (!delRes.ok) {
      const errorData = await delRes.json();
      throw new Error(errorData.message || `GitHub API Error: ${delRes.status}`);
    }

    // 清除相关缓存
    requestCache.delete(`file_${repo}_${branch}_${path}`);
    requestCache.delete(`tree_${repo}_${branch}_${path.split("/").slice(0, -1).join("/")}`);

    return true;
  } catch (error) {
    console.error("Delete GitHub file failed:", error);
    throw error;
  }
};

// 列出GitHub仓库
export const listGithubRepos = async (config: StorageConfig) => {
  if (config.type !== "github" || !config.github?.token) return [];

  const { token } = config.github;
  const url = `https://api.github.com/user/repos?sort=updated&per_page=100`;

  const cacheKey = `repos_${token.slice(-8)}`;

  return cachedRequest(
    cacheKey,
    async () => {
      const res = await fetch(url, { headers: buildGithubHeaders(token.trim()) });

      if (res.ok) {
        const repos = await res.json();
        return repos.map((r: any) => ({
          name: r.name,
          full_name: r.full_name,
          default_branch: r.default_branch,
          description: r.description,
          private: r.private,
          updated_at: r.updated_at,
          url: r.html_url
        }));
      }

      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `GitHub API Error: ${res.status}`);
    },
    CACHE_DURATION
  );
};

// 列出GitHub分支
export const listGithubBranches = async (config: StorageConfig, repo: string) => {
  if (config.type !== "github" || !config.github?.token) return [];

  const { token } = config.github;
  const url = `https://api.github.com/repos/${repo}/branches`;

  const cacheKey = `branches_${repo}`;

  return cachedRequest(
    cacheKey,
    async () => {
      const res = await fetch(url, { headers: buildGithubHeaders(token.trim()) });

      if (res.ok) {
        const branches = await res.json();
        return branches.map((b: any) => ({
          name: b.name,
          protected: b.protected
        }));
      }

      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `GitHub API Error: ${res.status}`);
    },
    CACHE_DURATION
  );
};
