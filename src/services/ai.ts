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

export const chatWithAI = async (config: AIModelConfig, message: string, context: string, history: { role: 'user' | 'ai', content: string }[] = []): Promise<AIResponse> => {
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
      return { text: "你好！我是 WangLi 的智能助手。我可以帮你管理书签、整理分类，或者回答关于你收藏内容的问题。" };
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
              { role: "system", content: `你是一个名为 WangLi 的智能助手。你拥有访问用户收藏夹、个人简介和笔记的权限。你可以通过调用工具来帮助用户管理书签（如创建文件夹、移动书签、修改分类等）。

重要规则：
1. **回答与执行并重**：如果用户要求总结知识并执行操作（如“总结一下并在收藏夹中新建文件夹移动进去”），你必须**同时**在文本中给出总结回答，**并**调用相应的工具执行操作。
2. **精准识别**：在寻找特定主题的书签时，请务必检查书签的 **标题 (Title)** 和 **URL**。
3. **多任务协同**：如果用户要求执行多个操作，请在一次回复中调用所有必要的工具。
4. **ID 协同**：创建新文件夹并立即移动书签时，请在 createFolder 中指定自定义 ID，并在 moveBookmarks 中使用该 ID。
5. **目标文件夹识别**：当用户提到某个文件夹（如“电源文件夹”）时，请在上下文的收藏夹内容中查找该文件夹的 ID。如果找不到，请先使用 createFolder 创建它。
6. **使用真实 ID**：在调用 moveBookmarks、updateBookmarksCategory、deleteBookmarks 等工具时，请确保 \`bookmarkIds\` 数组中包含的是书签的**真实 ID**，而不是标题。

上下文信息：
${context}` },
              ...history.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.content })),
              { role: "user", content: message }
            ],
            tools: bookmarkTools.map(tool => ({
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
          systemInstruction: `你是一个名为 WangLi 的智能助手。你拥有访问用户收藏夹、个人简介和笔记的权限。你可以通过调用工具来帮助用户管理书签（如创建文件夹、移动书签、修改分类等）。

重要规则：
1. **回答与执行并重**：如果用户要求总结知识并执行操作（如“总结一下并在收藏夹中新建文件夹移动进去”），你必须**同时**在文本中给出总结回答，**并**调用相应的工具执行操作。
2. **精准识别**：在寻找特定主题的书签时，请务必检查书签的 **标题 (Title)** 和 **URL**。
3. **多任务协同**：如果用户要求执行多个操作，请在一次回复中调用所有必要的工具。
4. **ID 协同**：创建新文件夹并立即移动书签时，请在 createFolder 中指定自定义 ID，并在 moveBookmarks 中使用该 ID。
5. **目标文件夹识别**：当用户提到某个文件夹（如“电源文件夹”）时，请在上下文的收藏夹内容中查找该文件夹的 ID。如果找不到，请先使用 createFolder 创建它。
6. **使用真实 ID**：在调用 moveBookmarks、updateBookmarksCategory、deleteBookmarks 等工具时，请确保 \`bookmarkIds\` 数组中包含的是书签的**真实 ID**，而不是标题。

上下文信息：
${context}`,
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
