import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Plus, Globe, Folder, Settings, User,
  Github, Twitter, ExternalLink, Trash2,
  Cloud, Sparkles, ChevronRight, LayoutGrid,
  Download, Send, Bot, Link as LinkIcon, Edit3,
  ChevronLeft, Upload, Copy, Check, File, Image, ChevronDown,
  FolderPlus, FilePlus, RotateCw, Loader2, RefreshCw,
  MessageSquare, Palette, Sun, Moon, Coffee, Waves,
  BookMarked, ArrowUpRight, PanelLeftOpen, PanelLeftClose,
  X, Wand2, History
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Markdown from "react-markdown";
import {
  Bookmark, TabType, UserProfile, StorageConfig, AppData,
  AIModelConfig, FileNode, ChatMessage, ChatSession
} from "./types";
import * as storage from "./services/storage";
import { chatWithAI, analyzeUrl, clearAICache } from "./services/ai";
import { parseBookmarkHtml } from "./services/bookmarkParser";

// Utility
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 防抖hook
function useDebounce<T extends (...args: any[]) => void>(callback: T, delay: number) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]);
}

// 错误边界组件
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">出错了</h2>
            <p className="text-slate-500 max-w-md">{this.state.error?.message || "未知错误"}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary px-6 py-2 rounded-xl"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Toast Hook
function useToast() {
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "info" }[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const ToastContainer = useCallback(() => (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={cn(
              "px-6 py-3 rounded-2xl shadow-xl border backdrop-blur-md flex items-center gap-3 min-w-[240px]",
              toast.type === "success" && "bg-emerald-500/90 border-emerald-400 text-white",
              toast.type === "error" && "bg-rose-500/90 border-rose-400 text-white",
              toast.type === "info" && "bg-slate-800/90 border-slate-700 text-white"
            )}
          >
            {toast.type === "success" && <Check size={18} />}
            {toast.type === "error" && <X size={18} />}
            {toast.type === "info" && <Bot size={18} />}
            <span className="font-medium">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  ), [toasts]);

  return { addToast, ToastContainer };
}

