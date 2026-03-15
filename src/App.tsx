import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, Globe, Folder, Settings, User, 
  Github, Twitter, ExternalLink, Trash2, Save, 
  Cloud, Sparkles, ChevronRight, LayoutGrid,
  Info, LogOut, Menu, X, FileText, Download,
  Send, Bot, Key, Link as LinkIcon, Edit3,
  ChevronLeft, Wand2, PlusCircle, MoreVertical, BookMarked, Upload,
  Copy, Check, File, Image, ChevronDown, FolderPlus, FilePlus
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { Bookmark, TabType, UserProfile, StorageConfig, AppData, AIModelConfig, FileNode } from './types';
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
  selectedPath,
  level = 0 
}: { 
  node: FileNode; 
  expandedFolders: Set<string>; 
  onToggle: (node: FileNode) => void; 
  onDelete: (node: FileNode) => void;
  onCreate: (type: 'file' | 'folder', path: string) => void;
  selectedPath?: string;
  level?: number;
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;

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
              selectedPath={selectedPath}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('bookmarks');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [profile, setProfile] = useState<Omit<UserProfile, 'content'>>(storage.defaultProfile);
  const [markdownContent, setMarkdownContent] = useState(storage.defaultProfile.content);
  const [config, setConfig] = useState<StorageConfig>({ type: 'local', aiModels: [] });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  // AI State
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [showAIModelModal, setShowAIModelModal] = useState(false);
  const [editingAIModel, setEditingAIModel] = useState<AIModelConfig | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [analysisError, setAnalysisError] = useState<React.ReactNode | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  // GitHub Fetching State
  const [githubRepos, setGithubRepos] = useState<{ full_name: string }[]>([]);
  const [githubBranches, setGithubBranches] = useState<{ name: string }[]>([]);
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
    type: 'link'
  });

  useEffect(() => {
    // Initial load from local storage
    const localData = localStorage.getItem('zenspace_md_cache');
    if (localData) {
      const parsed = storage.parseFromMd(localData);
      setBookmarks(parsed.bookmarks);
      setProfile(parsed.profile);
      setMarkdownContent(parsed.content);
    } else {
      setBookmarks(storage.defaultBookmarks);
      setProfile(storage.defaultProfile);
      setMarkdownContent(storage.defaultProfile.content);
    }
    const loadedConfig = storage.loadConfig();
    setConfig(loadedConfig);
  }, []);

  // Save to local cache whenever data changes
  useEffect(() => {
    const data: AppData = { bookmarks, profile, content: markdownContent };
    localStorage.setItem('zenspace_md_cache', storage.stringifyToMd(data));
  }, [bookmarks, profile, markdownContent]);

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

    let finalTitle = newBookmark.title.trim();
    if (!finalTitle && newBookmark.url) {
      finalTitle = newBookmark.url.split('/').pop() || newBookmark.url;
    }
    
    const bookmark: Bookmark = {
      id: Math.random().toString(36).substr(2, 9),
      title: finalTitle || '未命名书签',
      url: newBookmark.type === 'folder' ? '' : (newBookmark.url?.trim().startsWith('http') ? newBookmark.url.trim() : `https://${newBookmark.url?.trim()}`),
      category: newBookmark.category?.trim() || '常用',
      description: newBookmark.description?.trim(),
      createdAt: Date.now(),
      type: newBookmark.type || 'link',
      parentId: newBookmark.parentId || undefined
    };
    
    setBookmarks([bookmark, ...bookmarks]);
    setIsAddModalOpen(false);
    
    // If title was empty, trigger AI analysis in background for the newly added bookmark
    if (!newBookmark.title.trim() && bookmark.type === 'link' && activeAIModel?.apiKey) {
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

    setNewBookmark({ title: '', url: '', category: '常用', description: '', type: 'link' });
  };

  const handleDeleteBookmark = (id: string) => {
    setBookmarks(bookmarks.filter(b => b.id !== id));
  };

  const handleSync = async () => {
    const data: AppData = { bookmarks, profile, content: markdownContent };
    const success = await storage.syncToGithub(config, data);
    if (success) {
      addToast('同步成功！您的 .md 文件已更新。', 'success');
    } else {
      addToast('同步失败，请检查 GitHub 配置。', 'error');
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
    
    let newModels = [...config.aiModels];
    const index = newModels.findIndex(m => m.id === editingAIModel.id);
    
    if (index >= 0) {
      newModels[index] = editingAIModel;
    } else {
      newModels.push({ ...editingAIModel, id: Math.random().toString(36).substr(2, 9) });
    }
    
    const newConfig = { 
      ...config, 
      aiModels: newModels,
      activeAIId: config.activeAIId || (newModels.length > 0 ? newModels[0].id : undefined)
    };
    setConfig(newConfig);
    storage.saveConfig(newConfig);
    setShowAIModelModal(false);
    setEditingAIModel(null);
    addToast('AI 模型配置已保存', 'success');
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
      }
    } catch (err) {
      console.error('Fetch branches failed', err);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const loadProfileFiles = async (path: string = '') => {
    if (!config.github?.token || !config.github?.repo) return;
    setIsFetchingFiles(true);
    try {
      const data = await storage.fetchGithubTree(config, path);
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
        if (!node.children) {
          await loadProfileFiles(node.path);
        }
      }
      setExpandedFolders(newExpanded);
    } else if (node.type === 'file') {
      setIsFetchingFiles(true);
      const fileData = await storage.fetchGithubFile(config, node.path);
      if (fileData) {
        setSelectedFile({ ...node, content: fileData.content, sha: fileData.sha });
      }
      setIsFetchingFiles(false);
    } else if (node.type === 'image') {
      setSelectedFile(node);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile || !config.github) return;
    setIsFetchingFiles(true);
    
    const { token, repo, branch } = config.github;
    const mdContent = selectedFile.content || '';
    
    try {
      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${selectedFile.path}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ${selectedFile.name} via ZenSpace`,
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
    const { token, repo, branch } = config.github;

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
            message: `Create ${name} via ZenSpace`,
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
            message: `Create folder ${name} via ZenSpace`,
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
    
    const { token, repo, branch } = config.github;
    setIsFetchingFiles(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${node.path}`, {
        method: 'DELETE',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Delete ${node.name} via ZenSpace`,
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
    if (activeTab === 'profile' && config.type === 'github' && profileFiles.length === 0) {
      loadProfileFiles();
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
    storage.saveConfig(newConfig);
  };

  const handleSelectAIModel = (id: string) => {
    const newConfig = { ...config, activeAIId: id };
    setConfig(newConfig);
    storage.saveConfig(newConfig);
  };

  const handleSendMessage = async () => {
    if (!aiInput.trim()) return;
    
    if (!activeAIModel?.apiKey) {
      setMessages(prev => [...prev, 
        { role: 'user', content: aiInput.trim() },
        { role: 'ai', content: '未配置 AI 模型或 API Key。请前往“AI 助手”选项卡进行设置，或者输入 "demo" 作为 API Key 来开启演示模式。' }
      ]);
      setAiInput('');
      return;
    }

    const userMsg = aiInput.trim();
    setAiInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAILoading(true);

    const context = `
      用户信息:
      姓名: ${profile.name}
      简介: ${profile.bio}
      
      收藏夹内容 (共 ${bookmarks.length} 条):
      ${bookmarks.map(b => `- [${b.type === 'folder' ? '文件夹' : '链接'}] ${b.title} (ID: ${b.id}, URL: ${b.url}, 分类: ${b.category}, 父文件夹ID: ${b.parentId || 'root'})`).join('\n')}
      
      个人主页笔记内容:
      ${markdownContent}
    `;

    const response = await chatWithAI(activeAIModel, userMsg, context);
    
    let finalContent = response.text;
    if (response.functionCalls && response.functionCalls.length > 0) {
      executeAIFunctionCalls(response.functionCalls);
      
      const actions = response.functionCalls.map(call => {
        if (call.name === 'createFolder') return `创建文件夹 "${call.args.title}"`;
        if (call.name === 'moveBookmarks') return `移动了 ${call.args.bookmarkIds?.length || 0} 个书签`;
        if (call.name === 'updateBookmarksCategory') return `更新了分类为 "${call.args.category}"`;
        if (call.name === 'deleteBookmarks') return `删除了 ${call.args.bookmarkIds?.length || 0} 个内容`;
        return '执行了管理操作';
      }).join('，');

      if (!finalContent) {
        finalContent = `✅ **操作成功**：${actions}。`;
      } else {
        finalContent = `${finalContent}\n\n---\n*💡 AI 助手已自动执行：${actions}*`;
      }
    }

    setMessages(prev => [...prev, { role: 'ai', content: finalContent || "AI 未返回内容" }]);
    setIsAILoading(false);
  };

  const executeAIFunctionCalls = (calls: { name: string, args: any }[]) => {
    setBookmarks(prev => {
      let newBookmarks = [...prev];
      let changed = false;

      calls.forEach(call => {
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
            break;
          case 'moveBookmarks':
            newBookmarks = newBookmarks.map(b => {
              if (call.args.bookmarkIds.includes(b.id)) {
                return { ...b, parentId: (call.args.targetFolderId === 'root' || !call.args.targetFolderId) ? undefined : call.args.targetFolderId };
              }
              return b;
            });
            changed = true;
            break;
          case 'updateBookmarksCategory':
            newBookmarks = newBookmarks.map(b => {
              if (call.args.bookmarkIds.includes(b.id)) {
                return { ...b, category: call.args.category };
              }
              return b;
            });
            changed = true;
            break;
          case 'deleteBookmarks':
            newBookmarks = newBookmarks.filter(b => !call.args.bookmarkIds.includes(b.id));
            changed = true;
            break;
        }
      });

      return changed ? newBookmarks : prev;
    });
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
    a.download = 'zenspace.md';
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f8fafc]">
      {/* Sidebar */}
      <nav className="w-full md:w-20 lg:w-64 glass md:h-screen sticky top-0 z-40 flex md:flex-col items-center justify-between p-4 md:py-8">
        <div className="flex items-center gap-3 lg:w-full lg:px-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <LayoutGrid size={24} />
          </div>
          <span className="hidden lg:block font-bold text-xl tracking-tight text-slate-800">ZenSpace</span>
        </div>

        <div className="flex md:flex-col gap-2 md:gap-4">
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

        <div className="hidden md:flex flex-col items-center gap-4 lg:w-full lg:px-4">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-500/20">
            <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 lg:p-12 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'bookmarks' && (
            <motion.div
              key="bookmarks"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {currentFolderId && (
                      <button 
                        onClick={() => {
                          const parent = bookmarks.find(b => b.id === currentFolderId)?.parentId;
                          setCurrentFolderId(parent || null);
                        }}
                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
                      >
                        <ChevronLeft size={20} />
                      </button>
                    )}
                    <h1 
                      className={cn(
                        "text-4xl font-bold tracking-tight",
                        currentFolderId ? "cursor-pointer hover:text-indigo-600 transition-colors" : ""
                      )}
                      onClick={() => currentFolderId && setCurrentFolderId(null)}
                    >
                      {currentFolderId ? bookmarks.find(b => b.id === currentFolderId)?.title : '我的收藏'}
                    </h1>
                  </div>
                  <p className="text-slate-500">数据将以 Markdown 格式存储，透明且安全。</p>
                </div>
                <div className="flex gap-3">
                  <input 
                    type="file" 
                    id="html-import" 
                    accept=".html" 
                    className="hidden" 
                    onChange={handleImportHtml} 
                  />
                  <button 
                    onClick={() => document.getElementById('html-import')?.click()}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Upload size={18} />
                    <span>导入 HTML</span>
                  </button>
                  <button 
                    onClick={downloadMd}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Download size={18} />
                    <span>导出 .md</span>
                  </button>
                  <button 
                    onClick={() => {
                      setNewBookmark({ title: '', url: '', category: '常用', description: '', type: 'folder', parentId: currentFolderId || undefined });
                      setIsAddModalOpen(true);
                    }}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Folder size={20} />
                    <span>新建文件夹</span>
                  </button>
                  <button 
                    onClick={() => {
                      setNewBookmark({ title: '', url: '', category: '常用', description: '', type: 'link', parentId: currentFolderId || undefined });
                      setIsAddModalOpen(true);
                    }}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={20} />
                    <span>添加书签</span>
                  </button>
                </div>
              </header>

              {/* Search and Filter */}
              <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="搜索书签或 URL..." 
                    className="input-field pl-12"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap",
                        selectedCategory === cat 
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filteredBookmarks.filter(b => b.type === 'folder').map(bookmark => (
                        <BookmarkCard 
                          key={bookmark.id} 
                          bookmark={bookmark} 
                          onDelete={() => handleDeleteBookmark(bookmark.id)}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredBookmarks.filter(b => b.type === 'link').map(bookmark => (
                      <BookmarkCard 
                        key={bookmark.id} 
                        bookmark={bookmark} 
                        onDelete={() => handleDeleteBookmark(bookmark.id)}
                        onOpenFolder={() => {
                          setCurrentFolderId(bookmark.id);
                          setSearchQuery('');
                        }}
                      />
                    ))}
                    {filteredBookmarks.length === 0 && (
                      <div className="col-span-full py-20 text-center glass rounded-[2rem]">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                          <BookMarked size={32} />
                        </div>
                        <p className="text-slate-400">暂无内容，点击上方按钮添加</p>
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
                            value={profile.name}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">头像 URL</label>
                          <input 
                            type="text" 
                            className="input-field" 
                            value={profile.avatar}
                            onChange={(e) => setProfile({ ...profile, avatar: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">简介</label>
                        <input 
                          type="text" 
                          className="input-field" 
                          value={profile.bio}
                          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-400 uppercase tracking-widest block">社交链接</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {profile.links.map((link, idx) => (
                            <div key={idx} className="flex gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-400">
                                {link.icon === 'github' ? <Github size={16} /> : <Twitter size={16} />}
                              </div>
                              <input 
                                type="text" 
                                className="flex-1 bg-transparent border-none text-sm outline-none"
                                value={link.url}
                                onChange={(e) => {
                                  const newLinks = [...profile.links];
                                  newLinks[idx] = { ...newLinks[idx], url: e.target.value };
                                  setProfile({ ...profile, links: newLinks });
                                }}
                              />
                            </div>
                          ))}
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
                        <div className="flex gap-3">
                          {profile.links.map((link, idx) => (
                            <a 
                              key={idx} 
                              href={link.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:scale-110 transition-all border border-slate-200"
                            >
                              {link.icon === 'github' ? <Github size={20} /> : <Twitter size={20} />}
                            </a>
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
                            </div>
                            <button 
                              onClick={() => loadProfileFiles()}
                              className="w-10 h-10 glass rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all"
                              title="刷新文件列表"
                            >
                              <Download size={18} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* File Tree */}
                            <div className="lg:col-span-4 space-y-4 max-h-[600px] overflow-y-auto no-scrollbar pr-2">
                              <div className="flex items-center gap-2 mb-2">
                                <button 
                                  onClick={() => handleCreateNew('file')}
                                  className="flex-1 py-2 px-3 glass rounded-xl text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center justify-center gap-2 transition-all"
                                >
                                  <FilePlus size={14} /> 新建文件
                                </button>
                                <button 
                                  onClick={() => handleCreateNew('folder')}
                                  className="flex-1 py-2 px-3 glass rounded-xl text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center justify-center gap-2 transition-all"
                                >
                                  <FolderPlus size={14} /> 新建文件夹
                                </button>
                              </div>
                              
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
                                      selectedPath={selectedFile?.path}
                                    />
                                  ))}
                                  {profileFiles.length === 0 && !isFetchingFiles && (
                                    <p className="text-sm text-slate-400 text-center py-8">未找到文件</p>
                                  )}
                                </div>
                              )}
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
              
              <div className="space-y-6">
                <section className="glass p-8 rounded-3xl">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Cloud size={24} className="text-indigo-600" />
                    Markdown 同步配置
                  </h2>
                  
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
                                  setConfig({
                                    ...config,
                                    github: { ...(config.github || { token: '', branch: 'main', path: 'zenspace.md' }), repo }
                                  });
                                  fetchGithubBranches(repo);
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
                                onChange={(e) => setConfig({
                                  ...config,
                                  github: { ...(config.github || { token: '', repo: '', path: 'zenspace.md' }), branch: e.target.value }
                                })}
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
                        </div>
                        <button 
                          onClick={handleSync}
                          className="w-full btn-primary flex items-center justify-center gap-2"
                        >
                          <Save size={18} />
                          立即同步到 GitHub (.md)
                        </button>
                      </div>
                    )}
                  </div>
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
              className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col"
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
                    value={config.activeAIId}
                    onChange={(e) => handleSelectAIModel(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
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
                    className="btn-primary p-3"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
                {/* Models List */}
                <div className="w-full lg:w-64 glass rounded-[2rem] p-4 overflow-y-auto no-scrollbar">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">已保存模型</h3>
                  <div className="space-y-2">
                    {config.aiModels.map(m => (
                      <div 
                        key={m.id}
                        className={cn(
                          "group p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                          config.activeAIId === m.id ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-100 hover:border-indigo-100"
                        )}
                        onClick={() => handleSelectAIModel(m.id)}
                      >
                        <div className="min-w-0">
                          <p className={cn("font-bold truncate", config.activeAIId === m.id ? "text-indigo-600" : "text-slate-700")}>{m.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{m.model || '默认模型'}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingAIModel(m); setShowAIModelModal(true); }}
                            className="p-1 text-slate-400 hover:text-indigo-600"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteAIModel(m.id); }}
                            className="p-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {config.aiModels.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-8">暂无模型</p>
                    )}
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col glass rounded-[2.5rem] overflow-hidden">
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
                      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
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
                <h2 className="text-2xl font-bold">{newBookmark.type === 'folder' ? '新建文件夹' : '添加新书签'}</h2>
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
                        value={newBookmark.url} onChange={(e) => {
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
                <input 
                  type="text" placeholder="名称" className="input-field"
                  value={newBookmark.title} onChange={(e) => setNewBookmark({ ...newBookmark, title: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    type="text" placeholder="分类" className="input-field"
                    value={newBookmark.category} onChange={(e) => setNewBookmark({ ...newBookmark, category: e.target.value })}
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
                  value={newBookmark.description} onChange={(e) => setNewBookmark({ ...newBookmark, description: e.target.value })}
                />
                <button 
                  onClick={handleAddBookmark} 
                  disabled={isAnalyzing || (newBookmark.type === 'folder' && !newBookmark.title?.trim()) || (newBookmark.type === 'link' && !newBookmark.url?.trim())}
                  className="w-full btn-primary py-4 disabled:opacity-50"
                >
                  {newBookmark.type === 'folder' ? '创建文件夹' : '保存书签'}
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
                    value={editingAIModel.name} onChange={(e) => setEditingAIModel({ ...editingAIModel, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">API Key</label>
                  <input 
                    type="password" className="input-field" placeholder="您的 API 密钥"
                    value={editingAIModel.apiKey} onChange={(e) => setEditingAIModel({ ...editingAIModel, apiKey: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-400 ml-1">
                    提示：如果没有 API Key，可以输入 <code className="bg-slate-100 px-1 rounded text-indigo-600">demo</code> 来开启演示模式进行功能验证。
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">API URL (可选)</label>
                  <input 
                    type="text" className="input-field" placeholder="留空则使用默认 Gemini"
                    value={editingAIModel.apiUrl} onChange={(e) => setEditingAIModel({ ...editingAIModel, apiUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">模型标识符 (可选)</label>
                  <input 
                    type="text" className="input-field" placeholder="gemini-3-flash-preview"
                    value={editingAIModel.model} onChange={(e) => setEditingAIModel({ ...editingAIModel, model: e.target.value })}
                  />
                </div>
                <button 
                  onClick={handleSaveAIModel}
                  disabled={!editingAIModel.name}
                  className="w-full btn-primary py-4"
                >
                  保存模型
                </button>
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
        "flex items-center gap-3 p-3 lg:px-4 lg:py-3 rounded-2xl transition-all duration-300 group relative",
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

function BookmarkCard({ bookmark, onDelete, onOpenFolder }: { bookmark: Bookmark; onDelete: () => void; onOpenFolder: () => void }) {
  const isFolder = bookmark.type === 'folder';
  const [iconError, setIconError] = React.useState(false);

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
      layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      onClick={isFolder ? onOpenFolder : undefined}
      className={cn(
        "group glass p-6 rounded-3xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative border border-slate-100",
        isFolder ? "cursor-pointer bg-gradient-to-br from-indigo-50/50 to-white border-indigo-100/50" : ""
      )}
    >
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(); }} 
        className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-all"
      >
        <Trash2 size={16} />
      </button>
      <div className="flex items-start gap-4 mb-4">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors overflow-hidden",
          isFolder ? "bg-indigo-100 text-indigo-600" : "bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
        )}>
          {isFolder ? (
            <Folder size={24} />
          ) : (
            favicon && !iconError ? (
              <img 
                src={favicon} 
                alt="" 
                className="w-full h-full object-cover"
                onError={() => setIconError(true)}
                referrerPolicy="no-referrer"
              />
            ) : (
              <Globe size={24} />
            )
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg truncate text-slate-800 group-hover:text-indigo-600 transition-colors">{bookmark.title}</h3>
          <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-500 rounded-lg uppercase tracking-wider">{bookmark.category}</span>
        </div>
      </div>
      <p className="text-sm text-slate-500 line-clamp-2 mb-4 h-10 leading-relaxed">{bookmark.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-mono">{new Date(bookmark.createdAt).toLocaleDateString()}</span>
        {!isFolder && (
          <a 
            href={bookmark.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-bold text-indigo-600 flex items-center gap-1 hover:gap-2 transition-all"
          >
            访问 <ExternalLink size={14} />
          </a>
        )}
        {isFolder && (
          <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
            打开 <ChevronRight size={14} />
          </span>
        )}
      </div>
    </motion.div>
  );
}
