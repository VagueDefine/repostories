import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIModelConfig, Bookmark, AIPermissions } from "../types";

const bookmarkTools: FunctionDeclaration[] = [
  {
    name: "createFolder",
    description: "创建一个新的文件夹来组织书签",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "文件夹的标题" },
        parentId: { type: Type.STRING, description: "父文件夹的 ID（可选，留空则在根目录）" },
        id: { type: Type.STRING, description: "为新文件夹指定一个唯一的 ID（可选，建议在需要立即向其中移动书签时使用）" }
      },
      required: ["title"]
    }
  },
  {
    name: "moveBookmarks",
    description: "将一个或多个书签移动到指定的文件夹中",
    parameters: {
      type: Type.OBJECT,
      properties: {
        bookmarkIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "要移动的书签 ID 列表" },
        targetFolderId: { type: Type.STRING, description: "目标文件夹的 ID（如果是根目录则传 'root' 或空字符串）" }
      },
      required: ["bookmarkIds", "targetFolderId"]
    }
  },
  {
    name: "updateBookmarksCategory",
    description: "批量更新书签的分类名称",
    parameters: {
      type: Type.OBJECT,
      properties: {
        bookmarkIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "要更新的书签 ID 列表" },
        category: { type: Type.STRING, description: "新的分类名称（例如：学习、工作、技术）" }
      },
      required: ["bookmarkIds", "category"]
    }
  },
  {
    name: "deleteBookmarks",
    description: "批量删除书签或文件夹",
    parameters: {
      type: Type.OBJECT,
      properties: {
        bookmarkIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "要删除的书签或文件夹 ID 列表" }
      },
      required: ["bookmarkIds"]
    }
  },
  {
    name: "updateProfile",
    description: "更新用户的个人资料信息（如姓名、简介）",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "用户的姓名" },
        bio: { type: Type.STRING, description: "用户的个人简介" }
      }
    }
  },
  {
    name: "listGithubFiles",
    description: "列出 GitHub 仓库中的文件和目录",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "要列出的目录路径（可选，默认为根目录）" },
        isNotebook: { type: Type.BOOLEAN, description: "是否访问笔记仓库（默认为 false，即访问主数据仓库）" },
        repo: { type: Type.STRING, description: "GitHub 仓库名称（格式：用户名/仓库名，可选）" },
        branch: { type: Type.STRING, description: "分支名称（可选）" }
      }
    }
  },
  {
    name: "readGithubFile",
    description: "读取 GitHub 仓库中特定文件的内容",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "文件的完整路径" },
        isNotebook: { type: Type.BOOLEAN, description: "是否访问笔记仓库" },
        repo: { type: Type.STRING, description: "GitHub 仓库名称（格式：用户名/仓库名，可选）" },
        branch: { type: Type.STRING, description: "分支名称（可选）" }
      },
      required: ["path"]
    }
  },
  {
    name: "writeGithubFile",
    description: "在 GitHub 仓库中创建或更新文件内容",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "文件的完整路径" },
        content: { type: Type.STRING, description: "文件的内容" },
        message: { type: Type.STRING, description: "提交信息（可选）" },
        isNotebook: { type: Type.BOOLEAN, description: "是否访问笔记仓库" },
        repo: { type: Type.STRING, description: "GitHub 仓库名称（格式：用户名/仓库名，可选）" },
        branch: { type: Type.STRING, description: "分支名称（可选）" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "deleteGithubFile",
    description: "删除 GitHub 仓库中的文件",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "文件的完整路径" },
        message: { type: Type.STRING, description: "提交信息（可选）" },
        isNotebook: { type: Type.BOOLEAN, description: "是否访问笔记仓库" },
        repo: { type: Type.STRING, description: "GitHub 仓库名称（格式：用户名/仓库名，可选）" },
        branch: { type: Type.STRING, description: "分支名称（可选）" }
      },
      required: ["path"]
    }
  },
  {
    name: "listGithubRepos",
    description: "列出用户在 GitHub 上的所有仓库",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: "listGithubBranches",
    description: "列出 GitHub 仓库中的所有分支",
    parameters: {
      type: Type.OBJECT,
      properties: {
        repo: { type: Type.STRING, description: "GitHub 仓库名称（格式：用户名/仓库名）" }
      },
      required: ["repo"]
    }
  }
];

export interface AIResponse {
  text: string;
  functionCalls?: { name: string, args: any }[];
}

