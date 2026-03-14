import { GoogleGenAI } from "@google/genai";
import { AIModelConfig, Bookmark } from "../types";

export const chatWithAI = async (config: AIModelConfig, message: string, context: string) => {
  const { apiKey, apiUrl, model = "gemini-3-flash-preview" } = config;

  // Mock mode for testing without real API
  if (apiKey === 'demo' || apiKey === 'test') {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
    if (message.toLowerCase().includes('你好') || message.toLowerCase().includes('hello')) {
      return "你好！我是 ZenSpace 的演示 AI 助手。你可以问我关于如何管理书签的问题。";
    }
    return `这是一个演示响应。你刚才说的是: "${message}"。在演示模式下，我无法访问真实的 AI 模型，但你可以验证聊天界面的交互功能。`;
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
      return data.choices?.[0]?.message?.content || "AI 响应出错";
    } catch (error) {
      console.error("Custom AI Error:", error);
      return `无法连接到 AI 服务: ${error instanceof Error ? error.message : '未知错误'}`;
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
          systemInstruction: "你是一个名为 ZenSpace 的智能助手。你拥有访问用户收藏夹、个人简介和笔记的权限。请根据提供的上下文信息（Context）来回答用户的问题，帮助用户管理和查找他们的收藏内容。"
        }
      });
      return response.text || "AI 未返回内容";
    } catch (error) {
      console.error("Gemini Error:", error);
      return "Gemini API 调用失败，请检查 API Key";
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
