import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Scrape metadata endpoint
  app.post("/api/ai/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      // Special handling for Bilibili
      if (url.includes("bilibili.com/video/BV")) {
        const bvid = url.match(/BV[a-zA-Z0-9]+/)?.[0];
        if (bvid) {
          try {
            const apiRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.bilibili.com/"
              }
            });
            const apiData = await apiRes.json();
            if (apiData.code === 0 && apiData.data) {
              return res.json({ 
                title: apiData.data.title, 
                description: apiData.data.desc || apiData.data.dynamic || ""
              });
            }
          } catch (apiErr) {
            console.error("Bilibili API error:", apiErr);
          }
        }
      }

      // Standard scraping for other sites or as fallback
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
      });
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const title = $("title").text() || $("meta[property='og:title']").attr("content") || "";
      const description = $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "";
      
      res.json({ title, description });
    } catch (error) {
      console.error("Scrape error:", error);
      res.status(500).json({ error: "Failed to scrape metadata", details: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // AI Proxy endpoint to avoid CORS issues
  app.post("/api/ai/proxy", async (req, res) => {
    const { url, method, headers, body } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await fetch(url, {
        method: method || "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("Proxy Error:", error);
      res.status(500).json({ 
        error: "Failed to fetch from custom AI URL", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