// FileTreeNode Component
const FileTreeNode = ({
  node, expandedFolders, onToggle, onDelete, onCreate, onUpload, selectedPath, level = 0
}: {
  node: FileNode;
  expandedFolders: Set<string>;
  onToggle: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
  onCreate: (type: "file" | "folder", path: string) => void;
  onUpload: (file: File, path: string) => void;
  selectedPath?: string;
  level?: number;
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-3 rounded-xl cursor-pointer transition-all duration-200 group",
          isSelected ? "bg-gradient-to-r from-indigo-50 to-indigo-100/50 text-indigo-600" : "hover:bg-slate-50 text-slate-600"
        )}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => onToggle(node)}
      >
        <span className="w-4 flex items-center justify-center">
          {node.type === "folder" && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </span>
        {node.type === "folder" ? (
          <Folder size={16} className={cn(isExpanded ? "text-indigo-500" : "text-slate-400")} />
        ) : node.type === "image" ? (
          <Image size={16} className="text-emerald-500" />
        ) : (
          <File size={16} className="text-slate-400" />
        )}
        <span className="text-sm font-medium truncate flex-1">{node.name}</span>

        <div className="hidden group-hover:flex items-center gap-1">
          {node.type === "folder" && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onCreate("file", node.path); }} className="p-1 hover:text-indigo-600 transition-colors" title="新建文件">
                <FilePlus size={14} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onCreate("folder", node.path); }} className="p-1 hover:text-indigo-600 transition-colors" title="新建文件夹">
                <FolderPlus size={14} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600 transition-colors" title="上传至此">
                <Upload size={14} />
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => {
                  Array.from(e.target.files || []).forEach((file) => onUpload(file, node.path));
                }} />
              </button>
            </>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(node); }} className="p-1 hover:text-rose-500 transition-colors" title="删除">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {node.type === "folder" && isExpanded && node.children && (
        <div className="mt-0.5">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onDelete={onDelete}
              onCreate={onCreate}
              onUpload={onUpload}
              selectedPath={selectedPath}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Render Icon Helper
const renderIcon = (iconName: string, size: number = 16) => {
  if (iconName?.startsWith("data:image/")) {
    return <img src={iconName} alt="icon" style={{ width: size, height: size, objectFit: "contain" }} referrerPolicy="no-referrer" />;
  }
  const normalizedName = iconName?.charAt(0).toUpperCase() + iconName?.slice(1);
  const IconComponent = (LucideIcons as any)[normalizedName] || (LucideIcons as any)[iconName] || LucideIcons.Link;
  return <IconComponent size={size} />;
};

// Main App Component
function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>("bookmarks");
  const [isAISidebarOpen, setIsAISidebarOpen] = useState(true);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [profile, setProfile] = useState<Omit<UserProfile, "content">>(storage.defaultProfile);
  const [markdownContent, setMarkdownContent] = useState(storage.defaultProfile.content);
  const [config, setConfig] = useState<StorageConfig>({
    type: "local",
    aiModels: [],
    aiPermissions: { profile: true, files: true, bookmarks: true, listRepos: true }
  });
  const [activeSettingsSection, setActiveSettingsSection] = useState<string | null>("sync");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("全部");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // AI State
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);
  const [showAIModelModal, setShowAIModelModal] = useState(false);
  const [editingAIModel, setEditingAIModel] = useState<AIModelConfig | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [isAIModelsExpanded, setIsAIModelsExpanded] = useState(false);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [analysisError, setAnalysisError] = useState<React.ReactNode | null>(null);

  const { addToast, ToastContainer } = useToast();

  // GitHub Fetching State
  const [githubRepos, setGithubRepos] = useState<{ full_name: string; default_branch?: string }[]>([]);
  const [githubBranches, setGithubBranches] = useState<{ name: string }[]>([]);
  const [githubFiles, setGithubFiles] = useState<{ name: string; path: string }[]>([]);
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);

  // Profile Files State
  const [profileFiles, setProfileFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Form states
  const [newBookmark, setNewBookmark] = useState<Partial<Bookmark>>({
    title: "", url: "", category: "常用", description: "", type: "link", icon: ""
  });

  // Derived state
  const activeChat = useMemo(() => chatSessions.find((s) => s.id === activeChatId) || null, [chatSessions, activeChatId]);
  const messages = activeChat?.messages || [];

  const categories = useMemo(() => ["全部", ...Array.from(new Set(bookmarks.map((b) => b.category)))], [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    return bookmarks.filter((b) => {
      const matchesSearch = !searchQuery || b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.url.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "全部" || b.category === selectedCategory;
      const matchesFolder = searchQuery ? true : (b.parentId || null) === (currentFolderId || null);
      return matchesSearch && matchesCategory && matchesFolder;
    });
  }, [bookmarks, searchQuery, selectedCategory, currentFolderId]);

  const activeAIModel = useMemo(() => config.aiModels.find((m) => m.id === config.activeAIId) || config.aiModels[0], [config.aiModels, config.activeAIId]);
  const folders = useMemo(() => bookmarks.filter((b) => b.type === "folder"), [bookmarks]);

  // Scroll helpers
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior });
      setShowScrollButton(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const localData = localStorage.getItem("zenspace_md_cache");
    if (localData) {
      const parsed = storage.parseFromMd(localData);
      setBookmarks(parsed.bookmarks);
      setProfile(parsed.profile);
      setMarkdownContent(parsed.content);
      if (parsed.chatSessions?.length) {
        setChatSessions(parsed.chatSessions);
        setActiveChatId(parsed.activeChatId || parsed.chatSessions[0].id);
      } else {
        createNewChat();
      }
    } else {
      setBookmarks(storage.defaultBookmarks);
      setProfile(storage.defaultProfile);
      setMarkdownContent(storage.defaultProfile.content);
      createNewChat();
    }

    const loadedConfig = storage.loadConfig();
    setConfig(loadedConfig);
  }, []);

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-sepia", "theme-ocean");
    if (config.theme && config.theme !== "light") {
      root.classList.add(`theme-${config.theme}`);
    }
  }, [config.theme]);

  // Save to local cache
  useEffect(() => {
    const data: AppData = { bookmarks, profile, content: markdownContent, chatSessions, activeChatId: activeChatId || undefined };
    localStorage.setItem("zenspace_md_cache", storage.stringifyToMd(data, config));
  }, [bookmarks, profile, markdownContent, chatSessions, activeChatId, config]);

  // Save config
  useEffect(() => {
    storage.saveConfig(config);
  }, [config]);

  // GitHub files fetch effect
  useEffect(() => {
    if (config.type === "github" && config.github?.token && config.github?.repo && config.github?.branch && !githubFiles.length) {
      fetchGithubFiles(config.github.repo, config.github.branch);
    }
  }, [config.type, config.github?.token, config.github?.repo, config.github?.branch]);

  // Chat scroll effect
  useEffect(() => {
    if (isAILoading) scrollToBottom();
  }, [isAILoading, scrollToBottom]);

  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (isNearBottom) {
        scrollToBottom();
      } else if (messages[messages.length - 1]?.role === "ai" && !isAILoading) {
        setShowScrollButton(true);
      }
    }
  }, [messages, isAILoading, scrollToBottom]);

  // Create new chat
  const createNewChat = useCallback(() => {
    const newChat: ChatSession = {
      id: Math.random().toString(36).slice(2, 9),
      title: "新对话",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setChatSessions((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setActiveTab("ai");
  }, []);

  // Handle AI send
  const handleSendMessage = async () => {
    if (!aiInput.trim() || isAILoading) return;

    const userMessage: ChatMessage = { role: "user", content: aiInput.trim(), timestamp: Date.now() };
    updateActiveChatMessages([userMessage]);
    setAiInput("");
    setIsAILoading(true);

    try {
      const context = buildContext();
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

      const response = await chatWithAI(activeAIModel!, userMessage.content, context, history, config.aiPermissions);

      let finalContent = response.text;

      if (response.functionCalls?.length) {
        const results = await executeAIFunctionCalls(response.functionCalls);
        const actions = results.map((r) => r.display).join("，");
        finalContent = finalContent ? `${finalContent}\n\n---\n*💡 AI 助手已自动执行：${actions}*` : `**AI 操作结果**：${actions}。`;
      }

      const aiMessage: ChatMessage = { role: "ai", content: finalContent || "AI 未返回内容", timestamp: Date.now() };
      updateActiveChatMessages([aiMessage]);
    } catch (error) {
      console.error("AI chat error:", error);
      const errorMessage: ChatMessage = {
        role: "ai",
        content: `**错误**：${error instanceof Error ? error.message : "未知错误"}`,
        timestamp: Date.now()
      };
      updateActiveChatMessages([errorMessage]);
      addToast("AI 响应失败", "error");
    } finally {
      setIsAILoading(false);
    }
  };

  const buildContext = () => {
    const parts: string[] = [];

    if (config.aiPermissions?.profile !== false) {
      parts.push(`用户资料：\n姓名：${profile.name}\n简介：${profile.bio}\n`);
    } else {
      parts.push("用户资料：[权限受限]");
    }

    if (config.aiPermissions?.bookmarks !== false) {
      const bookmarkList = bookmarks.map((b) => `- ${b.type === "folder" ? "📁" : "🔗"} ${b.title}${b.url ? ` (${b.url})` : ""} [${b.category}]`).join("\n");
      parts.push(`收藏夹内容：\n${bookmarkList || "（暂无内容）"}\n`);
    } else {
      parts.push("收藏夹内容：[权限受限]");
    }

    return parts.join("\n");
  };

  const updateActiveChatMessages = (newMsgs: ChatMessage[]) => {
    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeChatId) {
          const updatedMessages = [...s.messages, ...newMsgs];
          const title = s.title === "新对话" && updatedMessages.length > 0
            ? updatedMessages[0].content.slice(0, 20) + (updatedMessages[0].content.length > 20 ? "..." : "")
            : s.title;
          return { ...s, messages: updatedMessages, title, updatedAt: Date.now() };
        }
        return s;
      })
    );
  };

  const executeAIFunctionCalls = async (calls: { name: string; args: any }[]) => {
    const results: { name: string; result: any; display: string }[] = [];

    for (const call of calls) {
      try {
        if (call.name === "updateProfile") {
          setProfile((prev) => ({ ...prev, name: call.args.name || prev.name, bio: call.args.bio || prev.bio }));
          results.push({ name: call.name, result: { success: true }, display: "✅ 更新了个人资料" });
          continue;
        }

        if (["listGithubFiles", "readGithubFile", "writeGithubFile", "deleteGithubFile", "listGithubRepos", "listGithubBranches"].includes(call.name)) {
          if (config.type !== "github" || !config.github?.token) {
            results.push({ name: call.name, result: { error: "未配置 GitHub Token" }, display: "❌ GitHub 操作失败：未配置 GitHub Token" });
            continue;
          }

          switch (call.name) {
            case "listGithubRepos":
              const repos = await storage.listGithubRepos(config);
              results.push({ name: call.name, result: repos, display: `✅ 列出了 ${repos.length} 个仓库` });
              break;
            case "listGithubBranches":
              const branches = await storage.listGithubBranches(config, call.args.repo);
              results.push({ name: call.name, result: branches, display: `✅ 列出了 ${branches.length} 个分支` });
              break;
            case "listGithubFiles":
              const files = await storage.fetchGithubTree(config, call.args.path || "", call.args.isNotebook, call.args.repo, call.args.branch);
              results.push({ name: call.name, result: files, display: `✅ 列出了 ${files.length} 个文件` });
              break;
            case "readGithubFile":
              const file = await storage.fetchGithubFile(config, call.args.path, call.args.isNotebook, call.args.repo, call.args.branch);
              if (file) {
                results.push({ name: call.name, result: file, display: `✅ 读取了文件"${call.args.path}"` });
                if (!call.args.isNotebook && !call.args.repo && call.args.path === (config.github.path || "zenspace.md")) {
                  const parsed = storage.parseFromMd(file.content);
                  setBookmarks(parsed.bookmarks);
                  setProfile(parsed.profile);
                  setMarkdownContent(parsed.content);
                }
              } else {
                results.push({ name: call.name, result: { error: "文件不存在" }, display: `❌ 文件不存在` });
              }
              break;
            case "writeGithubFile":
              const writeSuccess = await storage.writeGithubFile(config, call.args.path, call.args.content, call.args.message, call.args.isNotebook, call.args.repo, call.args.branch);
              results.push({ name: call.name, result: { success: writeSuccess }, display: writeSuccess ? `✅ 已写入文件` : `❌ 写入失败` });
              if (writeSuccess && call.args.isNotebook) loadProfileFiles("");
              break;
            case "deleteGithubFile":
              const deleteSuccess = await storage.deleteGithubFile(config, call.args.path, call.args.message, call.args.isNotebook, call.args.repo, call.args.branch);
              results.push({ name: call.name, result: { success: deleteSuccess }, display: deleteSuccess ? `✅ 已删除文件` : `❌ 删除失败` });
              if (deleteSuccess && call.args.isNotebook) loadProfileFiles("");
              break;
          }
          continue;
        }

        // Bookmark operations
        setBookmarks((prev) => {
          let newBookmarks = [...prev];
          let changed = false;
          let display = "";

          switch (call.name) {
            case "createFolder":
              const folder: Bookmark = {
                id: call.args.id || Math.random().toString(36).slice(2, 9),
                title: call.args.title,
                url: "",
                category: "文件夹",
                description: "AI 自动创建",
                createdAt: Date.now(),
                type: "folder",
                parentId: call.args.parentId === "root" || !call.args.parentId ? undefined : call.args.parentId
              };
              newBookmarks.unshift(folder);
              changed = true;
              display = `✅ 创建了文件夹"${call.args.title}"`;
              break;
            case "moveBookmarks":
              let targetId = call.args.targetFolderId;
              if (targetId && targetId !== "root") {
                const folderByTitle = newBookmarks.find((b) => b.type === "folder" && b.title === targetId);
                const folderById = newBookmarks.find((b) => b.id === targetId);
                if (!folderById && folderByTitle) {
                  targetId = folderByTitle.id;
                } else if (!folderById && !folderByTitle) {
                  const newFolderId = Math.random().toString(36).slice(2, 9);
                  newBookmarks.unshift({
                    id: newFolderId,
                    title: targetId,
                    url: "",
                    category: "文件夹",
                    description: "AI 自动创建",
                    createdAt: Date.now(),
                    type: "folder"
                  });
                  targetId = newFolderId;
                }
              }
              newBookmarks = newBookmarks.map((b) =>
                call.args.bookmarkIds.includes(b.id) || call.args.bookmarkIds.includes(b.title)
                  ? { ...b, parentId: targetId === "root" || !targetId ? undefined : targetId }
                  : b
              );
              changed = true;
              display = `✅ 移动了${call.args.bookmarkIds?.length || 0}个内容`;
              break;
            case "updateBookmarksCategory":
              newBookmarks = newBookmarks.map((b) =>
                call.args.bookmarkIds.includes(b.id) || call.args.bookmarkIds.includes(b.title)
                  ? { ...b, category: call.args.category }
                  : b
              );
              changed = true;
              display = `✅ 更新了分类为"${call.args.category}"`;
              break;
            case "deleteBookmarks":
              newBookmarks = newBookmarks.filter((b) => !call.args.bookmarkIds.includes(b.id) && !call.args.bookmarkIds.includes(b.title));
              changed = true;
              display = `✅ 删除了${call.args.bookmarkIds?.length || 0}个内容`;
              break;
          }

          if (changed && config.type === "github" && config.github?.syncBookmarks) {
            storage.syncToGithub(config, { bookmarks: newBookmarks, profile, content: markdownContent });
          }

          if (changed) {
            results.push({ name: call.name, result: { success: true }, display });
          }

          return changed ? newBookmarks : prev;
        });
      } catch (error) {
        console.error(`AI Function Call Error (${call.name}):`, error);
        results.push({ name: call.name, result: { error: String(error) }, display: `❌ 执行"${call.name}"时出错` });
      }
    }

    return results;
  };

  // GitHub API Functions
  const fetchGithubRepos = async () => {
    if (!config.github?.token) {
      addToast("请先输入 GitHub Token", "error");
      return;
    }
    setIsFetchingGithub(true);
    try {
      const repos = await storage.listGithubRepos(config);
      setGithubRepos(repos);
      addToast(`成功加载${repos.length}个仓库`, "success");
      if (config.github.repo) {
        fetchGithubBranches(config.github.repo);
      }
    } catch (err) {
      addToast("加载仓库失败，请检查 Token 权限", "error");
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const fetchGithubBranches = async (repo: string) => {
    if (!config.github?.token || !repo) return;
    setIsFetchingGithub(true);
    try {
      const branches = await storage.listGithubBranches(config, repo);
      setGithubBranches(branches);
      const currentBranch = config.github?.branch || branches[0]?.name || "main";
      fetchGithubFiles(repo, currentBranch);
    } catch (err) {
      console.error("Fetch branches failed", err);
      addToast("加载分支失败", "error");
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const fetchGithubFiles = async (repo: string, branch: string) => {
    if (!config.github?.token || !repo || !branch) return;
    setIsFetchingGithub(true);
    try {
      // 使用递归树API获取所有文件
      const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, {
        headers: { Authorization: `Bearer ${config.github.token.trim()}` }
      });
      if (res.ok) {
        const data = await res.json();
        const files = data.tree
          .filter((item: any) => item.type === "blob" && item.path.toLowerCase().endsWith(".md"))
          .map((item: any) => ({ name: item.path.split("/").pop(), path: item.path }));
        setGithubFiles(files);
      } else {
        // 降级到普通contents API
        const res2 = await fetch(`https://api.github.com/repos/${repo}/contents?ref=${branch}`, {
          headers: { Authorization: `Bearer ${config.github.token.trim()}` }
        });
        if (res2.ok) {
          const data = await res2.json();
          const files = data
            .filter((item: any) => item.type === "file" && item.name.toLowerCase().endsWith(".md"))
            .map((item: any) => ({ name: item.name, path: item.path }));
          setGithubFiles(files);
        }
      }
    } catch (err) {
      console.error("Fetch files failed", err);
      addToast("加载文件失败", "error");
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const loadProfileFiles = async (path = "", overrideConfig?: StorageConfig) => {
    const activeConfig = overrideConfig || config;
    if (!activeConfig.github?.token || (!activeConfig.github?.repo && !activeConfig.github?.notebookRepo)) return;
    setIsFetchingFiles(true);
    try {
      const data = await storage.fetchGithubTree(activeConfig, path, true);
      const nodes: FileNode[] = data.map((item: any) => ({
        id: item.sha,
        name: item.name,
        type: item.type === "dir" ? "folder" : item.name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i) ? "image" : "file",
        path: item.path,
        sha: item.sha,
        url: item.download_url
      }));

      if (path === "") {
        setProfileFiles(nodes);
      } else {
        setProfileFiles((prev) => {
          const updateNodes = (list: FileNode[]): FileNode[] =>
            list.map((node) => {
              if (node.path === path) return { ...node, children: nodes };
              if (node.children) return { ...node, children: updateNodes(node.children) };
              return node;
            });
          return updateNodes(prev);
        });
      }
    } catch (err) {
      addToast("加载文件失败", "error");
    } finally {
      setIsFetchingFiles(false);
    }
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.type === "folder") {
      const isExpanded = expandedFolders.has(node.path);
      const newExpanded = new Set(expandedFolders);
      if (isExpanded) {
        newExpanded.delete(node.path);
      } else {
        newExpanded.add(node.path);
        await loadProfileFiles(node.path);
      }
      setExpandedFolders(newExpanded);
    } else {
      setIsFetchingFiles(true);
      try {
        if (node.type === "file") {
          const fileData = await storage.fetchGithubFile(config, node.path, true);
          if (fileData) {
            setSelectedFile({ ...node, content: fileData.content, sha: fileData.sha });
          }
        } else {
          setSelectedFile(node);
        }
      } catch (err) {
        addToast("读取文件失败", "error");
      } finally {
        setIsFetchingFiles(false);
      }
    }
  };

  const handleFileUpload = async (file: File, parentPath = "") => {
    if (!config.github) return;
    const { token, notebookRepo, notebookBranch, repo: defaultRepo, branch: defaultBranch } = config.github;
    const repo = notebookRepo || defaultRepo;
    const branch = notebookBranch || defaultBranch;
    const path = parentPath ? `${parentPath}/${file.name}` : file.name;

    setIsFetchingFiles(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: `Upload ${file.name} via WangLI`, content: base64, branch })
      });

      if (putRes.ok) {
        addToast(`文件${file.name}上传成功`, "success");
        loadProfileFiles(parentPath);
      } else {
        const error = await putRes.json();
        addToast(`上传失败: ${error.message}`, "error");
      }
    } catch (err) {
      addToast("上传过程中发生错误", "error");
    } finally {
      setIsFetchingFiles(false);
    }
  };

  // Bookmark handlers
  const handleAddBookmark = async () => {
    if (newBookmark.type === "link" && !newBookmark.url?.trim()) {
      addToast("请填写 URL", "error");
      return;
    }
    if (newBookmark.type === "folder" && !newBookmark.title?.trim()) {
      addToast("请填写文件夹名称", "error");
      return;
    }

    const finalTitle = newBookmark.title?.trim() || newBookmark.url?.split("/").pop() || newBookmark.url || "未命名";

    if (newBookmark.id) {
      // Update existing
      setBookmarks((prev) =>
        prev.map((b) =>
          b.id === newBookmark.id
            ? {
                ...b,
                title: finalTitle,
                url: newBookmark.type === "folder" ? "" : newBookmark.url?.trim().startsWith("http") ? newBookmark.url.trim() : `https://${newBookmark.url?.trim()}`,
                category: newBookmark.category?.trim() || b.category,
                description: newBookmark.description?.trim(),
                parentId: newBookmark.parentId,
                icon: newBookmark.icon
              }
            : b
        )
      );
      addToast("已更新内容", "success");
    } else {
      // Create new
      const bookmark: Bookmark = {
        id: Math.random().toString(36).slice(2, 9),
        title: finalTitle || "未命名书签",
        url: newBookmark.type === "folder" ? "" : newBookmark.url?.trim().startsWith("http") ? newBookmark.url.trim() : `https://${newBookmark.url?.trim()}`,
        category: newBookmark.category?.trim() || "常用",
        description: newBookmark.description?.trim(),
        createdAt: Date.now(),
        type: newBookmark.type || "link",
        parentId: newBookmark.parentId,
        icon: newBookmark.icon
      };
      setBookmarks((prev) => [bookmark, ...prev]);

      // Auto-analyze in background
      if (!newBookmark.title?.trim() && bookmark.type === "link" && activeAIModel?.apiKey && activeAIModel.apiKey !== "demo") {
        try {
          const result = await analyzeUrl(activeAIModel, bookmark.url!, folders);
          if (result) {
            setBookmarks((prev) =>
              prev.map((b) =>
                b.id === bookmark.id
                  ? { ...b, title: result.title || b.title, description: result.description || b.description, category: result.category || b.category }
                  : b
              )
            );
            addToast("已自动补全书签信息", "success");
          }
        } catch (error) {
          console.error("Background analysis failed:", error);
        }
      }
    }

    setIsAddModalOpen(false);
    setNewBookmark({ title: "", url: "", category: "常用", description: "", type: "link", icon: "" });
  };

  const handleAnalyzeUrl = async () => {
    if (!newBookmark.url?.trim()) {
      setAnalysisError("请先输入 URL");
      return;
    }
    if (!activeAIModel?.apiKey) {
      setAnalysisError(
        <span>
          未配置 AI 模型。请在"AI 助手"中添加模型，或输入
          <button
            className="text-indigo-600 underline font-bold mx-1"
            onClick={() => {
              const demoModel: AIModelConfig = { id: "demo", name: "演示模型", apiKey: "demo" };
              const newConfig: StorageConfig = { ...config, aiModels: [demoModel], activeAIId: "demo" };
              setConfig(newConfig);
              storage.saveConfig(newConfig);
              setAnalysisError(null);
            }}
          >
            demo
          </button>
          开启演示模式
        </span>
      );
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeUrl(activeAIModel, newBookmark.url.trim(), folders);
      if (result) {
        setNewBookmark((prev) => ({
          ...prev,
          title: result.title || prev.title,
          description: result.description || prev.description,
          category: result.category || prev.category,
          parentId: result.folderId === "root" ? undefined : result.folderId || prev.parentId
        }));
      } else {
        setAnalysisError("AI 未能返回有效数据，请手动填写。");
      }
    } catch (error) {
      console.error("Analysis failed:", error);
      setAnalysisError(`分析失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Debounced URL analysis
  const debouncedAnalyze = useDebounce(() => {
    if (newBookmark.url?.trim() && !newBookmark.title && !isAnalyzing && activeAIModel?.apiKey && newBookmark.type === "link") {
      handleAnalyzeUrl();
    }
  }, 1500);

  useEffect(() => {
    debouncedAnalyze();
  }, [newBookmark.url]);

  const handleImportHtml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const html = event.target?.result as string;
      if (html) {
        const imported = parseBookmarkHtml(html);
        if (imported.length > 0) {
          setBookmarks((prev) => [...imported, ...prev]);
          addToast(`成功导入${imported.length}条内容`, "success");
        } else {
          addToast("未能识别有效的书签内容", "error");
        }
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadMd = () => {
    const data: AppData = { bookmarks, profile, content: markdownContent };
    const blob = new Blob([storage.stringifyToMd(data)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wangli.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSync = async () => {
    if (config.type === "github" && config.github) {
      const syncProfile = config.github.syncProfile !== false;
      const syncBookmarks = config.github.syncBookmarks !== false;
      if (!syncProfile && !syncBookmarks) {
        addToast("请至少选择一项同步内容", "info");
        return;
      }
    }
    const data: AppData = { bookmarks, profile, content: markdownContent };
    try {
      const success = await storage.syncToGithub(config, data, false);
      if (success) {
        addToast("同步成功", "success");
      } else {
        addToast("同步失败，请检查 GitHub 配置", "error");
      }
    } catch (error) {
      addToast("同步过程中发生错误", "error");
    }
  };

  const handlePull = async () => {
    if (config.type !== "github" || !config.github) return;
    setIsFetchingFiles(true);
    addToast("正在从 GitHub 加载数据...", "info");
    try {
      const fileData = await storage.fetchGithubFile(config, config.github.path || "zenspace.md");
      if (fileData) {
        const parsed = storage.parseFromMd(fileData.content);
        if (config.github.syncBookmarks !== false) setBookmarks(parsed.bookmarks);
        if (config.github.syncProfile !== false) {
          setProfile(parsed.profile);
          setMarkdownContent(parsed.content);
        }
        addToast("从 GitHub 加载成功", "success");
      } else {
        addToast("未找到存储文件，请先同步", "error");
      }
    } catch (err) {
      addToast("加载失败，请检查网络或配置", "error");
    } finally {
      setIsFetchingFiles(false);
    }
  };

  const handleSaveAIModel = () => {
    if (!editingAIModel) return;
    const cleanedModel = {
      ...editingAIModel,
      apiKey: editingAIModel.apiKey.trim(),
      apiUrl: editingAIModel.apiUrl?.trim(),
      model: editingAIModel.model?.trim()
    };

    setConfig((prev) => {
      const newModels = prev.aiModels.some((m) => m.id === cleanedModel.id)
        ? prev.aiModels.map((m) => (m.id === cleanedModel.id ? cleanedModel : m))
        : [...prev.aiModels, { ...cleanedModel, id: Math.random().toString(36).slice(2, 9) }];
      return { ...prev, aiModels: newModels, activeAIId: prev.activeAIId || newModels[0]?.id };
    });

    setShowAIModelModal(false);
    setEditingAIModel(null);
    addToast("AI 模型配置已保存", "success");
  };

  const handleTestAIModel = async () => {
    if (!editingAIModel?.apiKey) {
      addToast("请输入 API Key 进行测试", "error");
      return;
    }
    setIsTestingAI(true);
    try {
      const testModel = {
        ...editingAIModel,
        apiKey: editingAIModel.apiKey.trim(),
        apiUrl: editingAIModel.apiUrl?.trim(),
        model: editingAIModel.model?.trim()
      };
      const result = await chatWithAI(testModel, "你好，请回复'OK'以确认连接正常。", "连接测试", [], { profile: false, bookmarks: false, files: false, listRepos: false });
      if (result.text.includes("失败") || result.text.includes("错误")) {
        addToast(result.text, "error");
      } else {
        addToast("连接测试成功", "success");
      }
    } catch (error) {
      addToast("连接测试失败", "error");
    } finally {
      setIsTestingAI(false);
    }
  };

  const handleClearChat = (id: string) => {
    setChatSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        const newChat: ChatSession = { id: Math.random().toString(36).slice(2, 9), title: "新对话", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
        setActiveChatId(newChat.id);
        return [newChat];
      }
      if (activeChatId === id) setActiveChatId(filtered[0].id);
      return filtered;
    });
  };

  const handleRenameChat = (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    setChatSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle, updatedAt: Date.now() } : s)));
    setEditingSessionId(null);
  };

  // UI Components
  const NavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-2xl transition-all duration-300 group relative w-full lg:w-auto",
        active ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25" : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
      )}
    >
      <div className={cn("transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")}>{icon}</div>
      <span className="hidden lg:block font-medium">{label}</span>
      {active && <motion.div layoutId="active-pill" className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl -z-10" />}
    </button>
  );

  const MobileNavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button onClick={onClick} className={cn("flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all duration-300 relative", active ? "text-indigo-600" : "text-slate-400")}>
      <div className={cn("transition-transform duration-300", active ? "scale-110" : "")}>{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
      {active && <motion.div layoutId="mobile-active-dot" className="absolute -bottom-1 w-1 h-1 bg-indigo-600 rounded-full" />}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-slate-50 to-slate-100 pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <nav className="w-full md:w-20 lg:w-64 glass md:h-screen sticky top-0 z-40 flex md:flex-col items-center justify-between p-4 md:py-6 border-b md:border-b-0 md:border-r border-slate-200/50">
        <div className="flex items-center gap-3 lg:w-full lg:px-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <LayoutGrid size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">WangLI</span>
        </div>

        <div className="hidden md:flex md:flex-col gap-2 w-full lg:px-2">
          <NavButton active={activeTab === "bookmarks"} onClick={() => setActiveTab("bookmarks")} icon={<Globe size={20} />} label="收藏夹" />
          <NavButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} icon={<User size={20} />} label="个人资料" />
          <NavButton active={activeTab === "ai"} onClick={() => setActiveTab("ai")} icon={<Sparkles size={20} />} label="AI 助手" />
          <NavButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={<Settings size={20} />} label="设置" />
        </div>

        <div className="flex items-center gap-4 lg:w-full lg:px-4">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-indigo-200 shadow-md">
            <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-slate-200/50 px-6 py-3 flex items-center justify-between">
        <MobileNavButton active={activeTab === "bookmarks"} onClick={() => setActiveTab("bookmarks")} icon={<Globe size={22} />} label="收藏" />
        <MobileNavButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} icon={<User size={22} />} label="资料" />
        <MobileNavButton active={activeTab === "ai"} onClick={() => setActiveTab("ai")} icon={<Sparkles size={22} />} label="AI" />
        <MobileNavButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={<Settings size={22} />} label="设置" />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 pb-24 sm:p-6 md:p-8 lg:p-10 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "bookmarks" && (
            <motion.div key="bookmarks" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-6xl mx-auto">
              {/* Header */}
              <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {currentFolderId && (
                      <button
                        onClick={() => {
                          const parent = bookmarks.find((b) => b.id === currentFolderId)?.parentId;
                          setCurrentFolderId(parent || null);
                        }}
                        className="w-10 h-10 flex items-center justify-center hover:bg-white hover:shadow-md rounded-xl text-slate-400 transition-all border border-transparent hover:border-slate-200"
                      >
                        <ChevronLeft size={20} />
                      </button>
                    )}
                    <h1 className={cn("text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-slate-900", currentFolderId && "cursor-pointer hover:text-indigo-600 transition-colors")} onClick={() => currentFolderId && setCurrentFolderId(null)}>
                      {currentFolderId ? bookmarks.find((b) => b.id === currentFolderId)?.title : "我的收藏"}
                    </h1>
                  </div>
                  <p className="text-slate-500 text-sm font-medium">数据以 Markdown 格式存储，透明且安全</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input type="file" id="html-import" accept=".html" className="hidden" onChange={handleImportHtml} />
                  <button onClick={() => document.getElementById("html-import")?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                    <Upload size={16} /> 导入
                  </button>
                  <button onClick={downloadMd} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                    <Download size={16} /> 导出
                  </button>
                  <button
                    onClick={() => {
                      setNewBookmark({ title: "", url: "", category: "常用", description: "", type: "link", parentId: currentFolderId || undefined, icon: "" });
                      setIsAddModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
                  >
                    <Plus size={18} /> 添加
                  </button>
                </div>
              </header>

              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="搜索书签..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                        selectedCategory === cat
                          ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20"
                          : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bookmarks Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredBookmarks.map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    onDelete={() => setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id))}
                    onEdit={() => {
                      setNewBookmark(bookmark);
                      setIsAddModalOpen(true);
                    }}
                    onOpenFolder={() => bookmark.type === "folder" && setCurrentFolderId(bookmark.id)}
                  />
                ))}
              </div>

              {filteredBookmarks.length === 0 && (
                <div className="text-center py-20">
                  <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Search size={32} className="text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 mb-2">没有找到书签</h3>
                  <p className="text-slate-500">尝试调整搜索条件或添加新书签</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ToastContainer />
    </div>
  );
}

// Bookmark Card Component
function BookmarkCard({
  bookmark,
  onDelete,
  onEdit,
  onOpenFolder
}: {
  bookmark: Bookmark;
  onDelete: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
}) {
  const isFolder = bookmark.type === "folder";
  const [iconError, setIconError] = useState(false);

  useEffect(() => setIconError(false), [bookmark.icon, bookmark.url]);

  const getFaviconUrl = (url: string) => {
    try {
      return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`;
    } catch {
      return null;
    }
  };

  const favicon = !isFolder ? getFaviconUrl(bookmark.url) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, scale: 1.02 }}
      onClick={isFolder ? onOpenFolder : undefined}
      className={cn(
        "group relative bg-white rounded-2xl p-5 transition-all duration-300 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer overflow-hidden",
        isFolder && "bg-gradient-to-br from-indigo-50/50 to-white border-indigo-100"
      )}
    >
      {/* Hover gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/0 to-violet-600/0 group-hover:from-indigo-600/5 group-hover:to-violet-600/5 transition-all duration-500" />

      {/* Actions */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
          <Edit3 size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="relative">
        <div className="flex items-start gap-4 mb-4">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
              isFolder ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600"
            )}
          >
            {bookmark.icon && !iconError ? (
              <img src={bookmark.icon} alt="" className="w-full h-full object-cover rounded-xl" onError={() => setIconError(true)} referrerPolicy="no-referrer" />
            ) : isFolder ? (
              <Folder size={24} />
            ) : favicon && !iconError ? (
              <img src={favicon} alt="" className="w-6 h-6 rounded" onError={() => setIconError(true)} referrerPolicy="no-referrer" />
            ) : (
              <Globe size={24} />
            )}
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{bookmark.title}</h3>
            <span className={cn("inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", isFolder ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500")}>
              {bookmark.category}
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-500 line-clamp-2 mb-4 min-h-[40px]">{bookmark.description || "暂无描述"}</p>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-400 font-mono">{new Date(bookmark.createdAt).toLocaleDateString()}</span>
          {!isFolder ? (
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
            >
              访问 <ExternalLink size={12} />
            </a>
          ) : (
            <span className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-lg">
              打开 <ChevronRight size={12} />
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Export with Error Boundary
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}