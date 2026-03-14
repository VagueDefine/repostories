import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIModelConfig, Bookmark } from "../types";

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
  }
];

export interface AIResponse {
  text: string;
  functionCalls?: { name: string, args: any }[];
}

export const chatWithAI = async (config: AIModelConfig, message: string, context: string): Promise<AIResponse> => {
  const { apiKey, apiUrl, model = "gemini-3-flash-preview" } = config;

  // Mock mode for testing without real API
  if (apiKey === 'demo' || apiKey === 'test') {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
    if (message.toLowerCase().includes('分类') || message.toLowerCase().includes('整理')) {
      return {
        text: "好的，我已经根据你的要求为你整理了书签。在演示模式下，我模拟执行了分类操作。",
        functionCalls: [
          { name: "updateBookmarksCategory", args: { bookmarkIds: ["1"], category: "AI 推荐" } }
        ]
      };
    }
    if (message.toLowerCase().includes('你好') || message.toLowerCase().includes('hello')) {
      return { text: "你好！我是 ZenSpace 的智能助手。我可以帮你管理书签、整理分类，或者回答关于你收藏内容的问题。" };
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
              { role: "system", content: `你是一个名为 ZenSpace 的智能助手。你拥有访问用户收藏夹、个人简介和笔记的权限。请根据以下上下文信息回答用户的问题：\n${context}` },
              { role: "user", content: message }
            ]
          }
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || `API Error: ${response.status}`);
      }
      const data = await response.json();
      return { text: data.choices?.[0]?.message?.content || "AI 响应出错" };
    } catch (error) {
      console.error("Custom AI Error:", error);
      return { text: `无法连接到 AI 服务: ${error instanceof Error ? error.message : '未知错误'}` };
    }
  } else {
    // Default to Gemini
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: model || "gemini-3-flash-preview",
        contents: [
          { text: `Context: ${context}` },
          { text: message }
        ],
        config: {
          systemInstruction: "你是一个名为 ZenSpace 的智能助手。你拥有访问用户收藏夹、个人简介和笔记的权限。你可以通过调用工具来帮助用户管理书签（如创建文件夹、移动书签、修改分类等）。\n\n重要：如果你需要创建一个新文件夹并立即将书签移入其中，请在调用 createFolder 时指定一个自定义 ID（如 'new_folder_1'），并在随后的 moveBookmarks 调用中使用相同的 ID 作为 targetFolderId。请务必在一次回复中完成所有必要的操作步骤。",
          tools: [{ functionDeclarations: bookmarkTools }]
        }
      });
      
      return {
        text: response.text || "",
        functionCalls: response.functionCalls?.map(fc => ({ name: fc.name, args: fc.args }))
      };
    } catch (error) {
      console.error("Gemini Error:", error);
      return { text: "Gemini API 调用失败，请检查 API Key" };
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
    Analyze this URL: ${url}
    
    Please provide:
    1. A concise title for the bookmark.
    2. A short description (max 50 characters).
    3. A category (e.g., "Tools", "Learning", "News", "Social").
    4. Which folder it should belong to from this list: ${folders.map(f => `${f.title} (ID: ${f.id})`).join(', ')}. If none fit well, suggest "root".
    
    Return ONLY a JSON object in this format:
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
            messages: [{ role: "user", content: prompt }]
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
        contents: [{ text: prompt }],
        config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Gemini Analyze Error:", error);
      throw error;
    }
  }
};