export const chatWithAI = async (
  config: AIModelConfig, 
  message: string, 
  context: string, 
  history: { role: 'user' | 'ai', content: string }[] = [],
  permissions?: AIPermissions
): Promise<AIResponse> => {
  const { apiKey, apiUrl, model = "gemini-3-flash-preview" } = config;

  const systemInstruction = `你是一个名为 你的AI助手 的智能助手。
  
  当前权限状态：
  - 个人资料访问：${permissions?.profile !== false ? '✅ 已开启' : '❌ 已关闭'}
  - 收藏夹管理：${permissions?.bookmarks !== false ? '✅ 已开启' : '❌ 已关闭'}
  - 笔记文件访问：${permissions?.files !== false ? '✅ 已开启' : '❌ 已关闭'}

  重要规则：
  1. **尊重权限**：如果某项权限已关闭，你将无法看到相关数据（上下文会显示 [权限受限]），你也**绝对不能**尝试调用相关的工具。如果用户要求你做你没有权限的事情，请礼貌地解释你需要相关权限。
  2. **回答与执行并重**：如果用户要求总结知识并执行操作，你必须同时在文本中给出总结回答，并调用相应的工具执行操作。
  3. **精准识别**：在寻找特定主题的书签时，请务必检查书签的标题和 URL。
  4. **多任务协同**：如果用户要求执行多个操作，请在一次回复中调用所有必要的工具。
  5. **ID 协同**：创建新文件夹并立即移动书签时，请在 createFolder 中指定自定义 ID，并在 moveBookmarks 中使用该 ID。
  6. **使用真实 ID**：在调用工具时，请确保使用书签或文件夹的真实 ID。

  上下文信息：
  ${context}`;

  // Filter tools based on permissions
  const availableTools = bookmarkTools.filter(tool => {
    if (['createFolder', 'moveBookmarks', 'updateBookmarksCategory', 'deleteBookmarks'].includes(tool.name)) {
      return permissions?.bookmarks !== false;
    }
    if (tool.name === 'updateProfile') {
      return permissions?.profile !== false;
    }
    if (['listGithubFiles', 'readGithubFile', 'writeGithubFile', 'deleteGithubFile'].includes(tool.name)) {
      return permissions?.files !== false;
    }
    if (tool.name === 'listGithubRepos' || tool.name === 'listGithubBranches') {
      return permissions?.listRepos !== false;
    }
    return true;
  });

  // Mock mode for testing without real API
  if (apiKey === 'demo' || apiKey === 'test') {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
    if (message.toLowerCase().includes('分类') || message.toLowerCase().includes('整理')) {
      if (permissions?.bookmarks === false) {
        return { text: "抱歉，我目前没有管理收藏夹的权限，无法为你整理书签。" };
      }
      return {
        text: "好的，我已经根据你的要求为你整理了书签。在演示模式下，我模拟执行了分类操作。",
        functionCalls: [
          { name: "updateBookmarksCategory", args: { bookmarkIds: ["1"], category: "AI 推荐" } }
        ]
      };
    }
    if (message.toLowerCase().includes('修改姓名') || message.toLowerCase().includes('修改个人信息')) {
      if (permissions?.profile === false) {
        return { text: "抱歉，我目前没有修改个人资料的权限。" };
      }
      return {
        text: "好的，我已经帮你修改了个人资料。",
        functionCalls: [
          { name: "updateProfile", args: { name: "新名字" } }
        ]
      };
    }
    if (message.toLowerCase().includes('你好') || message.toLowerCase().includes('hello')) {
      return { text: "你好！我是你的AI助手。我可以帮你管理书签、整理分类，或者回答关于你收藏内容的问题。" };
    }
    return { text: `这是一个演示响应。你刚才说的是: "${message}"。在演示模式下，我无法访问真实的 AI 模型，但你可以验证聊天界面的交互功能。` };
  }

  const getFullUrl = (baseUrl: string) => {
    let url = baseUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    if (!url.includes('/chat/completions') && !url.includes('/generateContent')) {
      if (url.endsWith('/')) url = url.slice(0, -1);
      if (!url.endsWith('/v1')) url += '/v1';
      url += '/chat/completions';
    }
    return url;
  };

  if (apiUrl && apiUrl.trim() !== "") {
    // Custom URL (OpenAI compatible usually) - Use proxy to avoid CORS
    try {
      const fullUrl = getFullUrl(apiUrl);
      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: fullUrl,
          headers: {
            "Authorization": `Bearer ${apiKey}`
          },
          body: {
            model: model || "gpt-3.5-turbo",
            messages: [
              { role: "system", content: systemInstruction },
              ...history.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.content })),
              { role: "user", content: message }
            ],
            tools: availableTools.map(tool => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            })),
            tool_choice: "auto"
          }
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || `API Error: ${response.status}`);
      }
      const data = await response.json();
      const choice = data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;
      
      return { 
        text: choice?.message?.content || "",
        functionCalls: toolCalls?.map((tc: any) => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments)
        }))
      };
    } catch (error) {
      console.error("Custom AI Error:", error);
      return { text: `无法连接到 AI 服务: ${error instanceof Error ? error.message : '未知错误'}` };
    }
  } else {
    // Default to Gemini
    try {
      if (!apiKey || apiKey.trim() === "") {
        throw new Error("API Key 不能为空。请在设置中配置有效的 Gemini API Key。");
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: model || "gemini-3-flash-preview",
        contents: [
          ...history.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })),
          {
            role: 'user',
            parts: [
              { text: message }
            ]
          }
        ],
        config: {
          systemInstruction: systemInstruction,
          tools: availableTools.length > 0 ? [{ functionDeclarations: availableTools }] : []
        }
      });
      
      return {
        text: response.text || "",
        functionCalls: response.functionCalls?.map(fc => ({ name: fc.name, args: fc.args }))
      };
    } catch (error) {
      console.error("Gemini Error Detail:", error);
      let errorMessage = "Gemini API 调用失败";
      
      if (error instanceof Error) {
        if (error.message.includes("xhr error") || error.message.includes("Rpc failed")) {
          errorMessage = "网络连接失败 (XHR Error)。这通常是由于网络环境限制、API Key 无效或浏览器插件拦截导致的。请检查您的网络连接，或尝试更换 API Key。";
        } else if (error.message.includes("API key not valid")) {
          errorMessage = "无效的 API Key。请检查您的 Gemini API Key 是否正确。";
        } else if (error.message.includes("model not found")) {
          errorMessage = `找不到模型 "${model}"。请确保您的 API Key 有权访问此模型。`;
        } else {
          errorMessage = `Gemini API 错误: ${error.message}`;
        }
      }
      
      return { text: errorMessage };
    }
  }
};

