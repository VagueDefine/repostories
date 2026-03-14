import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, Globe, Folder, Settings, User, 
  Github, Twitter, ExternalLink, Trash2, Save, 
  Cloud, Sparkles, ChevronRight, LayoutGrid,
  Info, LogOut, Menu, X, FileText, Download,
  Send, Bot, Key, Link as LinkIcon, Edit3,
  ChevronLeft, Wand2, PlusCircle, MoreVertical, BookMarked, Upload
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { Bookmark, TabType, UserProfile, StorageConfig, AppData, AIModelConfig } from './types';
import * as storage from './services/storage';
import { chatWithAI, analyzeUrl } from './services/ai';
import { parseBookmarkHtml } from './services/bookmarkParser';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const [analysisError, setAnalysisError] = useState<React.ReactNode | null>(null);
  
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

  const handleAddBookmark = () => {
    if (!newBookmark.title?.trim() || (newBookmark.type === 'link' && !newBookmark.url?.trim())) {
      alert('请填写必要信息');
      return;
    }
    
    const bookmark: Bookmark = {
      id: Math.random().toString(36).substr(2, 9),
      title: newBookmark.title.trim(),
      url: newBookmark.type === 'folder' ? '' : (newBookmark.url?.trim().startsWith('http') ? newBookmark.url.trim() : `https://${newBookmark.url?.trim()}`),
      category: newBookmark.category?.trim() || '常用',
      description: newBookmark.description?.trim(),
      createdAt: Date.now(),
      type: newBookmark.type || 'link',
      parentId: newBookmark.parentId || undefined
    };
    
    setBookmarks([bookmark, ...bookmarks]);
    setIsAddModalOpen(false);
    setNewBookmark({ title: '', url: '', category: '常用', description: '', type: 'link' });
  };

  const handleDeleteBookmark = (id: string) => {
    setBookmarks(bookmarks.filter(b => b.id !== id));
  };

  const handleSync = async () => {
    const data: AppData = { bookmarks, profile, content: markdownContent };
    const success = await storage.syncToGithub(config, data);
    if (success) {
      alert('同步成功！您的 .md 文件已更新。');
    } else {
      alert('同步失败，请检查 GitHub 配置。');
    }
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
  };

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
      ${bookmarks.map(b => `- [${b.category}] ${b.title}: ${b.url} ${b.description ? `(描述: ${b.description})` : ''}`).join('\n')}
      
      个人主页笔记内容:
      ${markdownContent}
    `;

    const response = await chatWithAI(activeAIModel, userMsg, context);
    setMessages(prev => [...prev, { role: 'ai', content: response }]);
    setIsAILoading(false);
  };

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
                          onOpenFolder={() => setCurrentFolderId(bookmark.id)}
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
                        onOpenFolder={() => setCurrentFolderId(bookmark.id)}
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
              <div className="glass rounded-[2.5rem] overflow-hidden">
                <div className="h-48 bg-gradient-to-r from-indigo-500 to-purple-600 relative">
                  <div className="absolute -bottom-16 left-12 p-1 bg-white rounded-3xl shadow-xl">
                    <img 
                      src={profile.avatar} 
                      alt="Avatar" 
                      className="w-32 h-32 rounded-[1.25rem] object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                <div className="pt-20 pb-12 px-12">
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

                  <div className="prose prose-slate max-w-none bg-white p-10 rounded-[2rem] border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText size={14} /> Markdown 内容
                      </span>
                    </div>
                    <Markdown>{markdownContent}</Markdown>
                  </div>
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
                          <input 
                            type="password" 
                            className="input-field" 
                            value={config.github?.token || ''}
                            onChange={(e) => setConfig({
                              ...config,
                              github: { ...(config.github || { repo: '', branch: 'main', path: 'zenspace.md' }), token: e.target.value }
                            })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">仓库 (User/Repo)</label>
                            <input 
                              type="text" 
                              className="input-field" 
                              value={config.github?.repo || ''}
                              onChange={(e) => setConfig({
                                ...config,
                                github: { ...(config.github || { token: '', branch: 'main', path: 'zenspace.md' }), repo: e.target.value }
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">存储路径 (.md)</label>
                            <input 
                              type="text" 
                              className="input-field" 
                              value={config.github?.path || 'zenspace.md'}
                              onChange={(e) => setConfig({
                                ...config,
                                github: { ...(config.github || { token: '', repo: '', branch: 'main' }), path: e.target.value }
                              })}
                            />
                          </div>
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
                              "p-4 rounded-2xl text-sm leading-relaxed",
                              msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-slate-50 text-slate-700 rounded-tl-none border border-slate-100"
                            )}>
                              <Markdown>{msg.content}</Markdown>
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
                    <div className="relative">
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
                          isAnalyzing ? "text-indigo-400" : "text-indigo-600 hover:bg-indigo-50"
                        )}
                        title="AI 智能分析"
                      >
                        {isAnalyzing ? (
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : (
                          <Wand2 size={20} />
                        )}
                      </button>
                    </div>
                    
                    {isAnalyzing && (
                      <div className="text-[10px] text-indigo-500 animate-pulse font-medium flex items-center gap-2">
                        <Sparkles size={12} />
                        AI 正在分析网页内容...
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
                  disabled={!newBookmark.title?.trim() || (newBookmark.type === 'link' && !newBookmark.url?.trim())}
                  className="w-full btn-primary py-4"
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
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
          isFolder ? "bg-indigo-100 text-indigo-600" : "bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
        )}>
          {isFolder ? <Folder size={24} /> : <Globe size={24} />}
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
