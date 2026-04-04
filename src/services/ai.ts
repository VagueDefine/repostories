import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIModelConfig, Bookmark, AIPermissions } from "../types";

// 缓存配置
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

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
  functionCalls?: { name: string; args: any }[];
}

// 获取缓存或发起请求
async function fetchWithCache<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  duration: number = CACHE_DURATION
): Promise<T> {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < duration) {
    return cached.data as T;
  }
  
  const data = await fetchFn();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

// 清理缓存
export function clearAICache(): void {
  cache.clear();
}

// 统一的错误处理
function handleAIError(error: unknown, context: string): string {
  console.error(`${context} Error:`, error);
  
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("xhr error") || msg.includes("rpc failed") || msg.includes("network")) {
      return "网络连接失败。请检查您的网络连接，或尝试更换 API Key。";
    }
    if (msg.includes("api key not valid")) {
      return "无效的 API Key。请检查您的 API Key 是否正确。";
    }
    if (msg.includes("model not found")) {
      return "找不到指定的模型。请确保您的 API Key 有权访问此模型。";
    }
    if (msg.includes("rate limit")) {
      return "请求过于频繁，请稍后再试。";
    }
    return `${context}失败: ${error.message}`;
  }
  
  return `${context}失败: 未知错误`;
}

// 获取完整URL
function getFullUrl(baseUrl: string): string {
  let url = baseUrl.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  if (!url.includes("/chat/completions") && !url.includes("/generateContent")) {
    if (url.endsWith("/")) url = url.slice(0, -1);
    if (!url.endsWith("/v1")) url += "/v1";
    url += "/chat/completions";
  }
  return url;
}

// 构建系统指令
function buildSystemInstruction(context: string, permissions?: AIPermissions): string {
  return `你是一个名为 你的AI助手 的智能助手。
  
  当前权限状态：
  - 个人资料访问：${permissions?.profile !== false ? "✅ 已开启" : "❌ 已关闭"}
  - 收藏夹管理：${permissions?.bookmarks !== false ? "✅ 已开启" : "❌ 已关闭"}
  - 笔记文件访问：${permissions?.files !== false ? "✅ 已开启" : "❌ 已关闭"}

  重要规则：
  1. **尊重权限**：如果某项权限已关闭，你将无法看到相关数据（上下文会显示 [权限受限]），你也**绝对不能**尝试调用相关的工具。
  2. **回答与执行并重**：如果用户要求总结知识并执行操作，你必须同时在文本中给出总结回答，并调用相应的工具执行操作。
  3. **精准识别**：在寻找特定主题的书签时，请务必检查书签的标题和 URL。
  4. **多任务协同**：如果用户要求执行多个操作，请在一次回复中调用所有必要的工具。
  5. **ID 协同**：创建新文件夹并立即移动书签时，请在 createFolder 中指定自定义 ID，并在 moveBookmarks 中使用该 ID。
  6. **使用真实 ID**：在调用工具时，请确保使用书签或文件夹的真实 ID。

  上下文信息：
  ${context}`;
}

// 过滤工具
function filterTools(permissions?: AIPermissions): FunctionDeclaration[] {
  return bookmarkTools.filter((tool) => {
    if (["createFolder", "moveBookmarks", "updateBookmarksCategory", "deleteBookmarks"].includes(tool.name)) {
      return permissions?.bookmarks !== false;
    }
    if (tool.name === "updateProfile") {
      return permissions?.profile !== false;
    }
    if (["listGithubFiles", "readGithubFile", "writeGithubFile", "deleteGithubFile"].includes(tool.name)) {
      return permissions?.files !== false;
    }
    if (tool.name === "listGithubRepos" || tool.name === "listGithubBranches") {
      return permissions?.listRepos !== false;
    }
    return true;
  });
}

// 演示模式响应
async function getMockResponse(message: string, permissions?: AIPermissions): Promise<AIResponse> {
  await new Promise((resolve) => setTimeout(resolve, 800)); // 减少模拟延迟
  
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes("分类") || lowerMsg.includes("整理")) {
    if (permissions?.bookmarks === false) {
      return { text: "抱歉，我目前没有管理收藏夹的权限，无法为你整理书签。" };
    }
    return {
      text: "好的，我已经根据你的要求为你整理了书签。在演示模式下，我模拟执行了分类操作。",
      functionCalls: [{ name: "updateBookmarksCategory", args: { bookmarkIds: ["1"], category: "AI 推荐" } }]
    };
  }
  
  if (lowerMsg.includes("修改姓名") || lowerMsg.includes("修改个人信息")) {
    if (permissions?.profile === false) {
      return { text: "抱歉，我目前没有修改个人资料的权限。" };
    }
    return {
      text: "好的，我已经帮你修改了个人资料。",
      functionCalls: [{ name: "updateProfile", args: { name: "新名字" } }]
    };
  }
  
  if (lowerMsg.includes("你好") || lowerMsg.includes("hello")) {
    return { text: "你好！我是你的AI助手。我可以帮你管理书签、整理分类，或者回答关于你收藏内容的问题。" };
  }
  
  return { text: `这是一个演示响应。你刚才说的是: "${message}"。在演示模式下，我无法访问真实的 AI 模型，但你可以验证聊天界面的交互功能。` };
}