export const analyzeUrl = async (config: AIModelConfig, url: string, folders: Bookmark[]) => {
  const { apiKey, apiUrl, model = "gemini-3-flash-preview" } = config;
  
  // Mock mode for testing without real API
  if (apiKey === 'demo' || apiKey === 'test') {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
    return {
      title: "示例网页标题",
      description: "这是一个通过 Mock AI 自动生成的网页描述示例。",
      category: "示例",
      folderId: folders.length > 0 ? folders[0].id : "root"
    };
  }

  const prompt = `
    你是一个专业的书签整理专家。请分析此 URL 的内容并提供以下信息：
    
    1. **标题 (title)**: 一个简洁、准确且吸引人的标题。**必须优先使用抓取结果中的标题**。如果原标题包含多余的后缀（如“ - 哔哩哔哩”），请将其去除。
    2. **描述 (description)**: 一段简短的摘要（最多 50 个字符），概括网页的核心价值或内容。**必须基于抓取结果中的描述进行整理**。
    3. **分类 (category)**: 一个合适的分类标签（如：“工具”、“学习”、“新闻”、“社交”、“开发”等）。
    4. **文件夹 (folderId)**: 从以下列表中选择最合适的文件夹 ID：${folders.map(f => `${f.title} (ID: ${f.id})`).join(', ')}。如果没有合适的，请返回 "root"。
    
    请务必基于网页的实际抓取内容进行判断，**绝对禁止凭空捏造与抓取内容无关的信息**。
    
    返回格式必须是纯 JSON 对象：
    {
      "title": "...",
      "description": "...",
      "category": "...",
      "folderId": "..."
    }
  `;

  const getFullUrl = (baseUrl: string) => {
    let url = baseUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    if (!url.includes('/chat/completions') && !url.includes('/generateContent')) {
      if (url.endsWith('/')) url = url.slice(0, -1);
      if (!url.endsWith('/v1')) url += '/v1';
      url += '/chat/completions';
    }
    return url;
  };

  if (apiUrl && apiUrl.trim() !== "") {
    try {
      // Step 1: Try to scrape metadata first to give context to the AI
      let scrapeContext = "";
      try {
        const scrapeRes = await fetch("/api/ai/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        if (scrapeRes.ok) {
          const meta = await scrapeRes.json();
          scrapeContext = `\n\n【重要：真实的网页抓取结果】\n标题: ${meta.title}\n描述: ${meta.description}\n\n请注意：以上是系统直接从网页抓取的真实数据。如果抓取结果与你的猜测不符，请务必以抓取结果为准。绝对不要凭空捏造与网页内容无关的标题。`;
        }
      } catch (e) {
        console.warn("Scraping failed, falling back to URL only", e);
      }

      const fullUrl = getFullUrl(apiUrl);
      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: fullUrl,
          headers: {
            "Authorization": `Bearer ${apiKey}`
          },
          body: {
            model: model || "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "你是一个专业的书签整理专家。你会收到一个 URL 和可能的网页抓取内容。请返回 JSON 格式的标题、描述、分类和文件夹建议。" },
              { role: "user", content: `请分析此 URL 的内容：${url}${scrapeContext}\n\n${prompt}` }
            ]
          }
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || `API Error: ${response.status}`);
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    } catch (error) {
      console.error("Custom AI Analyze Error:", error);
      throw error;
    }
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: model || "gemini-3-flash-preview",
        contents: [{ text: `请访问并分析此 URL 的内容：${url}\n\n${prompt}` }],
        config: { 
          responseMimeType: "application/json",
          tools: [{ urlContext: {} }]
        }
      });
      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Gemini Analyze Error:", error);
      throw error;
    }
  }
};
