import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { initDB, queryAll, queryRun } from "./db.js";
import { setupScheduler } from "./scheduler.js";
import { setupFileWatcher } from "./file-watcher.js";
import { setupRoutes } from "./routes.js";

interface PostData {
  id?: string | number;
  title: string;
  link?: string;
  content?: string;
  date?: string;
  image?: string;
  image_url?: string;
  image_base64?: string;
  magnets?: string;
  post?: string;
  raw?: any;
  timestamp?: string;
  scriptId?: string;
  ownerId?: string;
}

async function scanAndImportAllPosts(): Promise<{ count: number; files: string[] }> {
  const resultDir = path.join(process.cwd(), "crawlerXnode", "result");
  
  if (!fs.existsSync(resultDir)) {
    return { count: 0, files: [] };
  }

  const files: string[] = [];
  let totalImported = 0;

  // Recursively find all all_posts*.json files
  const findFiles = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findFiles(fullPath);
      } else if (entry.isFile() && entry.name.startsWith('all_posts') && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  };

  findFiles(resultDir);

  if (files.length === 0) {
    return { count: 0, files: [] };
  }

  console.log(`Found ${files.length} all_posts files to import`);

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const scriptId = path.basename(path.dirname(filePath));
    
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      const posts: PostData[] = Array.isArray(data) ? data : (data.posts || []);
      
      if (posts.length === 0) continue;

      // Get ownerId - use the script's ownerId or default to "admin" to match frontend
      const scripts: any[] = await queryAll("SELECT ownerId FROM scripts WHERE id = ?", [scriptId]);
      const ownerId = scripts.length > 0 ? scripts[0].ownerId : "admin";
      const fileDate = filename.replace("all_posts_", "").replace(".json", "");

      let importedCount = 0;
      
      for (const post of posts) {
        const url = post.link || post.url;
        if (!url) continue;

        // Check if exists (using 'link' column)
        const existing: any[] = await queryAll(
          "SELECT id FROM results WHERE scriptId = ? AND link = ?",
          [scriptId, url]
        );

        if (existing.length > 0) continue;

        await queryRun(
          `INSERT INTO results 
           (scriptId, ownerId, post, title, link, image, date, image_url, image_base64, magnets, raw, timestamp) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            scriptId,
            ownerId,
            post.post || null,
            post.title || "",
            url,
            post.image || null,
            post.date || null,
            post.image_url || null,
            post.image_base64 || null,
            post.magnets || null,
            typeof post.raw === "string" ? post.raw : JSON.stringify(post),
            post.timestamp || new Date().toISOString()
          ]
        );
        
        importedCount++;
      }
      
      totalImported += importedCount;
      console.log(`Imported ${importedCount} posts from ${filename}`);
    } catch (e: any) {
      console.error(`Error importing ${filePath}:`, e.message);
    }
  }

  return { count: totalImported, files };
}

async function startServer() {
  await initDB();
  
  const app = express();
  const PORT = 3000;
  
  app.use(express.json({ limit: "50mb" }));
  app.use("/crawlerXnode", express.static(path.join(process.cwd(), "crawlerXnode")));
  
  // Setup API routes
  setupRoutes(app);
  
  // Add import endpoint
  app.post("/api/import-all-posts", async (req, res) => {
    try {
      const { importData } = req.body;
      
      if (importData) {
        const result = await scanAndImportAllPosts();
        res.json({ success: true, imported: result.count, files: result.files });
      } else {
        res.json({ success: true, imported: 0 });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
  
  // Check for existing data on startup
  // 检查是否需要导入数据
  app.get("/api/check-import-needed", async (req, res) => {
    try {
      const resultDir = path.join(process.cwd(), "crawlerXnode", "result");
      
      if (!fs.existsSync(resultDir)) {
        return res.json({ needed: false, reason: "No result directory" });
      }
      
      // Check if database has data
      const existingCount: any = await queryAll("SELECT COUNT(*) as count FROM results");
      const hasData = existingCount[0].count > 0;
      
      if (hasData) {
        return res.json({ needed: false, reason: "Database already has data" });
      }
      
      // Check for all_posts files
      const files: string[] = [];
      const findFiles = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            findFiles(fullPath);
          } else if (entry.isFile() && entry.name.startsWith('all_posts') && entry.name.endsWith('.json')) {
            files.push(fullPath);
          }
        }
      };
      
      findFiles(resultDir);
      
      if (files.length > 0) {
        res.json({ needed: true, fileCount: files.length, files: files.map(f => path.basename(f)) });
      } else {
        res.json({ needed: false, reason: "No all_posts files found" });
      }
    } catch (e: any) {
      res.status(500).json({ needed: false, error: e.message });
    }
  });
  
  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    setupScheduler();
    setupFileWatcher();
  });
}

startServer();