export const chatWithAI = async (
  config: AIModelConfig,
  message: string,
  context: string,
  history: { role: "user" | "ai"; content: string }[] = [],
  permissions?: AIPermissions
): Promise<AIResponse> => {
  const { apiKey, apiUrl, model = "gemini-3-flash-preview" } = config;

  // 演示模式
  if (apiKey === "demo" || apiKey === "test") {
    return getMockResponse(message, permissions);
  }

  const systemInstruction = buildSystemInstruction(context, permissions);
  const availableTools = filterTools(permissions);

  // 自定义 API (OpenAI 兼容)
  if (apiUrl?.trim()) {
    try {
      const fullUrl = getFullUrl(apiUrl);
      const cacheKey = `chat_${fullUrl}_${message}_${history.length}`;
      
      return await fetchWithCache(
        cacheKey,
        async () => {
          const response = await fetch("/api/ai/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: fullUrl,
              headers: { Authorization: `Bearer ${apiKey.trim()}` },
              body: {
                model: model || "gpt-3.5-turbo",
                messages: [
                  { role: "system", content: systemInstruction },
                  ...history.map((msg) => ({ role: msg.role === "ai" ? "assistant" : "user", content: msg.content })),
                  { role: "user", content: message }
                ],
                tools: availableTools.map((tool) => ({
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
            const errorData = await response.json().catch(() => ({}));
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
        },
        0 // 聊天不缓存
      );
    } catch (error) {
      return { text: handleAIError(error, "AI 服务连接") };
    }
  }

  // Gemini API
  try {
    if (!apiKey?.trim()) {
      throw new Error("API Key 不能为空。请在设置中配置有效的 Gemini API Key。");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: model || "gemini-3-flash-preview",
      contents: [
        ...history.map((msg) => ({
          role: msg.role === "ai" ? "model" : "user",
          parts: [{ text: msg.content }]
        })),
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        tools: availableTools.length > 0 ? [{ functionDeclarations: availableTools }] : []
      }
    });

    return {
      text: response.text || "",
      functionCalls: response.functionCalls?.map((fc) => ({ name: fc.name, args: fc.args }))
    };
  } catch (error) {
    return { text: handleAIError(error, "Gemini API") };
  }
};

// URL分析提示模板
const URL_ANALYSIS_PROMPT = `
  你是一个专业的书签整理专家。请分析此 URL 的内容并提供以下信息：
  
  1. **标题 (title)**: 一个简洁、准确且吸引人的标题。**必须优先使用抓取结果中的标题**。如果原标题包含多余的后缀（如" - 哔哩哔哩"），请将其去除。
  2. **描述 (description)**: 一段简短的摘要（最多 50 个字符），概括网页的核心价值或内容。**必须基于抓取结果中的描述进行整理**。
  3. **分类 (category)**: 一个合适的分类标签（如："工具"、"学习"、"新闻"、"社交"、"开发"等）。
  4. **文件夹 (folderId)**: 从以下列表中选择最合适的文件夹 ID。如果没有合适的，请返回 "root"。
  
  请务必基于网页的实际抓取内容进行判断，**绝对禁止凭空捏造与抓取内容无关的信息**。
  
  返回格式必须是纯 JSON 对象：
  {
    "title": "...",
    "description": "...",
    "category": "...",
    "folderId": "..."
  }
`;

// 抓取URL元数据
async function scrapeUrlMetadata(url: string): Promise<{ title: string; description: string } | null> {
  try {
    const response = await fetch("/api/ai/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn("Scraping failed:", e);
  }
  return null;
}

export const analyzeUrl = async (
  config: AIModelConfig,
  url: string,
  folders: Bookmark[]
): Promise<{ title?: string; description?: string; category?: string; folderId?: string } | null> => {
  const { apiKey, apiUrl, model = "gemini-3-flash-preview" } = config;

  // 演示模式
  if (apiKey === "demo" || apiKey === "test") {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      title: "示例网页标题",
      description: "这是一个通过 Mock AI 自动生成的网页描述示例。",
      category: "示例",
      folderId: folders.length > 0 ? folders[0].id : "root"
    };
  }

  const folderContext = folders.map((f) => `${f.title} (ID: ${f.id})`).join(", ");
  const cacheKey = `analyze_${url}_${folderContext}`;

  return fetchWithCache(cacheKey, async () => {
    // 先抓取元数据
    const meta = await scrapeUrlMetadata(url);
    const scrapeContext = meta
      ? `\n\n【重要：真实的网页抓取结果】\n标题: ${meta.title}\n描述: ${meta.description}\n\n请注意：以上是系统直接从网页抓取的真实数据。如果抓取结果与你的猜测不符，请务必以抓取结果为准。绝对不要凭空捏造与网页内容无关的标题。`
      : "";

    const prompt = `请分析此 URL 的内容：${url}${scrapeContext}\n\n可用文件夹：${folderContext}\n\n${URL_ANALYSIS_PROMPT}`;

    // 自定义 API
    if (apiUrl?.trim()) {
      const fullUrl = getFullUrl(apiUrl);
      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullUrl,
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          body: {
            model: model || "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "你是一个专业的书签整理专家。你会收到一个 URL 和可能的网页抓取内容。请返回 JSON 格式的标题、描述、分类和文件夹建议。"
              },
              { role: "user", content: prompt }
            ]
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || `API Error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    }

    // Gemini API
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: model || "gemini-3-flash-preview",
      contents: [{ text: `请访问并分析此 URL 的内容：${url}\n\n${prompt}` }],
      config: {
        responseMimeType: "application/json",
        tools: [{ urlContext: {} }]
      }
    });

    return JSON.parse(response.text || "{}");
  }, 60000); // URL分析缓存1分钟
};
