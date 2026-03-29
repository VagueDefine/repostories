import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, Globe, Folder, Settings, User, 
  Github, Twitter, ExternalLink, Trash2, Save, 
  Cloud, Sparkles, ChevronRight, LayoutGrid,
  Info, LogOut, Menu, X, FileText, Download,
  Send, Bot, Key, Link as LinkIcon, Edit3,
  ChevronLeft, Wand2, PlusCircle, MoreVertical, BookMarked, Upload,
  Copy, Check, File, Image, ChevronDown, FolderPlus, FilePlus, RotateCw,
  Loader2, RefreshCw, History, Trash, MessageSquare, HelpCircle, PlusSquare,
  ArrowUpRight, ArrowDownCircle, Palette, Sun, Moon, Coffee, Waves
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { Bookmark, TabType, UserProfile, StorageConfig, AppData, AIModelConfig, FileNode, ChatMessage, ChatSession } from './types';
import * as storage from './services/storage';
import { chatWithAI, analyzeUrl } from './services/ai';
import { parseBookmarkHtml } from './services/bookmarkParser';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FileTreeNode = ({ 
  node, 
  expandedFolders, 
  onToggle, 
  onDelete,
  onCreate,
  onUpload,
  selectedPath,
  level = 0 
}: { 
  node: FileNode; 
  expandedFolders: Set<string>; 
  onToggle: (node: FileNode) => void; 
  onDelete: (node: FileNode) => void;
  onCreate: (type: 'file' | 'folder', path: string) => void;
  onUpload: (file: File, path: string) => void;
  selectedPath?: string;
  level?: number;
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-2 py-1.5 px-3 rounded-xl cursor-pointer transition-all group",
          isSelected ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-600"
        )}
        style={{ paddingLeft: `${(level * 16) + 12}px` }}
        onClick={() => onToggle(node)}
      >
        <span className="w-4 flex items-center justify-center">
          {node.type === 'folder' && (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          )}
        </span>
        {node.type === 'folder' ? (
          <Folder size={16} className={cn(isExpanded ? "text-indigo-500" : "text-slate-400")} />
        ) : node.type === 'image' ? (
          <Image size={16} className="text-emerald-500" />
        ) : (
          <File size={16} className="text-slate-400" />
        )}
        <span className="text-sm font-medium truncate flex-1">{node.name}</span>
        
        <div className="hidden group-hover:flex items-center gap-1">
          {node.type === 'folder' && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); onCreate('file', node.path); }}
                className="p-1 hover:text-indigo-600"
                title="新建文件"
              >
                <FilePlus size={14} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onCreate('folder', node.path); }}
                className="p-1 hover:text-indigo-600"
                title="新建文件夹"
              >
                <FolderPlus size={14} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="p-1 hover:text-indigo-600"
                title="上传至此"
              >
                <Upload size={14} />
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  multiple 
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => onUpload(file, node.path));
                  }} 
                />
              </button>
            </>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
            className="p-1 hover:text-rose-500"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      
      {node.type === 'folder' && isExpanded && node.children && (
        <div className="mt-0.5">
          {node.children.map(child => (
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

const renderIcon = (iconName: string, size: number = 16) => {
  if (iconName.startsWith('data:image/')) {
    return <img src={iconName} alt="icon" style={{ width: size, height: size, objectFit: 'contain' }} referrerPolicy="no-referrer" />;
  }
  // Normalize icon name: capitalize first letter and handle common cases
  const normalizedName = iconName.charAt(0).toUpperCase() + iconName.slice(1);
  const IconComponent = (LucideIcons as any)[normalizedName] || (LucideIcons as any)[iconName] || LucideIcons.Link;
  return <IconComponent size={size} />;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('bookmarks');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [profile, setProfile] = useState<Omit<UserProfile, 'content'>>(storage.defaultProfile);
  const [markdownContent, setMarkdownContent] = useState(storage.defaultProfile.content);
  const [config, setConfig] = useState<StorageConfig>({ 
    type: 'local', 
    aiModels: [],
    aiPermissions: { profile: true, files: true, bookmarks: true, listRepos: true }
  });
  const [activeSettingsSection, setActiveSettingsSection] = useState<string | null>('sync');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  // AI State
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [showAIModelModal, setShowAIModelModal] = useState(false);
  const [editingAIModel, setEditingAIModel] = useState<AIModelConfig | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [isAIModelsExpanded, setIsAIModelsExpanded] = useState(false);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const iconInputRef = React.useRef<HTMLInputElement>(null);
  const [analysisError, setAnalysisError] = useState<React.ReactNode | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const activeChat = useMemo(() => {
    return chatSessions.find(s => s.id === activeChatId) || null;
  }, [chatSessions, activeChatId]);

  const messages = activeChat?.messages || [];

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior
      });
      setShowScrollButton(false);
    }
  };

  useEffect(() => {
    if (isAILoading) {
      scrollToBottom();
    }
  }, [isAILoading]);

  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (isNearBottom) {
        scrollToBottom();
      } else if (messages[messages.length - 1].role === 'ai' && !isAILoading) {
        setShowScrollButton(true);
      }
    }
  }, [messages, isAILoading]);

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

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };
  
  // Form states
  const [newBookmark, setNewBookmark] = useState<Partial<Bookmark>>({
    title: '',
    url: '',
    category: '常用',
    description: '',
    type: 'link',
    icon: ''
  });

  useEffect(() => {
    // Initial load from local storage
    const localData = localStorage.getItem('zenspace_md_cache');
    if (localData) {
      const parsed = storage.parseFromMd(localData);
      setBookmarks(parsed.bookmarks);
      setProfile(parsed.profile);
      setMarkdownContent(parsed.content);
      if (parsed.chatSessions && parsed.chatSessions.length > 0) {
        setChatSessions(parsed.chatSessions);
        setActiveChatId(parsed.activeChatId || parsed.chatSessions[0].id);
      } else {
        const initialChat: ChatSession = {
          id: Math.random().toString(36).substr(2, 9),
          title: '新对话',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        setChatSessions([initialChat]);
        setActiveChatId(initialChat.id);
      }
    } else {
      setBookmarks(storage.defaultBookmarks);
      setProfile(storage.defaultProfile);
      setMarkdownContent(storage.defaultProfile.content);
      const initialChat: ChatSession = {
        id: Math.random().toString(36).substr(2, 9),
        title: '新对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setChatSessions([initialChat]);
      setActiveChatId(initialChat.id);
    }
    const loadedConfig = storage.loadConfig();
    setConfig(loadedConfig);
  }, []);

  useEffect(() => {
    const theme = config.theme || 'light';
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-sepia', 'theme-ocean');
    if (theme !== 'light') {
      root.classList.add(`theme-${theme}`);
    }
  }, [config.theme]);

  // Save to local cache whenever data changes
  useEffect(() => {
    const data: AppData = { 
      bookmarks, 
      profile, 
      content: markdownContent,
      chatSessions,
      activeChatId: activeChatId || undefined
    };
    // 本地缓存始终保存全量数据，不受 GitHub 同步勾选影响，确保本地数据安全
    localStorage.setItem('zenspace_md_cache', storage.stringifyToMd(data, config));
  }, [bookmarks, profile, markdownContent, chatSessions, activeChatId, config]);

  useEffect(() => {
    storage.saveConfig(config);
  }, [config]);

  useEffect(() => {
    if (config.type === 'github' && config.github?.token && config.github?.repo && config.github?.branch && githubFiles.length === 0) {
      fetchGithubFiles(config.github.repo, config.github.branch);
    }
  }, [config.type, config.github?.token, config.github?.repo, config.github?.branch, githubFiles.length]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(bookmarks.map(b => b.category)));
    return ['全部', ...cats];
  }, [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    return bookmarks.filter(b => {
      const matchesSearch = b.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           b.url.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === '全部' || b.category === selectedCategory;
      const matchesFolder = searchQuery ? true : ((b.parentId || null) === (currentFolderId || null));
      return matchesSearch && matchesCategory && matchesFolder;
    });
  }, [bookmarks, searchQuery, selectedCategory, currentFolderId]);

  const activeAIModel = useMemo(() => {
    return config.aiModels.find(m => m.id === config.activeAIId) || config.aiModels[0];
  }, [config.aiModels, config.activeAIId]);

  const folders = useMemo(() => {
    return bookmarks.filter(b => b.type === 'folder');
  }, [bookmarks]);

  const handleAddBookmark = async () => {
    if (newBookmark.type === 'link' && !newBookmark.url?.trim()) {
      addToast('请填写 URL', 'error');
      return;
    }
    
    if (newBookmark.type === 'folder' && !newBookmark.title?.trim()) {
      addToast('请填写文件夹名称', 'error');
      return;
    }

    let finalTitle = newBookmark.title?.trim() || '';
    if (!finalTitle && newBookmark.url) {
      finalTitle = newBookmark.url.split('/').pop() || newBookmark.url;
    }
    
    if (newBookmark.id) {
      // Update existing bookmark
      setBookmarks(prev => prev.map(b => b.id === newBookmark.id ? {
        ...b,
        title: finalTitle || b.title,
        url: newBookmark.type === 'folder' ? '' : (newBookmark.url?.trim().startsWith('http') ? newBookmark.url.trim() : `https://${newBookmark.url?.trim()}`),
        category: newBookmark.category?.trim() || b.category,
        description: newBookmark.description?.trim(),
        parentId: newBookmark.parentId || undefined,
        icon: newBookmark.icon
      } : b));
      addToast('已更新内容', 'success');
    } else {
      // Create new bookmark
      const bookmark: Bookmark = {
        id: Math.random().toString(36).substr(2, 9),
        title: finalTitle || '未命名书签',
        url: newBookmark.type === 'folder' ? '' : (newBookmark.url?.trim().startsWith('http') ? newBookmark.url.trim() : `https://${newBookmark.url?.trim()}`),
        category: newBookmark.category?.trim() || '常用',
        description: newBookmark.description?.trim(),
        createdAt: Date.now(),
        type: newBookmark.type || 'link',
        parentId: newBookmark.parentId || undefined,
        icon: newBookmark.icon
      };
      
      setBookmarks([bookmark, ...bookmarks]);
      
      // If title was empty, trigger AI analysis in background for the newly added bookmark
      if (!newBookmark.title?.trim() && bookmark.type === 'link' && activeAIModel?.apiKey) {
        try {
          const result = await analyzeUrl(activeAIModel, bookmark.url!, folders);
          if (result) {
            setBookmarks(prev => prev.map(b => b.id === bookmark.id ? {
              ...b,
              title: result.title || b.title,
              description: result.description || b.description,
              category: result.category || b.category,
              parentId: result.folderId === 'root' ? undefined : (result.folderId || b.parentId)
            } : b));
            addToast('已自动补全书签信息', 'success');
          }
        } catch (error) {
          console.error("Background analysis failed:", error);
        }
      }
    }
    
    setIsAddModalOpen(false);
    setNewBookmark({ title: '', url: '', category: '常用', description: '', type: 'link', icon: '' });
  };

  const handleEditBookmark = (bookmark: Bookmark) => {
    setNewBookmark(bookmark);
    setIsAddModalOpen(true);
  };

  const handleDeleteBookmark = (id: string) => {
    setBookmarks(bookmarks.filter(b => b.id !== id));
  };

  const handleSync = async () => {
    if (config.type === 'github' && config.github) {
      const syncProfile = config.github.syncProfile !== false;
      const syncBookmarks = config.github.syncBookmarks !== false;
      if (!syncProfile && !syncBookmarks) {
        addToast('请至少选择一项同步内容', 'info');
        return;
      }
    }
    const data: AppData = { bookmarks, profile, content: markdownContent };
    const success = await storage.syncToGithub(config, data, false);
    if (success) {
      addToast('同步成功！您的 .md 文件已更新。', 'success');
    } else {
      addToast('同步失败，请检查 GitHub 配置。', 'error');
    }
  };

  const handlePull = async () => {
    if (config.type !== 'github' || !config.github) return;
    const { path } = config.github;
    
    setIsFetchingFiles(true);
    addToast('正在从 GitHub 加载数据...', 'info');
    try {
      const fileData = await storage.fetchGithubFile(config, path);
      if (fileData) {
        const parsed = storage.parseFromMd(fileData.content);
        
        // Only update parts that are enabled for sync
        if (config.github.syncBookmarks !== false) {
          setBookmarks(parsed.bookmarks);
        }
        if (config.github.syncProfile !== false) {
          setProfile(parsed.profile);
          setMarkdownContent(parsed.content);
        }
        
        addToast('从 GitHub 加载成功！', 'success');
      } else {
        addToast('未找到存储文件，请先同步。', 'error');
      }
    } catch (err) {
      addToast('加载失败，请检查网络或配置。', 'error');
    } finally {
      setIsFetchingFiles(false);
    }
  };

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const handleCopyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idx);
    addToast('已复制到剪贴板', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveAIModel = () => {
    if (!editingAIModel) return;
    
    // Trim API Key and URL
    const cleanedModel = {
      ...editingAIModel,
      apiKey: editingAIModel.apiKey.trim(),
      apiUrl: editingAIModel.apiUrl?.trim(),
      model: editingAIModel.model?.trim()
    };
    
    let newModels = [...config.aiModels];
    const index = newModels.findIndex(m => m.id === cleanedModel.id);
    
    if (index >= 0) {
      newModels[index] = cleanedModel;
    } else {
      newModels.push({ ...cleanedModel, id: Math.random().toString(36).substr(2, 9) });
    }
    
    const newConfig = { 
      ...config, 
      aiModels: newModels,
      activeAIId: config.activeAIId || (newModels.length > 0 ? newModels[0].id : undefined)
    };
    setConfig(newConfig);
    setShowAIModelModal(false);
    setEditingAIModel(null);
    addToast('AI 模型配置已保存', 'success');
  };

  const handleTestAIModel = async () => {
    if (!editingAIModel?.apiKey) {
      addToast('请输入 API Key 进行测试', 'error');
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
      
      const result = await chatWithAI(
        testModel, 
        "你好，请回复 'OK' 以确认连接正常。", 
        "连接测试", 
        [], 
        { profile: false, bookmarks: false, files: false, listRepos: false }
      );
      
      if (result.text.includes("失败") || result.text.includes("错误") || result.text.includes("XHR Error")) {
        addToast(result.text, 'error');
      } else {
        addToast('连接测试成功！AI 已响应。', 'success');
      }
    } catch (error) {
      addToast(`测试失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsTestingAI(false);
    }
  };

  const fetchGithubRepos = async () => {
    if (!config.github?.token) {
      addToast('请先输入 GitHub Token', 'error');
      return;
    }
    setIsFetchingGithub(true);
    try {
      const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: { Authorization: `token ${config.github.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGithubRepos(data);
        addToast(`成功加载 ${data.length} 个仓库`, 'success');
        if (config.github.repo) {
          fetchGithubBranches(config.github.repo);
        }
      } else {
        addToast('加载仓库失败，请检查 Token 权限', 'error');
      }
    } catch (err) {
      addToast('网络错误，无法连接 GitHub', 'error');
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const fetchGithubBranches = async (repo: string) => {
    if (!config.github?.token || !repo) return;
    setIsFetchingGithub(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/branches`, {
        headers: { Authorization: `token ${config.github.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGithubBranches(data);
        // If there's a branch, fetch files for the first branch or current branch
        const currentBranch = config.github?.branch || (data.length > 0 ? data[0].name : 'main');
        fetchGithubFiles(repo, currentBranch);
      }
    } catch (err) {
      console.error('Fetch branches failed', err);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const fetchGithubFiles = async (repo: string, branch: string) => {
    if (!config.github?.token || !repo || !branch) return;
    setIsFetchingGithub(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, {
        headers: { Authorization: `token ${config.github.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const files = data.tree
          .filter((item: any) => item.type === 'blob' && item.path.toLowerCase().endsWith('.md'))
          .map((item: any) => ({ name: item.path, path: item.path }));
        setGithubFiles(files);
      } else {
        const res2 = await fetch(`https://api.github.com/repos/${repo}/contents?ref=${branch}`, {
          headers: { Authorization: `token ${config.github.token}` }
        });
        if (res2.ok) {
          const data = await res2.json();
          const files = data
            .filter((item: any) => item.type === 'file' && item.name.toLowerCase().endsWith('.md'))
            .map((item: any) => ({ name: item.name, path: item.path }));
          setGithubFiles(files);
        }
      }
    } catch (err) {
      console.error('Fetch files failed', err);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const loadProfileFiles = async (path: string = '', overrideConfig?: StorageConfig) => {
    const activeConfig = overrideConfig || config;
    if (!activeConfig.github?.token || (!activeConfig.github?.repo && !activeConfig.github?.notebookRepo)) return;
    setIsFetchingFiles(true);
    try {
      const data = await storage.fetchGithubTree(activeConfig, path, true);
      const nodes: FileNode[] = data.map((item: any) => ({
        id: item.sha,
        name: item.name,
        type: item.type === 'dir' ? 'folder' : (item.name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i) ? 'image' : 'file'),
        path: item.path,
        sha: item.sha,
        url: item.download_url
      }));
      
      if (path === '') {
        setProfileFiles(nodes);
      } else {
        // Update nested children - simplified for now, usually you'd find the parent node
        setProfileFiles(prev => {
          const updateNodes = (list: FileNode[]): FileNode[] => {
            return list.map(node => {
              if (node.path === path) {
                return { ...node, children: nodes };
              }
              if (node.children) {
                return { ...node, children: updateNodes(node.children) };
              }
              return node;
            });
          };
          return updateNodes(prev);
        });
      }
    } catch (err) {
      addToast('加载文件失败', 'error');
    } finally {
      setIsFetchingFiles(false);
    }
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'folder') {
      const isExpanded = expandedFolders.has(node.path);
      const newExpanded = new Set(expandedFolders);
      if (isExpanded) {
        newExpanded.delete(node.path);
      } else {
        newExpanded.add(node.path);
        // Always try to load children when expanding
        await loadProfileFiles(node.path);
      }
      setExpandedFolders(newExpanded);
    } else if (node.type === 'file' || node.type === 'image') {
      setIsFetchingFiles(true);
      if (node.type === 'file') {
        const fileData = await storage.fetchGithubFile(config, node.path, true);
        if (fileData) {
          setSelectedFile({ ...node, content: fileData.content, sha: fileData.sha });
        }
      } else {
        setSelectedFile(node);
      }
      setIsFetchingFiles(false);
    }
  };

  const handleFileUpload = async (file: File, parentPath: string = '') => {
    if (!config.github) return;
    
    const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
    const repo = notebookRepo || defaultRepo;
    const branch = notebookBranch || defaultBranch;
    const path = parentPath ? `${parentPath}/${file.name}` : file.name;

    setIsFetchingFiles(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        
        try {
          const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
              Authorization: `token ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Upload ${file.name} via WangLI`,
              content: base64,
              branch
            })
          });

          if (putRes.ok) {
            addToast(`文件 ${file.name} 上传成功`, 'success');
            loadProfileFiles(parentPath);
          } else {
            const error = await putRes.json();
            addToast(`上传失败: ${error.message}`, 'error');
          }
        } catch (err) {
          addToast('上传过程中发生网络错误', 'error');
        } finally {
          setIsFetchingFiles(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      addToast('读取文件失败', 'error');
      setIsFetchingFiles(false);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      files.forEach(file => handleFileUpload(file));
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile || !config.github) return;
    setIsFetchingFiles(true);
    
    const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
    const repo = notebookRepo || defaultRepo;
    const branch = notebookBranch || defaultBranch;
    const mdContent = selectedFile.content || '';
    
    try {
      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${selectedFile.path}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ${selectedFile.name} via WangLI`,
          content: btoa(unescape(encodeURIComponent(mdContent))),
          branch,
          sha: selectedFile.sha
        })
      });
      
      if (putRes.ok) {
        const data = await putRes.json();
        setSelectedFile({ ...selectedFile, sha: data.content.sha });
        addToast('文件已保存到 GitHub', 'success');
        // Refresh the tree to ensure consistency
        loadProfileFiles(selectedFile.path.split('/').slice(0, -1).join('/'));
      } else {
        addToast('保存失败', 'error');
      }
    } catch (error) {
      addToast('网络错误', 'error');
    } finally {
      setIsFetchingFiles(false);
    }
  };

  const handleCreateNew = async (type: 'file' | 'folder', parentPath: string = '') => {
    if (!config.github) return;
    const name = prompt(`请输入${type === 'file' ? '文件' : '文件夹'}名称:`);
    if (!name) return;

    const path = parentPath ? `${parentPath}/${name}` : name;
    const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
    const repo = notebookRepo || defaultRepo;
    const branch = notebookBranch || defaultBranch;

    setIsFetchingFiles(true);
    try {
      if (type === 'file') {
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Create ${name} via WangLI`,
            content: btoa(''), // Empty file
            branch
          })
        });
        if (putRes.ok) {
          addToast('文件已创建', 'success');
          loadProfileFiles(parentPath);
        }
      } else {
        // GitHub doesn't support empty folders, so we create a .keep file
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}/.keep`, {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Create folder ${name} via WangLI`,
            content: btoa(''),
            branch
          })
        });
        if (putRes.ok) {
          addToast('文件夹已创建', 'success');
          loadProfileFiles(parentPath);
        }
      }
    } catch (err) {
      addToast('创建失败', 'error');
    } finally {
      setIsFetchingFiles(false);
    }
  };

  const handleDeleteFile = async (node: FileNode) => {
    if (!config.github || !window.confirm(`确定要删除 ${node.name} 吗？`)) return;
    
    const { token, repo: defaultRepo, branch: defaultBranch, notebookRepo, notebookBranch } = config.github;
    const repo = notebookRepo || defaultRepo;
    const branch = notebookBranch || defaultBranch;
    setIsFetchingFiles(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${node.path}`, {
        method: 'DELETE',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Delete ${node.name} via WangLI`,
          sha: node.sha,
          branch
        })
      });
      if (res.ok) {
        addToast('已删除', 'success');
        if (selectedFile?.path === node.path) setSelectedFile(null);
        loadProfileFiles(node.path.split('/').slice(0, -1).join('/'));
      }
    } catch (err) {
      addToast('删除失败', 'error');
    } finally {
      setIsFetchingFiles(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'profile' && config.type === 'github') {
      if (profileFiles.length === 0) loadProfileFiles();
      if (githubRepos.length === 0) fetchGithubRepos();
    }
  }, [activeTab, config.type]);

  const handleDeleteAIModel = (id: string) => {
    const newModels = config.aiModels.filter(m => m.id !== id);
    const newConfig = { 
      ...config, 
      aiModels: newModels,
      activeAIId: config.activeAIId === id ? (newModels.length > 0 ? newModels[0].id : undefined) : config.activeAIId
    };
    setConfig(newConfig);
  };

  const handleSelectAIModel = (id: string) => {
    const newConfig = { ...config, activeAIId: id };
    setConfig(newConfig);
  };

  const handleSendMessage = async () => {
    if (!aiInput.trim() || isAILoading) return;
    
    if (!activeAIModel?.apiKey) {
      const errorMsg: ChatMessage = { role: 'ai', content: '未配置 AI 模型或 API Key。请前往“AI 助手”选项卡进行设置，或者输入 "demo" 作为 API Key 来开启演示模式。', timestamp: Date.now() };
      updateActiveChatMessages([{ role: 'user', content: aiInput.trim(), timestamp: Date.now() }, errorMsg]);
      setAiInput('');
      return;
    }

    const userMsg = aiInput.trim();
    setAiInput('');
    const userMessage: ChatMessage = { role: 'user', content: userMsg, timestamp: Date.now() };
    updateActiveChatMessages([userMessage]);
    setIsAILoading(true);

    const context = `
      ${config.aiPermissions?.profile !== false ? `用户信息:
      姓名: ${profile.name}
      简介: ${profile.bio}` : '用户信息: [权限受限，无法查看]'}
      
      ${config.aiPermissions?.bookmarks !== false ? `收藏夹内容 (共 ${bookmarks.length} 条):
      ${bookmarks.map(b => `- [${b.type === 'folder' ? '文件夹' : '链接'}] ${b.title} (ID: ${b.id}, URL: ${b.url}, 分类: ${b.category}, 父文件夹ID: ${b.parentId || 'root'})`).join('\n')}` : '收藏夹内容: [权限受限，无法查看]'}
      
      ${config.aiPermissions?.files !== false ? `个人主页笔记内容:
      ${markdownContent}
      
      GitHub 配置:
      ${config.type === 'github' && config.github ? `
      主仓库: ${config.github.repo} (分支: ${config.github.branch || 'main'})
      笔记仓库: ${config.github.notebookRepo || config.github.repo} (分支: ${config.github.notebookBranch || config.github.branch || 'main'})
      ` : '未配置 GitHub 存储'}` : '个人主页笔记内容: [权限受限，无法查看]'}
    `;

    const response = await chatWithAI(activeAIModel, userMsg, context, messages, config.aiPermissions);
    
    let finalContent = response.text;
    if (response.functionCalls && response.functionCalls.length > 0) {
      // Filter function calls based on permissions
      const allowedCalls = response.functionCalls.filter(call => {
        if (['createFolder', 'moveBookmarks', 'updateBookmarksCategory', 'deleteBookmarks'].includes(call.name)) {
          return config.aiPermissions?.bookmarks !== false;
        }
        if (call.name === 'updateProfile') {
          return config.aiPermissions?.profile !== false;
        }
        if (['listGithubFiles', 'readGithubFile', 'writeGithubFile', 'deleteGithubFile'].includes(call.name)) {
          return config.aiPermissions?.files !== false;
        }
        return true;
      });

      let results: { name: string, result: any, display: string }[] = [];
      if (allowedCalls.length > 0) {
        results = await executeAIFunctionCalls(allowedCalls);
      }

      const actions = response.functionCalls.map(call => {
        const isAllowed = allowedCalls.includes(call);
        if (!isAllowed) return `❌ (权限被拒绝) 执行了 ${call.name}`;
        
        // Find the result for this call
        const result = results.find(r => r.name === call.name);
        return result?.display || `✅ 执行了 ${call.name}`;
      }).join('，');

      // Call AI again with tool results to get a conversational final response
      if (results.length > 0) {
        const toolResultsContext = results.map(r => `工具 [${r.name}] 执行结果: ${JSON.stringify(r.result)}`).join('\n');
        const followUpHistory: { role: 'user' | 'ai', content: string }[] = [
          ...messages.map(m => ({ role: m.role as 'user' | 'ai', content: m.content })),
          { role: 'user', content: userMsg },
          { role: 'ai', content: response.text || `我正在执行以下操作: ${actions}` }
        ];
        
        const finalResponse = await chatWithAI(
          activeAIModel, 
          `工具执行已完成。结果如下：\n${toolResultsContext}\n请根据这些结果给用户一个最终回复。`, 
          context, 
          followUpHistory, 
          config.aiPermissions
        );
        
        finalContent = finalResponse.text;
        if (!finalContent) {
          finalContent = `**AI 操作结果**：${actions}。`;
        } else {
          finalContent = `${finalContent}\n\n---\n*💡 AI 助手已自动执行：${actions}*`;
        }
      } else {
        if (!finalContent) {
          finalContent = `**AI 操作结果**：${actions}。`;
        } else {
          finalContent = `${finalContent}\n\n---\n*💡 AI 助手已自动执行：${actions}*`;
        }
      }
    }

    const aiMessage: ChatMessage = { role: 'ai', content: finalContent || "AI 未返回内容", timestamp: Date.now() };
    updateActiveChatMessages([aiMessage]);
    setIsAILoading(false);
  };

  const updateActiveChatMessages = (newMsgs: ChatMessage[]) => {
    setChatSessions(prev => prev.map(s => {
      if (s.id === activeChatId) {
        const updatedMessages = [...s.messages, ...newMsgs];
        // Auto-title if it's the first message
        let title = s.title;
        if (s.title === '新对话' && updatedMessages.length > 0) {
          title = updatedMessages[0].content.slice(0, 20) + (updatedMessages[0].content.length > 20 ? '...' : '');
        }
        return { ...s, messages: updatedMessages, title, updatedAt: Date.now() };
      }
      return s;
    }));
  };

  const handleNewChat = () => {
    const newChat: ChatSession = {
      id: Math.random().toString(36).substr(2, 9),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setChatSessions(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setActiveTab('ai');
  };

  const handleClearChat = (id: string) => {
    setChatSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        const newChat: ChatSession = {
          id: Math.random().toString(36).substr(2, 9),
          title: '新对话',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        setActiveChatId(newChat.id);
        return [newChat];
      }
      if (activeChatId === id) {
        setActiveChatId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleRenameChat = (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    setChatSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, title: newTitle, updatedAt: Date.now() } : s
    ));
    setEditingSessionId(null);
  };

  const executeAIFunctionCalls = async (calls: { name: string, args: any }[]) => {
    const results: { name: string, result: any, display: string }[] = [];

    for (const call of calls) {
      try {
        if (call.name === 'updateProfile') {
          setProfile(prev => ({
            ...prev,
            name: call.args.name || prev.name,
            bio: call.args.bio || prev.bio
          }));
          results.push({ name: call.name, result: { success: true }, display: `✅ 更新了个人资料` });
          continue;
        }

        if (['listGithubFiles', 'readGithubFile', 'writeGithubFile', 'deleteGithubFile', 'listGithubRepos', 'listGithubBranches'].includes(call.name)) {
          if (config.type !== 'github' || !config.github?.token) {
            results.push({ name: call.name, result: { error: '未配置 GitHub Token' }, display: `❌ GitHub 操作失败：未配置 GitHub Token` });
            continue;
          }

          if (call.name === 'listGithubRepos') {
            const repos = await storage.listGithubRepos(config);
            const repoList = repos.map((r: any) => r.full_name).join(', ');
            results.push({ name: call.name, result: repos, display: `✅ 列出了您的 GitHub 仓库：${repoList}` });
          } else if (call.name === 'listGithubBranches') {
            const branches = await storage.listGithubBranches(config, call.args.repo);
            const branchList = branches.map((b: any) => b.name).join(', ');
            results.push({ name: call.name, result: branches, display: `✅ 列出了仓库 "${call.args.repo}" 的所有分支：${branchList}` });
          } else if (call.name === 'listGithubFiles') {
            const files = await storage.fetchGithubTree(config, call.args.path || '', call.args.isNotebook, call.args.repo, call.args.branch);
            const fileList = files.map((f: any) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join(', ');
            results.push({ name: call.name, result: files, display: `✅ 列出了目录 "${call.args.path || '/'}" 的内容：${fileList}` });
          } else if (call.name === 'readGithubFile') {
            const file = await storage.fetchGithubFile(config, call.args.path, call.args.isNotebook, call.args.repo, call.args.branch);
            if (file) {
              results.push({ name: call.name, result: file, display: `✅ 读取了文件 "${call.args.path}"，内容长度：${file.content.length} 字符` });
              // If it's the main zenspace.md, we might want to update the local state
              if (!call.args.isNotebook && !call.args.repo && call.args.path === (config.github.path || 'zenspace.md')) {
                const parsed = storage.parseFromMd(file.content);
                setBookmarks(parsed.bookmarks);
                setProfile(parsed.profile);
                setMarkdownContent(parsed.content);
              }
            } else {
              results.push({ name: call.name, result: { error: '文件不存在' }, display: `❌ 读取文件 "${call.args.path}" 失败：文件不存在` });
            }
          } else if (call.name === 'writeGithubFile') {
            const success = await storage.writeGithubFile(config, call.args.path, call.args.content, call.args.message, call.args.isNotebook, call.args.repo, call.args.branch);
            if (success) {
              results.push({ name: call.name, result: { success: true }, display: `✅ 已写入文件 "${call.args.path}"` });
              // Refresh tree if needed
              if (call.args.isNotebook) {
                loadProfileFiles('');
              }
            } else {
              results.push({ name: call.name, result: { success: false }, display: `❌ 写入文件 "${call.args.path}" 失败` });
            }
          } else if (call.name === 'deleteGithubFile') {
            const success = await storage.deleteGithubFile(config, call.args.path, call.args.message, call.args.isNotebook, call.args.repo, call.args.branch);
            if (success) {
              results.push({ name: call.name, result: { success: true }, display: `✅ 已删除文件 "${call.args.path}"` });
              if (call.args.isNotebook) {
                loadProfileFiles('');
              }
            } else {
              results.push({ name: call.name, result: { success: false }, display: `❌ 删除文件 "${call.args.path}" 失败` });
            }
          }
          continue;
        }

        // Bookmark operations
        let bookmarkResult: any = null;
        let bookmarkDisplay = '';

        setBookmarks(prev => {
          let newBookmarks = [...prev];
          let changed = false;

          switch (call.name) {
            case 'createFolder':
              const folder: Bookmark = {
                id: call.args.id || Math.random().toString(36).substr(2, 9),
                title: call.args.title,
                url: '',
                category: '文件夹',
                description: 'AI 自动创建',
                createdAt: Date.now(),
                type: 'folder',
                parentId: (call.args.parentId === 'root' || !call.args.parentId) ? undefined : call.args.parentId
              };
              newBookmarks.unshift(folder);
              changed = true;
              bookmarkDisplay = `✅ 创建了文件夹 "${call.args.title}"`;
              bookmarkResult = folder;
              break;
            case 'moveBookmarks':
              let targetId = call.args.targetFolderId;
              if (targetId && targetId !== 'root') {
                const folderByTitle = newBookmarks.find(b => b.type === 'folder' && b.title === targetId);
                const folderById = newBookmarks.find(b => b.id === targetId);
                if (!folderById && folderByTitle) {
                  targetId = folderByTitle.id;
                } else if (!folderById && !folderByTitle) {
                  const newFolderId = Math.random().toString(36).substr(2, 9);
                  newBookmarks.unshift({
                    id: newFolderId,
                    title: targetId,
                    url: '',
                    category: '文件夹',
                    description: 'AI 自动创建',
                    createdAt: Date.now(),
                    type: 'folder'
                  });
                  targetId = newFolderId;
                }
              }
              newBookmarks = newBookmarks.map(b => {
                if (call.args.bookmarkIds.includes(b.id) || call.args.bookmarkIds.includes(b.title)) {
                  return { ...b, parentId: (targetId === 'root' || !targetId) ? undefined : targetId };
                }
                return b;
              });
              changed = true;
              bookmarkDisplay = `✅ 移动了 ${call.args.bookmarkIds?.length || 0} 个内容`;
              bookmarkResult = { success: true };
              break;
            case 'updateBookmarksCategory':
              newBookmarks = newBookmarks.map(b => {
                if (call.args.bookmarkIds.includes(b.id) || call.args.bookmarkIds.includes(b.title)) {
                  return { ...b, category: call.args.category };
                }
                return b;
              });
              changed = true;
              bookmarkDisplay = `✅ 更新了分类为 "${call.args.category}"`;
              bookmarkResult = { success: true };
              break;
            case 'deleteBookmarks':
              newBookmarks = newBookmarks.filter(b => !call.args.bookmarkIds.includes(b.id) && !call.args.bookmarkIds.includes(b.title));
              changed = true;
              bookmarkDisplay = `✅ 删除了 ${call.args.bookmarkIds?.length || 0} 个内容`;
              bookmarkResult = { success: true };
              break;
          }
          
          if (changed && config.type === 'github' && config.github?.syncBookmarks) {
            storage.syncToGithub(config, { bookmarks: newBookmarks, profile, content: markdownContent });
          }
          return changed ? newBookmarks : prev;
        });

        results.push({ name: call.name, result: bookmarkResult, display: bookmarkDisplay });

      } catch (error) {
        console.error(`AI Function Call Error (${call.name}):`, error);
        results.push({ name: call.name, result: { error: String(error) }, display: `❌ 执行 "${call.name}" 时出错: ${error instanceof Error ? error.message : '未知错误'}` });
      }
    }
    return results;
  };

  useEffect(() => {
    if (newBookmark.url?.trim() && !newBookmark.title && !isAnalyzing && activeAIModel?.apiKey && newBookmark.type === 'link') {
      const timer = setTimeout(() => {
        handleAnalyzeUrl();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [newBookmark.url]);

  const handleAnalyzeUrl = async () => {
    if (!newBookmark.url?.trim()) {
      setAnalysisError('请先输入 URL');
      return;
    }

    if (!activeAIModel?.apiKey) {
      setAnalysisError(
        <span>
          未配置 AI 模型。请在“AI 助手”中添加模型，或输入 <button 
            className="text-indigo-600 underline font-bold"
            onClick={() => {
              const demoModel: AIModelConfig = { id: 'demo', name: '演示模型', apiKey: 'demo' };
              const newConfig: StorageConfig = { ...config, aiModels: [demoModel], activeAIId: 'demo' };
              setConfig(newConfig);
              storage.saveConfig(newConfig);
              setAnalysisError(null);
            }}
          >一键开启演示模式</button>
        </span>
      );
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeUrl(activeAIModel, newBookmark.url.trim(), folders);
      if (result) {
        setNewBookmark(prev => ({
          ...prev,
          title: result.title || prev.title,
          description: result.description || prev.description,
          category: result.category || prev.category,
          parentId: result.folderId === 'root' ? undefined : (result.folderId || prev.parentId)
        }));
      } else {
        setAnalysisError('AI 未能返回有效数据，请手动填写。');
      }
    } catch (error) {
      console.error("Analysis failed:", error);
      setAnalysisError(`分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImportHtml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const html = event.target?.result as string;
      if (html) {
        const imported = parseBookmarkHtml(html);
        if (imported.length > 0) {
          setBookmarks(prev => [...imported, ...prev]);
          alert(`成功导入 ${imported.length} 条内容！`);
        } else {
          alert('未能识别有效的书签内容，请确保文件格式正确。');
        }
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const downloadMd = () => {
    const data: AppData = { bookmarks, profile, content: markdownContent };
    const blob = new Blob([storage.stringifyToMd(data)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wangli.md';
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-zinc-50 pb-20 md:pb-0">
      {/* Desktop Sidebar / Mobile Top Bar */}
      <nav className="w-full md:w-20 lg:w-64 glass md:h-screen sticky top-0 z-40 flex md:flex-col items-center justify-between p-4 md:py-8 border-b md:border-b-0 md:border-r border-slate-200/50">
        <div className="flex items-center gap-3 lg:w-full lg:px-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <LayoutGrid size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">WangLI</span>
        </div>

        <div className="hidden md:flex md:flex-col gap-4">
          <NavButton 
            active={activeTab === 'bookmarks'} 
            onClick={() => setActiveTab('bookmarks')}
            icon={<Globe size={20} />}
            label="收藏夹"
          />
          <NavButton 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')}
            icon={<User size={20} />}
            label="个人资料"
          />
          <NavButton 
            active={activeTab === 'ai'} 
            onClick={() => setActiveTab('ai')}
            icon={<Sparkles size={20} />}
            label="AI 助手"
          />
          <NavButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            icon={<Settings size={20} />}
            label="设置"
          />
        </div>

        <div className="flex items-center gap-4 lg:w-full lg:px-4">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-500/20">
            <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-slate-200/50 px-6 py-3 flex items-center justify-between">
        <MobileNavButton 
          active={activeTab === 'bookmarks'} 
          onClick={() => setActiveTab('bookmarks')}
          icon={<Globe size={22} />}
          label="收藏"
        />
        <MobileNavButton 
          active={activeTab === 'profile'} 
          onClick={() => setActiveTab('profile')}
          icon={<User size={22} />}
          label="资料"
        />
        <MobileNavButton 
          active={activeTab === 'ai'} 
          onClick={() => setActiveTab('ai')}
          icon={<Sparkles size={22} />}
          label="AI"
        />
        <MobileNavButton 
          active={activeTab === 'settings'} 
          onClick={() => setActiveTab('settings')}
          icon={<Settings size={22} />}
          label="设置"
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'bookmarks' && (
            <motion.div
              key="bookmarks"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 md:gap-8 mb-8 md:mb-12">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {currentFolderId && (
                      <button 
                        onClick={() => {
                          const parent = bookmarks.find(b => b.id === currentFolderId)?.parentId;
                          setCurrentFolderId(parent || null);
                        }}
                        className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center hover:bg-white hover:shadow-sm rounded-xl md:rounded-2xl text-slate-400 transition-all border border-transparent hover:border-slate-100"
                      >
                        <ChevronLeft size={20} />
                      </button>
                    )}
                    <h1 
                      className={cn(
                        "text-3xl md:text-5xl font-black tracking-tight text-slate-900",
                        currentFolderId ? "cursor-pointer hover:text-indigo-600 transition-colors" : ""
                      )}
                      onClick={() => currentFolderId && setCurrentFolderId(null)}
                    >
                      {currentFolderId ? bookmarks.find(b => b.id === currentFolderId)?.title : '我的收藏'}
                    </h1>
                  </div>
                  <p className="text-slate-500 text-sm md:text-base font-medium max-w-md">数据将以 Markdown 格式存储，透明且安全。您的数字资产，由您掌控。</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <input 
                    type="file" 
                    id="html-import" 
                    accept=".html" 
                    className="hidden" 
                    onChange={handleImportHtml} 
                  />
                  <button 
                    onClick={() => document.getElementById('html-import')?.click()}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-white border border-slate-100 text-slate-600 text-sm md:text-base font-medium rounded-xl md:rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                  >
                    <Upload size={18} />
                    <span>导入</span>
                  </button>
                  <button 
                    onClick={downloadMd}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-white border border-slate-100 text-slate-600 text-sm md:text-base font-medium rounded-xl md:rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                  >
                    <Download size={18} />
                    <span>导出</span>
                  </button>
                  <button 
                    onClick={() => {
                      setNewBookmark({ title: '', url: '', category: '常用', description: '', type: 'folder', parentId: currentFolderId || undefined, icon: '' });
                      setIsAddModalOpen(true);
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-white border border-slate-100 text-slate-600 text-sm md:text-base font-medium rounded-xl md:rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                  >
                    <Folder size={18} />
                    <span>文件夹</span>
                  </button>
                  <button 
                    onClick={() => {
                      setNewBookmark({ title: '', url: '', category: '常用', description: '', type: 'link', parentId: currentFolderId || undefined, icon: '' });
                      setIsAddModalOpen(true);
                    }}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 md:px-7 py-3 bg-indigo-600 text-white text-sm md:text-base font-medium rounded-xl md:rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95"
                  >
                    <Plus size={20} />
                    <span>新建</span>
                  </button>
                </div>
              </header>

              {/* Search and Filter */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 mb-8 md:mb-10">
                <div className="lg:col-span-5 relative group">
                  <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                  <input 
                    type="text" 
                    placeholder="搜索书签、URL 或描述..." 
                    className="w-full h-12 md:h-14 pl-12 md:pl-14 pr-6 bg-white border border-slate-200 rounded-xl md:rounded-[1.25rem] outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm text-sm md:text-base"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="lg:col-span-7 flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar px-1">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold transition-all whitespace-nowrap border",
                        selectedCategory === cat 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/30" 
                          : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              <div className="space-y-12">
                {/* Folders Section */}
                {filteredBookmarks.filter(b => b.type === 'folder').length > 0 && (
                  <section>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Folder size={16} /> 文件夹
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                      {filteredBookmarks.filter(b => b.type === 'folder').map(bookmark => (
                        <BookmarkCard 
                          key={bookmark.id} 
                          bookmark={bookmark} 
                          onDelete={() => handleDeleteBookmark(bookmark.id)}
                          onEdit={() => handleEditBookmark(bookmark)}
                          onOpenFolder={() => {
                            setCurrentFolderId(bookmark.id);
                            setSearchQuery('');
                          }}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Bookmarks Section */}
                <section>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Globe size={16} /> 书签
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {filteredBookmarks.filter(b => b.type === 'link').map(bookmark => (
                      <BookmarkCard 
                        key={bookmark.id} 
                        bookmark={bookmark} 
                        onDelete={() => handleDeleteBookmark(bookmark.id)}
                        onEdit={() => handleEditBookmark(bookmark)}
                        onOpenFolder={() => {
                          setCurrentFolderId(bookmark.id);
                          setSearchQuery('');
                        }}
                      />
                    ))}
                    {filteredBookmarks.length === 0 && (
                      <div className="col-span-full py-32 text-center bg-white/40 backdrop-blur-sm rounded-[3rem] border-2 border-dashed border-slate-200">
                        <div className="w-24 h-24 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 flex items-center justify-center mx-auto mb-8 text-indigo-500">
                          <BookMarked size={48} strokeWidth={1.5} />
                        </div>
                        <h4 className="text-xl font-bold text-slate-800 mb-2">这里空空如也</h4>
                        <p className="text-slate-400 max-w-xs mx-auto">暂无内容，点击上方“新建”按钮开始您的收藏之旅</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="glass rounded-[2.5rem] overflow-hidden relative">
                {/* Edit Toggle Button */}
                <button 
                  onClick={() => setIsEditingProfile(!isEditingProfile)}
                  className="absolute top-6 right-6 z-10 w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-all shadow-lg"
                  title={isEditingProfile ? "取消编辑" : "编辑个人资料"}
                >
                  {isEditingProfile ? <X size={20} /> : <Edit3 size={20} />}
                </button>

                <div className="h-48 bg-gradient-to-r from-indigo-500 to-purple-600 relative">
                  <div className="absolute -bottom-16 left-12 p-1 bg-white rounded-3xl shadow-xl group">
                    <img 
                      src={profile.avatar} 
                      alt="Avatar" 
                      className="w-32 h-32 rounded-[1.25rem] object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {isEditingProfile && (
                      <div className="absolute inset-0 bg-black/40 rounded-[1.25rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <Plus size={24} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-20 pb-12 px-12">
                  {isEditingProfile ? (
                    <div className="space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">姓名</label>
                          <input 
                            type="text" 
                            className="input-field" 
                            value={profile.name || ''}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">头像</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              className="input-field flex-1" 
                              placeholder="输入头像 URL..."
                              value={profile.avatar || ''}
                              onChange={(e) => setProfile({ ...profile, avatar: e.target.value })}
                            />
                            <label className="btn-secondary flex-shrink-0 cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
                              <Upload size={18} />
                              <span className="hidden sm:inline">上传</span>
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      const base64 = event.target?.result as string;
                                      setProfile({ ...profile, avatar: base64 });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">简介</label>
                        <input 
                          type="text" 
                          className="input-field" 
                          value={profile.bio || ''}
                          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">社交链接 (DIY)</label>
                          <button 
                            onClick={() => {
                              const newLinks = [...profile.links, { name: '新链接', url: '', icon: 'Link' }];
                              setProfile({ ...profile, links: newLinks });
                            }}
                            className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:underline"
                          >
                            <Plus size={14} /> 添加链接
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          {profile.links.map((link, idx) => (
                            <div key={idx} className="flex flex-col md:flex-row gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group">
                              <button 
                                onClick={() => {
                                  const newLinks = profile.links.filter((_, i) => i !== idx);
                                  setProfile({ ...profile, links: newLinks });
                                }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg z-10"
                              >
                                <X size={12} />
                              </button>
                              
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">名称</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    placeholder="例如: GitHub"
                                    value={link.name || ''}
                                    onChange={(e) => {
                                      const newLinks = [...profile.links];
                                      newLinks[idx] = { ...newLinks[idx], name: e.target.value };
                                      setProfile({ ...profile, links: newLinks });
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">图标 (Lucide 名称)</label>
                                  <div className="flex gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                      {renderIcon(link.icon)}
                                    </div>
                                    <input 
                                      type="text" 
                                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                                      placeholder="例如: Github"
                                      value={link.icon || ''}
                                      onChange={(e) => {
                                        const newLinks = [...profile.links];
                                        newLinks[idx] = { ...newLinks[idx], icon: e.target.value };
                                        setProfile({ ...profile, links: newLinks });
                                      }}
                                    />
                                    <a 
                                      href="https://lucide.dev/icons" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="p-2 text-slate-400 hover:text-indigo-600"
                                      title="查看图标列表"
                                    >
                                      <HelpCircle size={16} />
                                    </a>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">URL 链接</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    placeholder="https://..."
                                    value={link.url || ''}
                                    onChange={(e) => {
                                      const newLinks = [...profile.links];
                                      newLinks[idx] = { ...newLinks[idx], url: e.target.value };
                                      setProfile({ ...profile, links: newLinks });
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          {profile.links.length === 0 && (
                            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <p className="text-sm text-slate-400">暂无社交链接，点击上方“添加链接”开始 DIY</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <FileText size={14} /> Markdown 内容 (DIY 区域)
                        </label>
                        <textarea 
                          className="input-field min-h-[300px] font-mono text-sm leading-relaxed p-6"
                          value={markdownContent}
                          onChange={(e) => setMarkdownContent(e.target.value)}
                          placeholder="在这里输入您的 Markdown 内容..."
                        />
                      </div>

                      <button 
                        onClick={() => {
                          setIsEditingProfile(false);
                          addToast('个人资料已保存', 'success');
                        }}
                        className="btn-primary w-full py-4 flex items-center justify-center gap-2"
                      >
                        <Save size={20} /> 完成 DIY
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                        <div>
                          <h1 className="text-4xl font-bold mb-2 text-slate-800">{profile.name}</h1>
                          <p className="text-xl text-slate-500">{profile.bio}</p>
                        </div>
                        <div className="flex flex-wrap gap-4">
                          {profile.links.map((link, idx) => (
                            <motion.a 
                              key={idx} 
                              href={link.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              whileHover={{ y: -4, scale: 1.05 }}
                              className="flex items-center gap-3 px-5 py-3 glass rounded-2xl text-slate-600 hover:text-indigo-600 transition-all shadow-sm group border border-slate-200"
                            >
                              <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-indigo-50 transition-colors">
                                {renderIcon(link.icon, 20)}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">{link.name}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-bold">访问</span>
                                  <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </div>
                            </motion.a>
                          ))}
                        </div>
                      </div>

                      <div className="prose prose-slate max-w-none bg-white p-10 rounded-[2rem] border border-slate-100 shadow-sm mb-8">
                        <div className="flex items-center justify-between mb-6">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <FileText size={14} /> Markdown 内容
                          </span>
                        </div>
                        <Markdown>{markdownContent}</Markdown>
                      </div>

                      {/* GitHub File Explorer Section */}
                      {config.type === 'github' ? (
                        <div className="bg-white p-10 rounded-[2rem] border border-slate-100 shadow-sm">
                          <div className="flex items-center justify-between mb-8">
                            <div>
                              <h3 className="text-2xl font-bold text-slate-800">GitHub 笔记本</h3>
                              <p className="text-slate-500 text-sm">直接管理您的 GitHub 仓库文件</p>
                              <div className="flex gap-4 mt-4">
                                <select 
                                  className="input-field text-xs" 
                                  value={config.github?.notebookRepo || ''}
                                  onChange={(e) => {
                                    const repo = e.target.value;
                                    const selectedRepo = githubRepos.find(r => r.full_name === repo);
                                    const defaultBranch = selectedRepo?.default_branch || 'main';
                                    const newConfig = {
                                      ...config,
                                      github: { 
                                        ...(config.github || { token: '', repo: '', branch: 'main', path: 'zenspace.md' }), 
                                        notebookRepo: repo,
                                        notebookBranch: defaultBranch
                                      }
                                    };
                                    setConfig(newConfig);
                                    if (repo) {
                                      fetchGithubBranches(repo);
                                      loadProfileFiles('', newConfig);
                                    }
                                  }}
                                >
                                  <option value="">选择仓库</option>
                                  {githubRepos.map(r => <option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}
                                </select>
                                <select 
                                  className="input-field text-xs" 
                                  value={config.github?.notebookBranch || config.github?.branch || 'main'}
                                  onChange={(e) => {
                                    const newConfig = {
                                      ...config,
                                      github: { ...(config.github || { token: '', repo: '', branch: 'main', path: 'zenspace.md' }), notebookBranch: e.target.value }
                                    };
                                    setConfig(newConfig);
                                    loadProfileFiles('', newConfig);
                                  }}
                                >
                                  {githubBranches.map(b => (
                                    <option key={b.name} value={b.name}>{b.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <motion.button 
                              onClick={() => loadProfileFiles()}
                              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
                              whileTap={{ scale: 0.95 }}
                              className="w-10 h-10 glass rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all shadow-sm"
                              title="刷新文件列表"
                              disabled={isFetchingFiles}
                            >
                              <RotateCw size={18} className={cn(isFetchingFiles && "animate-spin text-indigo-600")} />
                            </motion.button>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* File Tree */}
                            <div className="lg:col-span-4 space-y-4 max-h-[600px] overflow-y-auto no-scrollbar pr-2">
                              <div className="flex items-center gap-2 mb-2">
                                <button 
                                  onClick={() => handleCreateNew('file')}
                                  className="w-10 h-10 glass rounded-xl text-slate-600 hover:text-indigo-600 flex items-center justify-center transition-all"
                                  title="新建文件"
                                >
                                  <FilePlus size={18} />
                                </button>
                                <button 
                                  onClick={() => handleCreateNew('folder')}
                                  className="w-10 h-10 glass rounded-xl text-slate-600 hover:text-indigo-600 flex items-center justify-center transition-all"
                                  title="新建文件夹"
                                >
                                  <FolderPlus size={18} />
                                </button>
                                <label className="w-10 h-10 glass rounded-xl text-slate-600 hover:text-indigo-600 flex items-center justify-center transition-all cursor-pointer" title="上传文件/照片">
                                  <Upload size={18} />
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    multiple 
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files || []);
                                      files.forEach(file => handleFileUpload(file));
                                    }} 
                                  />
                                </label>
                              </div>
                              
                              <div 
                                className={cn(
                                  "space-y-1 min-h-[200px] rounded-2xl transition-all border-2 border-transparent",
                                  isDragging && "border-indigo-400 bg-indigo-50/30 border-dashed"
                                )}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                              >
                                {isFetchingFiles && profileFiles.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                                    <p className="text-sm">正在加载 GitHub 文件...</p>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    {profileFiles.map(node => (
                                      <FileTreeNode 
                                        key={node.path} 
                                        node={node} 
                                        expandedFolders={expandedFolders}
                                        onToggle={handleFileClick}
                                        onDelete={handleDeleteFile}
                                        onCreate={handleCreateNew}
                                        onUpload={handleFileUpload}
                                        selectedPath={selectedFile?.path}
                                      />
                                    ))}
                                    {profileFiles.length === 0 && !isFetchingFiles && (
                                      <p className="text-sm text-slate-400 text-center py-8">未找到文件，或拖拽文件至此上传</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* File Preview/Editor */}
                            <div className="lg:col-span-8 bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
                              {selectedFile ? (
                                <>
                                  <div className="bg-white px-6 py-4 border-bottom border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      {selectedFile.type === 'folder' ? <Folder size={18} className="text-indigo-500" /> : 
                                       selectedFile.type === 'image' ? <Image size={18} className="text-emerald-500" /> : 
                                       <File size={18} className="text-slate-400" />}
                                      <span className="font-bold text-slate-700">{selectedFile.name}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      {selectedFile.type === 'file' && (
                                        <button 
                                          onClick={handleSaveFile}
                                          disabled={isFetchingFiles}
                                          className="btn-primary py-2 px-4 text-xs flex items-center gap-2"
                                        >
                                          {isFetchingFiles ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
                                          保存
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => setSelectedFile(null)}
                                        className="p-2 text-slate-400 hover:text-rose-500"
                                      >
                                        <X size={18} />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex-1 overflow-y-auto p-6">
                                    {selectedFile.type === 'file' ? (
                                      <textarea 
                                        className="w-full h-full bg-transparent border-none outline-none font-mono text-sm leading-relaxed resize-none"
                                        value={selectedFile.content || ''}
                                        onChange={(e) => setSelectedFile({ ...selectedFile, content: e.target.value })}
                                        spellCheck={false}
                                      />
                                    ) : selectedFile.type === 'image' ? (
                                      <div className="flex items-center justify-center h-full">
                                        <img 
                                          src={selectedFile.url} 
                                          alt={selectedFile.name} 
                                          className="max-w-full max-h-full rounded-xl shadow-lg"
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                        <Folder size={48} className="mb-4 opacity-20" />
                                        <p>这是一个文件夹</p>
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
                                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                                    <FileText size={32} className="opacity-20" />
                                  </div>
                                  <h4 className="text-lg font-bold text-slate-600 mb-2">选择一个文件进行查看</h4>
                                  <p className="text-sm max-w-xs">您可以查看和编辑 Markdown 笔记，或者预览仓库中的图片。</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 p-10 rounded-[2rem] border border-dashed border-slate-200 text-center">
                          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                            <Github size={32} className="text-slate-300" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-700 mb-2">开启 GitHub 笔记本</h3>
                          <p className="text-slate-500 mb-6 max-w-md mx-auto">
                            在“设置”中开启 GitHub 同步，即可直接在此管理您的 GitHub 仓库文件，实现笔记、图片和文档的云端同步。
                          </p>
                          <button 
                            onClick={() => setActiveTab('settings')}
                            className="btn-primary py-3 px-8 rounded-2xl"
                          >
                            前往设置
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <h1 className="text-4xl font-bold mb-8">系统设置</h1>
              
              <div className="space-y-4">
                {/* Theme Configuration Section */}
                <section className="glass overflow-hidden rounded-3xl border border-slate-100/50 shadow-sm">
                  <button 
                    onClick={() => setActiveSettingsSection(activeSettingsSection === 'theme' ? null : 'theme')}
                    className="w-full p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2.5 rounded-2xl transition-colors",
                        activeSettingsSection === 'theme' ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500"
                      )}>
                        <Palette size={22} />
                      </div>
                      <div className="text-left">
                        <h2 className="text-lg font-bold text-slate-800">个性化主题</h2>
                        <p className="text-xs text-slate-500">选择您喜欢的界面风格</p>
                      </div>
                    </div>
                    <ChevronDown 
                      size={20} 
                      className={cn("text-slate-400 transition-transform duration-300", activeSettingsSection === 'theme' && "rotate-180")} 
                    />
                  </button>
                  
                  <AnimatePresence>
                    {activeSettingsSection === 'theme' && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                      >
                        <div className="p-8 pt-0 grid grid-cols-2 gap-4 border-t border-slate-50">
                          {[
                            { id: 'light', name: '明亮模式', icon: <Sun size={20} />, colors: ['#ffffff', '#fafafa', '#4f46e5'] },
                            { id: 'dark', name: '深色模式', icon: <Moon size={20} />, colors: ['#1e293b', '#0f172a', '#6366f1'] },
                            { id: 'sepia', name: '护眼模式', icon: <Coffee size={20} />, colors: ['#fdf6e3', '#f4ecd8', '#d35400'] },
                            { id: 'ocean', name: '深海模式', icon: <Waves size={20} />, colors: ['#14284b', '#0c1b33', '#0ea5e9'] },
                          ].map((theme) => (
                            <button
                              key={theme.id}
                              onClick={() => {
                                const newConfig = { ...config, theme: theme.id as any };
                                setConfig(newConfig);
                                storage.saveConfig(newConfig);
                              }}
                              className={cn(
                                "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all group",
                                config.theme === theme.id || (!config.theme && theme.id === 'light')
                                  ? "border-indigo-600 bg-indigo-50/30" 
                                  : "border-slate-100 hover:border-indigo-200 hover:bg-slate-50"
                              )}
                            >
                              <div className="flex gap-1">
                                {theme.colors.map((c, i) => (
                                  <div key={i} className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: c }} />
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "transition-colors",
                                  config.theme === theme.id || (!config.theme && theme.id === 'light') ? "text-indigo-600" : "text-slate-500 group-hover:text-indigo-500"
                                )}>
                                  {theme.icon}
                                </span>
                                <span className="text-sm font-bold">{theme.name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

                {/* Sync Configuration Section */}
                <section className="glass overflow-hidden rounded-3xl border border-slate-100/50 shadow-sm">
                  <button 
                    onClick={() => setActiveSettingsSection(activeSettingsSection === 'sync' ? null : 'sync')}
                    className="w-full p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2.5 rounded-2xl transition-colors",
                        activeSettingsSection === 'sync' ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500"
                      )}>
                        <Cloud size={22} />
                      </div>
                      <div className="text-left">
                        <h2 className="text-lg font-bold text-slate-800">Markdown 同步配置</h2>
                        <p className="text-xs text-slate-500">配置 GitHub 仓库以实现多端数据同步</p>
                      </div>
                    </div>
                    <ChevronDown 
                      size={20} 
                      className={cn("text-slate-400 transition-transform duration-300", activeSettingsSection === 'sync' && "rotate-180")} 
                    />
                  </button>
                  
                  <AnimatePresence>
                    {activeSettingsSection === 'sync' && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                      >
                        <div className="p-8 pt-0 space-y-6 border-t border-slate-50">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <div>
                                <p className="font-semibold">存储模式</p>
                                <p className="text-sm text-slate-500">数据将保存为 .md 文件</p>
                              </div>
                              <select 
                                value={config.type}
                                onChange={(e) => setConfig({ ...config, type: e.target.value as any })}
                                className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50"
                              >
                                <option value="local">本地缓存</option>
                                <option value="github">GitHub 同步</option>
                              </select>
                            </div>

                            {config.type === 'github' && (
                              <div className="space-y-4 pt-4">
                                <div className="space-y-2">
                                  <label className="text-sm font-medium text-slate-600">GitHub Token</label>
                                  <div className="flex gap-2">
                                    <input 
                                      type="password" 
                                      className="input-field" 
                                      placeholder="ghp_xxxxxxxxxxxx"
                                      value={config.github?.token || ''}
                                      onChange={(e) => setConfig({
                                        ...config,
                                        github: { ...(config.github || { repo: '', branch: 'main', path: 'zenspace.md' }), token: e.target.value }
                                      })}
                                    />
                                    <button 
                                      onClick={fetchGithubRepos}
                                      disabled={isFetchingGithub || !config.github?.token}
                                      className="btn-secondary px-4 py-2 whitespace-nowrap flex items-center gap-2"
                                    >
                                      {isFetchingGithub ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> : <Download size={16} />}
                                      加载仓库
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-600">仓库 (User/Repo)</label>
                                    {githubRepos.length > 0 ? (
                                      <select 
                                        className="input-field"
                                        value={config.github?.repo || ''}
                                        onChange={(e) => {
                                          const repo = e.target.value;
                                          const selectedRepo = githubRepos.find(r => r.full_name === repo);
                                          const defaultBranch = selectedRepo?.default_branch || 'main';
                                          setConfig({
                                            ...config,
                                            github: { 
                                              ...(config.github || { token: '', branch: 'main', path: 'zenspace.md' }), 
                                              repo,
                                              branch: defaultBranch
                                            }
                                          });
                                          if (repo) {
                                            fetchGithubBranches(repo);
                                          }
                                        }}
                                      >
                                        <option value="">选择仓库</option>
                                        {githubRepos.map(r => (
                                          <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input 
                                        type="text" 
                                        className="input-field" 
                                        placeholder="username/repo"
                                        value={config.github?.repo || ''}
                                        onChange={(e) => setConfig({
                                          ...config,
                                          github: { ...(config.github || { token: '', branch: 'main', path: 'zenspace.md' }), repo: e.target.value }
                                        })}
                                      />
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-600">分支</label>
                                    {githubBranches.length > 0 ? (
                                      <select 
                                        className="input-field"
                                        value={config.github?.branch || 'main'}
                                        onChange={(e) => {
                                          const branch = e.target.value;
                                          setConfig({
                                            ...config,
                                            github: { ...(config.github || { token: '', repo: '', path: 'zenspace.md' }), branch }
                                          });
                                          if (config.github?.repo) {
                                            fetchGithubFiles(config.github.repo, branch);
                                          }
                                        }}
                                      >
                                        {githubBranches.map(b => (
                                          <option key={b.name} value={b.name}>{b.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input 
                                        type="text" 
                                        className="input-field" 
                                        placeholder="main"
                                        value={config.github?.branch || 'main'}
                                        onChange={(e) => setConfig({
                                          ...config,
                                          github: { ...(config.github || { token: '', repo: '', path: 'zenspace.md' }), branch: e.target.value }
                                        })}
                                      />
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium text-slate-600">存储路径 (.md)</label>
                                  <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                      {githubFiles.length > 0 ? (
                                        <select 
                                          className="input-field appearance-none"
                                          value={config.github?.path || 'zenspace.md'}
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              setConfig({
                                                ...config,
                                                github: { ...(config.github || { token: '', repo: '', branch: 'main' }), path: e.target.value }
                                              });
                                            }
                                          }}
                                        >
                                          <option value="">选择已有文件</option>
                                          {githubFiles.map(f => (
                                            <option key={f.path} value={f.path}>{f.name}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input 
                                          type="text" 
                                          className="input-field" 
                                          placeholder="zenspace.md"
                                          value={config.github?.path || 'zenspace.md'}
                                          onChange={(e) => setConfig({
                                            ...config,
                                            github: { ...(config.github || { token: '', repo: '', branch: 'main' }), path: e.target.value }
                                          })}
                                        />
                                      )}
                                      {githubFiles.length > 0 && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                          <ChevronDown size={16} />
                                        </div>
                                      )}
                                    </div>
                                    {githubFiles.length > 0 && (
                                      <button 
                                        onClick={() => {
                                          const newPath = prompt('请输入新的存储路径 (例如: data/my-sync.md):');
                                          if (newPath) {
                                            const formattedPath = newPath.endsWith('.md') ? newPath : `${newPath}.md`;
                                            setConfig({
                                              ...config,
                                              github: { ...(config.github || { token: '', repo: '', branch: 'main' }), path: formattedPath }
                                            });
                                          }
                                        }}
                                        className="btn-secondary px-3 py-2"
                                        title="输入新路径"
                                      >
                                        <PlusCircle size={18} />
                                      </button>
                                    )}
                                  </div>
                                  {githubFiles.length > 0 && config.github?.path && (
                                    <p className="text-[10px] text-slate-400 mt-1">当前选择: <span className="text-indigo-600 font-mono">{config.github.path}</span></p>
                                  )}
                                </div>
                                <div className="space-y-3 pt-2">
                                  <label className="text-sm font-medium text-slate-600 block">同步内容</label>
                                  <div className="flex flex-wrap gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                      <input 
                                        type="checkbox" 
                                        checked={config.github?.syncProfile !== false}
                                        onChange={(e) => setConfig({
                                          ...config,
                                          github: { ...(config.github || { token: '', repo: '', branch: 'main', path: 'zenspace.md' }), syncProfile: e.target.checked }
                                        })}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">个人资料 (Markdown)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                      <input 
                                        type="checkbox" 
                                        checked={config.github?.syncBookmarks !== false}
                                        onChange={(e) => setConfig({
                                          ...config,
                                          github: { ...(config.github || { token: '', repo: '', branch: 'main', path: 'zenspace.md' }), syncBookmarks: e.target.checked }
                                        })}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">收藏夹 (含分类/结构)</span>
                                    </label>
                                  </div>
                                </div>
                                
                                <div className="pt-4 border-t border-slate-100">
                                  <p className="text-xs text-slate-500">提示：您可以在“个人资料”选项卡中直接切换 GitHub 笔记本的仓库和分支。</p>
                                </div>

                                <div className="flex gap-3 pt-2">
                                  <button 
                                    onClick={handleSync}
                                    disabled={isFetchingFiles}
                                    className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isFetchingFiles ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    同步到 GitHub
                                  </button>
                                  <button 
                                    onClick={handlePull}
                                    disabled={isFetchingFiles}
                                    className="flex-1 btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isFetchingFiles ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                                    从 GitHub 加载
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

                {/* AI Assistant Permissions Section */}
                <section className="glass overflow-hidden rounded-3xl border border-slate-100/50 shadow-sm">
                  <button 
                    onClick={() => setActiveSettingsSection(activeSettingsSection === 'ai_permissions' ? null : 'ai_permissions')}
                    className="w-full p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2.5 rounded-2xl transition-colors",
                        activeSettingsSection === 'ai_permissions' ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500"
                      )}>
                        <Bot size={22} />
                      </div>
                      <div className="text-left">
                        <h2 className="text-lg font-bold text-slate-800">AI 助手权限设置</h2>
                        <p className="text-xs text-slate-500">控制 AI 助手可以访问和修改哪些内容</p>
                      </div>
                    </div>
                    <ChevronDown 
                      size={20} 
                      className={cn("text-slate-400 transition-transform duration-300", activeSettingsSection === 'ai_permissions' && "rotate-180")} 
                    />
                  </button>

                  <AnimatePresence>
                    {activeSettingsSection === 'ai_permissions' && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                      >
                        <div className="p-8 pt-0 space-y-6 border-t border-slate-50">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm">
                                  <User size={18} className="text-indigo-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800">个人资料访问</p>
                                  <p className="text-xs text-slate-500">允许 AI 查看姓名、简介等个人信息</p>
                                </div>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer"
                                  checked={config.aiPermissions?.profile !== false}
                                  onChange={(e) => setConfig({
                                    ...config,
                                    aiPermissions: { ...(config.aiPermissions || { profile: true, files: true, bookmarks: true, listRepos: true }), profile: e.target.checked }
                                  })}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm">
                                  <FileText size={18} className="text-indigo-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800">GitHub 文件修改</p>
                                  <p className="text-xs text-slate-500">允许 AI 修改 GitHub 仓库中的文件</p>
                                </div>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer"
                                  checked={config.aiPermissions?.files !== false}
                                  onChange={(e) => setConfig({
                                    ...config,
                                    aiPermissions: { ...(config.aiPermissions || { profile: true, files: true, bookmarks: true, listRepos: true }), files: e.target.checked }
                                  })}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm">
                                  <BookMarked size={18} className="text-indigo-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800">收藏夹访问</p>
                                  <p className="text-xs text-slate-500">允许 AI 查看和管理您的书签与文件夹</p>
                                </div>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer"
                                  checked={config.aiPermissions?.bookmarks !== false}
                                  onChange={(e) => setConfig({
                                    ...config,
                                    aiPermissions: { ...(config.aiPermissions || { profile: true, files: true, bookmarks: true, listRepos: true }), bookmarks: e.target.checked }
                                  })}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                            </div>
                            
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm">
                                  <Github size={18} className="text-indigo-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800">GitHub 仓库列表</p>
                                  <p className="text-xs text-slate-500">允许 AI 列出您的所有 GitHub 仓库</p>
                                </div>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer"
                                  checked={config.aiPermissions?.listRepos !== false}
                                  onChange={(e) => setConfig({
                                    ...config,
                                    aiPermissions: { ...(config.aiPermissions || { profile: true, files: true, bookmarks: true, listRepos: true }), listRepos: e.target.checked }
                                  })}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto h-[calc(100vh-12rem)] flex flex-col"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3 text-slate-800">
                    <Sparkles className="text-indigo-600" />
                    {activeAIModel?.name || 'AI 助手'}
                  </h1>
                  <p className="text-slate-500">管理多个 AI 模型并进行智能对话。</p>
                </div>
                <div className="flex gap-2">
                  <select 
                    value={config.activeAIId || ''}
                    onChange={(e) => handleSelectAIModel(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm"
                  >
                    {config.aiModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                    {config.aiModels.length === 0 && <option value="">请先添加模型</option>}
                  </select>
                  <button 
                    onClick={() => {
                      setEditingAIModel({ id: '', name: '', apiKey: '', apiUrl: '', model: 'gemini-3-flash-preview' });
                      setShowAIModelModal(true);
                    }}
                    className="btn-primary p-3 shadow-lg shadow-indigo-200"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
                {/* Sidebar: Sessions & Models */}
                <div className="w-full lg:w-80 flex flex-col gap-6 overflow-hidden">
                  {/* Sessions List */}
                  <div className="flex-1 glass rounded-[2.5rem] p-5 flex flex-col overflow-hidden border border-white/40 shadow-xl">
                    <div className="flex items-center justify-between mb-5 px-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">对话历史</h3>
                      <button 
                        onClick={handleNewChat}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all hover:scale-110 active:scale-95"
                        title="新对话"
                      >
                        <PlusSquare size={20} />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-1">
                      {chatSessions.map(session => (
                        <div 
                          key={session.id}
                          className={cn(
                            "group p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between relative overflow-hidden",
                            activeChatId === session.id ? "bg-indigo-50/80 border-indigo-200 shadow-sm" : "bg-white/60 border-slate-100 hover:border-indigo-100 hover:bg-white/80"
                          )}
                          onClick={() => {
                            if (editingSessionId !== session.id) {
                              setActiveChatId(session.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                              activeChatId === session.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-slate-100 text-slate-400"
                            )}>
                              <MessageSquare size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              {editingSessionId === session.id ? (
                                <input 
                                  autoFocus
                                  className="text-sm font-bold bg-white border border-indigo-200 rounded-lg px-2 py-1 w-full outline-none focus:ring-2 focus:ring-indigo-500/50"
                                  value={editingSessionTitle}
                                  onChange={(e) => setEditingSessionTitle(e.target.value)}
                                  onBlur={() => handleRenameChat(session.id, editingSessionTitle)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameChat(session.id, editingSessionTitle);
                                    if (e.key === 'Escape') setEditingSessionId(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <>
                                  <p className={cn("text-sm font-bold truncate", activeChatId === session.id ? "text-indigo-600" : "text-slate-700")}>
                                    {session.title}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {new Date(session.updatedAt).toLocaleDateString()}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingSessionId(session.id);
                                setEditingSessionTitle(session.title);
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors"
                              title="重命名"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleClearChat(session.id); }}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-white rounded-lg transition-colors"
                              title="删除对话"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Models List (Collapsible) */}
                  <div className={cn(
                    "glass rounded-[2.5rem] p-5 flex flex-col overflow-hidden border border-white/40 shadow-xl transition-all duration-300",
                    isAIModelsExpanded ? "flex-1" : "h-20"
                  )}>
                    <div 
                      className="flex items-center justify-between mb-4 px-2 cursor-pointer"
                      onClick={() => setIsAIModelsExpanded(!isAIModelsExpanded)}
                    >
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI 模型</h3>
                      <button className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg transition-colors">
                        {isAIModelsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    </div>
                    {isAIModelsExpanded && (
                      <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-1">
                        {config.aiModels.map(m => (
                          <div 
                            key={m.id}
                            className={cn(
                              "group p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                              config.activeAIId === m.id ? "bg-indigo-50/80 border-indigo-200 shadow-sm" : "bg-white/60 border-slate-100 hover:border-indigo-100 hover:bg-white/80"
                            )}
                            onClick={() => handleSelectAIModel(m.id)}
                          >
                            <div className="min-w-0 flex-1">
                              <p className={cn("text-xs font-bold truncate", config.activeAIId === m.id ? "text-indigo-600" : "text-slate-700")}>{m.name}</p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditingAIModel(m); setShowAIModelModal(true); }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors"
                              >
                                <Edit3 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col glass rounded-[2.5rem] overflow-hidden relative">
                  {!activeAIModel ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                      <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 text-indigo-600">
                        <Bot size={40} />
                      </div>
                      <h2 className="text-2xl font-bold mb-4 text-slate-800">未选择模型</h2>
                      <p className="text-slate-500 max-w-xs">请在左侧选择或点击上方按钮添加一个新的 AI 模型。</p>
                    </div>
                  ) : (
                    <>
                      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar relative">
                        {messages.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4">
                              <Sparkles size={32} />
                            </div>
                            <p className="text-slate-500">您可以问我关于您的书签或个人资料的问题。</p>
                          </div>
                        )}
                        {messages.map((msg, idx) => (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-start gap-4 max-w-[85%]",
                              msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                              msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-slate-100 text-indigo-600"
                            )}>
                              {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                            </div>
                            <div className={cn(
                              "p-4 rounded-2xl text-sm leading-relaxed group relative",
                              msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-slate-50 text-slate-700 rounded-tl-none border border-slate-100"
                            )}>
                              <Markdown>{msg.content}</Markdown>
                              {msg.role !== 'user' && (
                                <button 
                                  onClick={() => handleCopyMessage(msg.content, idx)}
                                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 border border-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 transition-all hover:text-indigo-600 hover:border-indigo-200 shadow-sm"
                                  title="复制内容"
                                >
                                  {copiedId === idx ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {isAILoading && (
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-indigo-600 animate-pulse">
                              <Bot size={20} />
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl rounded-tl-none border border-slate-100">
                              <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <AnimatePresence>
                          {showScrollButton && (
                            <motion.button
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              onClick={() => scrollToBottom()}
                              className="sticky bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm border border-indigo-100 text-indigo-600 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all z-20"
                            >
                              <ArrowDownCircle size={14} />
                              新消息，点击下滑
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="p-6 bg-white border-t border-slate-100">
                        <div className="flex gap-3">
                          <input 
                            type="text" 
                            className="input-field" 
                            placeholder={`向 ${activeAIModel.name} 提问...`}
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                          />
                          <button 
                            onClick={handleSendMessage}
                            disabled={isAILoading || !aiInput.trim()}
                            className="btn-primary p-4 shrink-0"
                          >
                            <Send size={20} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-lg glass p-8 rounded-[2rem] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">
                  {newBookmark.id 
                    ? (newBookmark.type === 'folder' ? '编辑文件夹' : '编辑书签') 
                    : (newBookmark.type === 'folder' ? '新建文件夹' : '添加新书签')}
                </h2>
                {newBookmark.type === 'link' && activeAIModel && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold">
                    <Bot size={12} />
                    {activeAIModel.name}
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                {newBookmark.type === 'link' && (
                  <div className="space-y-2">
                    <div className="relative group">
                      <input 
                        type="text" placeholder="URL" className="input-field pr-12"
                        value={newBookmark.url || ''} onChange={(e) => {
                          setNewBookmark({ ...newBookmark, url: e.target.value });
                          setAnalysisError(null);
                        }}
                      />
                      <button 
                        onClick={handleAnalyzeUrl}
                        disabled={isAnalyzing || !newBookmark.url?.trim()}
                        className={cn(
                          "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all disabled:opacity-50",
                          isAnalyzing ? "text-indigo-400" : "text-indigo-600 hover:bg-indigo-50 group-hover:scale-110"
                        )}
                        title="AI 智能分析网页内容"
                      >
                        {isAnalyzing ? (
                          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Wand2 size={20} />
                        )}
                      </button>
                    </div>
                    
                    {!isAnalyzing && !analysisError && newBookmark.url?.trim() && !newBookmark.title && (
                      <div 
                        onClick={handleAnalyzeUrl}
                        className="text-[10px] text-indigo-500 cursor-pointer hover:text-indigo-700 font-medium flex items-center gap-2 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100 border-dashed animate-in fade-in slide-in-from-top-1"
                      >
                        <Sparkles size={12} className="animate-pulse" />
                        检测到 URL，点击此处让 AI 自动填写标题和描述
                      </div>
                    )}
                    
                    {isAnalyzing && (
                      <div className="text-[10px] text-indigo-500 animate-pulse font-medium flex items-center gap-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                        <div className="flex gap-1">
                          <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce" />
                          <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        AI 正在深度分析网页内容并自动补全信息...
                      </div>
                    )}
                    
                    {analysisError && (
                      <div className="text-[10px] text-rose-500 font-medium flex items-center gap-2 bg-rose-50 p-2 rounded-lg">
                        <Info size={12} />
                        {analysisError}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">图标 (URL 或 上传)</label>
                    <button 
                      onClick={() => iconInputRef.current?.click()}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Upload size={12} /> 上传本地图标
                    </button>
                    <input 
                      type="file" 
                      ref={iconInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewBookmark({ ...newBookmark, icon: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                  <div className="flex gap-3 items-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {newBookmark.icon ? (
                        <img src={newBookmark.icon} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        newBookmark.type === 'folder' ? <Folder size={20} className="text-slate-300" /> : <Globe size={20} className="text-slate-300" />
                      )}
                    </div>
                    <input 
                      type="text" placeholder="图标 URL" className="input-field flex-1"
                      value={newBookmark.icon || ''} onChange={(e) => setNewBookmark({ ...newBookmark, icon: e.target.value })}
                    />
                  </div>
                </div>

                <input 
                  type="text" placeholder="名称" className="input-field"
                  value={newBookmark.title || ''} onChange={(e) => setNewBookmark({ ...newBookmark, title: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    type="text" placeholder="分类" className="input-field"
                    value={newBookmark.category || ''} onChange={(e) => setNewBookmark({ ...newBookmark, category: e.target.value })}
                  />
                  <select 
                    className="input-field"
                    value={newBookmark.parentId || ''}
                    onChange={(e) => setNewBookmark({ ...newBookmark, parentId: e.target.value || undefined })}
                  >
                    <option value="">根目录</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </select>
                </div>
                <textarea 
                  placeholder="描述" className="input-field min-h-[100px]"
                  value={newBookmark.description || ''} onChange={(e) => setNewBookmark({ ...newBookmark, description: e.target.value })}
                />
                <button 
                  onClick={handleAddBookmark} 
                  disabled={isAnalyzing || (newBookmark.type === 'folder' && !newBookmark.title?.trim()) || (newBookmark.type === 'link' && !newBookmark.url?.trim())}
                  className="w-full btn-primary py-4 disabled:opacity-50"
                >
                  {newBookmark.id 
                    ? '保存修改' 
                    : (newBookmark.type === 'folder' ? '创建文件夹' : '保存书签')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Model Modal */}
      <AnimatePresence>
        {showAIModelModal && editingAIModel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAIModelModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-lg glass p-8 rounded-[2rem] shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">{editingAIModel.id ? '编辑 AI 模型' : '添加 AI 模型'}</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">模型名称</label>
                  <input 
                    type="text" className="input-field" placeholder="例如: 我的 Gemini"
                    value={editingAIModel.name || ''} onChange={(e) => setEditingAIModel({ ...editingAIModel, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">API Key</label>
                  <input 
                    type="password" className="input-field" placeholder="您的 API 密钥"
                    value={editingAIModel.apiKey || ''} onChange={(e) => setEditingAIModel({ ...editingAIModel, apiKey: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-400 ml-1">
                    提示：如果没有 API Key，可以输入 <code className="bg-slate-100 px-1 rounded text-indigo-600">demo</code> 来开启演示模式进行功能验证。
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">API URL (可选)</label>
                  <input 
                    type="text" className="input-field" placeholder="留空则使用默认 Gemini"
                    value={editingAIModel.apiUrl || ''} onChange={(e) => setEditingAIModel({ ...editingAIModel, apiUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">模型标识符 (可选)</label>
                  <input 
                    type="text" className="input-field" placeholder="gemini-3-flash-preview"
                    value={editingAIModel.model || ''} onChange={(e) => setEditingAIModel({ ...editingAIModel, model: e.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={handleTestAIModel}
                    disabled={isTestingAI || !editingAIModel.apiKey}
                    className="flex-1 btn-secondary py-4 flex items-center justify-center gap-2"
                  >
                    {isTestingAI ? <Loader2 className="animate-spin" size={18} /> : <RotateCw size={18} />}
                    测试连接
                  </button>
                  <button 
                    onClick={handleSaveAIModel}
                    disabled={!editingAIModel.name}
                    className="flex-[2] btn-primary py-4"
                  >
                    保存模型
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3">
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={cn(
              "px-6 py-3 rounded-2xl shadow-xl border backdrop-blur-md flex items-center gap-3 min-w-[240px]",
              toast.type === 'success' ? "bg-emerald-500/90 border-emerald-400 text-white" :
              toast.type === 'error' ? "bg-rose-500/90 border-rose-400 text-white" :
              "bg-slate-800/90 border-slate-700 text-white"
            )}
          >
            {toast.type === 'success' && <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">✓</div>}
            {toast.type === 'error' && <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">!</div>}
            <span className="font-medium">{toast.message}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 md:gap-3 p-2 md:p-3 lg:px-4 lg:py-3 rounded-2xl transition-all duration-300 group relative",
        active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
      )}
    >
      <div className={cn("transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")}>{icon}</div>
      <span className="hidden lg:block font-medium">{label}</span>
      {active && (
        <motion.div layoutId="active-pill" className="absolute inset-0 bg-indigo-600 rounded-2xl -z-10" />
      )}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all duration-300 relative",
        active ? "text-indigo-600" : "text-slate-400"
      )}
    >
      <div className={cn("transition-transform duration-300", active ? "scale-110" : "")}>{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
      {active && (
        <motion.div 
          layoutId="mobile-active-dot" 
          className="absolute -bottom-1 w-1 h-1 bg-indigo-600 rounded-full" 
        />
      )}
    </button>
  );
}

function BookmarkCard({ bookmark, onDelete, onEdit, onOpenFolder }: { bookmark: Bookmark; onDelete: () => void; onEdit: () => void; onOpenFolder: () => void }) {
  const isFolder = bookmark.type === 'folder';
  const [iconError, setIconError] = React.useState(false);

  React.useEffect(() => {
    setIconError(false);
  }, [bookmark.icon, bookmark.url]);

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch (e) {
      return null;
    }
  };

  const favicon = !isFolder ? getFaviconUrl(bookmark.url) : null;
  
  return (
    <motion.div 
      layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -8 }}
      onClick={isFolder ? onOpenFolder : undefined}
      className={cn(
        "group relative bg-white rounded-2xl md:rounded-[2rem] p-4 md:p-6 transition-all duration-500 border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10",
        isFolder ? "cursor-pointer bg-gradient-to-br from-indigo-50/30 to-white" : ""
      )}
    >
      <div className="absolute top-3 right-3 md:top-4 md:right-4 flex md:flex-col gap-1 z-10">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }} 
          className="p-1.5 md:p-2 opacity-100 md:opacity-0 group-hover:opacity-100 text-slate-400 md:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg md:rounded-xl transition-all duration-300"
        >
          <Edit3 size={14} className="md:size-4" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }} 
          className="p-1.5 md:p-2 opacity-100 md:opacity-0 group-hover:opacity-100 text-slate-400 md:text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg md:rounded-xl transition-all duration-300"
        >
          <Trash2 size={14} className="md:size-4" />
        </button>
      </div>

      <div className="flex flex-col h-full">
        <div className="flex items-start gap-3 md:gap-4 mb-4 md:mb-5">
          <div className={cn(
            "w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner overflow-hidden shrink-0",
            isFolder ? "bg-indigo-50 text-indigo-600" : "bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
          )}>
            {bookmark.icon && !iconError ? (
              <img 
                src={bookmark.icon} 
                alt="" 
                className="w-full h-full object-cover"
                onError={() => setIconError(true)}
                referrerPolicy="no-referrer"
              />
            ) : isFolder ? (
              <Folder size={24} className="md:size-7" strokeWidth={1.5} />
            ) : (
              favicon && !iconError ? (
                <img 
                  src={favicon} 
                  alt="" 
                  className="w-full h-full object-cover rounded-xl md:rounded-2xl"
                  onError={() => setIconError(true)}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Globe size={24} className="md:size-7" />
              )
            )}
          </div>
          <div className="flex-1 min-w-0 pt-0.5 pr-12 md:pr-8">
            <h3 className="font-bold text-base md:text-lg leading-tight text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-1">
              {bookmark.title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn(
                "text-[9px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 rounded-md uppercase tracking-wider",
                isFolder ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"
              )}>
                {bookmark.category}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs md:text-sm text-slate-500 line-clamp-2 mb-4 md:mb-6 flex-1 leading-relaxed">
          {bookmark.description || '暂无描述'}
        </p>

        <div className="flex items-center justify-between pt-3 md:pt-4 border-t border-slate-50">
          <div className="flex items-center gap-1.5 text-slate-400">
            <BookMarked size={10} className="md:size-3" />
            <span className="text-[9px] md:text-[10px] font-medium font-mono">{new Date(bookmark.createdAt).toLocaleDateString()}</span>
          </div>
          
          {!isFolder ? (
            <a 
              href={bookmark.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 bg-slate-50 text-indigo-600 text-[10px] md:text-xs font-bold rounded-lg md:rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
            >
              访问 <ExternalLink size={10} className="md:size-3" />
            </a>
          ) : (
            <div className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 bg-indigo-50 text-indigo-600 text-[10px] md:text-xs font-bold rounded-lg md:rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
              打开 <ChevronRight size={10} className="md:size-3" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
