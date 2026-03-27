import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import Parser from "rss-parser";
import { Feed } from "feed";
import { queryAll, queryRun } from "./db.js";
import { executeScript } from "./crawler-engine.js";

const parser = new Parser();

// 从链接中提取名称
function extractNameFromLink(link: string): string {
  try {
    const pathname = new URL(link).pathname;
    const segments = pathname.replace(/^\/|\/$/g, "").split("/");
    return segments.filter(s => s).pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

//保存base64图片到服务器，并返回文件名
function saveBase64Image(base64Data: string, scriptId: string, customName: string): { success: boolean; filename?: string; error?: string } {
  try {
    const extMatch = base64Data.match(/^data:image\/(\w+);base64,/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';

    const targetDir = path.join(process.cwd(), 'data', 'images');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filename = `${customName}.${ext}`;
    const filepath = path.join(targetDir, filename);

    let finalFilename = filename;
    if (fs.existsSync(filepath)) {
      finalFilename = `${customName}_${Date.now()}.${ext}`;
    }

    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(targetDir, finalFilename), buffer);

    return { success: true, filename: finalFilename };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}


// Generate random RSS key
function generateRSSKey(): string {
  return `rss_${uuidv4().replace(/-/g, '')}_${Date.now()}`;
}

// Rss密钥认证中间件
function authenticateRSSKey(req: any, res: any, next: any) {
  const apiKey = req.headers['x-rss-key'] || req.query.key;
  if (!apiKey) {
    return res.status(401).json({ success: false, message: "API key required" });
  }
  const keys = queryAll("SELECT * FROM rss_keys WHERE key = ?", [apiKey as string]) as unknown as any[];
  if (!keys || keys.length === 0) {
    return res.status(403).json({ success: false, message: "Invalid API key" });
  }
  req.rssKey = keys[0];
  next();
}

export function setupRoutes(app: express.Application) {
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
  const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_change_me";

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "24h" });
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  });

  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // Protect API routes
  app.use("/api/scripts", authenticateToken);
  app.use("/api/results", authenticateToken);
  app.use("/api/rss_subscriptions", authenticateToken);
  app.use("/api/execute", authenticateToken);
  app.use("/api/rss", authenticateToken);
  app.use("/api/crawler-files", authenticateToken);
  app.use("/api/logs", authenticateToken);
  app.use("/api/all-posts", authenticateToken);
  app.use("/api/all-posts-files", authenticateToken);
  app.use("/api/all-posts-file", authenticateToken);

  // ============================================================
  // IMAGE API - New endpoints for image serving
  // ============================================================

  // GET /api/image/:scriptId/:filename - Serve image from /data/images/
  // Supports ?thumb=2k for thumbnail
  app.get("/api/image/:scriptId/:filename", async (req, res) => {
    const { scriptId, filename } = req.params;
    const thumb = req.query.thumb;

    // Security: prevent directory traversal
    const safeScriptId = path.basename(scriptId);
    const safeFilename = path.basename(filename);

    const dataImageDir = path.join(process.cwd(), "data", "images");
    const imagePath = path.join(dataImageDir, safeFilename);

    if (!fs.existsSync(imagePath)) {

      try {
        const results = await queryAll("SELECT id, title, image_src FROM results WHERE image_src = ? AND scriptId = ?", [safeFilename, safeScriptId]);
        if (results.length === 0) {
          console.log(`🔍 scriptId="${safeScriptId}" image_src="${safeFilename}" 未找到匹配的记录。`);
        }else if(results.length > 0) {
          results.forEach(async (element: any) => {
            await queryRun("UPDATE results SET image_src = NULL WHERE id = ? AND scriptId = ?", [element.id, safeScriptId]);
            console.log(`✅ 已将 scriptId="${safeScriptId}" id="${element.id}" 的 image_src 字段设置为 NULL。`);
          });
        }
        return res.status(202).json({ error: "SET image_src = NULL " });
      } catch (e: any) {
        console.error(`[Image API] Database update error: ${e.message}`);
      }
      return res.status(404).json({ error: "Image not found in database storage" });
    }

    // Get file stats
    const stats = fs.statSync(imagePath);
    const mimeType = getMimeType(safeFilename);

    // Thumbnail mode
    if (thumb === "2k") {
      const ext = path.extname(safeFilename);
      const thumbFilename = safeFilename.replace(ext, `_thumb_2k${ext}`);
      const thumbPath = path.join(dataImageDir, thumbFilename);

      // Return cached thumbnail if exists
      if (fs.existsSync(thumbPath)) {
        res.set({
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT'
        });
        return res.sendFile(thumbPath);
      }

      // Generate thumbnail
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        fs.writeFileSync(thumbPath, imageBuffer);

        res.set({
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'GENERATED'
        });
        return res.sendFile(thumbPath);
      } catch (err: any) {
        console.error(`[Image API] Thumbnail generation error: ${err.message}`);
        // Fallback to original image
      }
    }

    // Return full size image with long cache
    res.set({
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Cache': 'MISS'
    });
    res.sendFile(imagePath);
  });

  // GET /api/result-image/:scriptId/:filename - Serve image from /result/ (crawler source)
  app.get("/api/result-image/:scriptId/:filename", (req, res) => {
    const { scriptId, filename } = req.params;

    // Security: prevent directory traversal
    const safeScriptId = path.basename(scriptId);
    const safeFilename = path.basename(filename);

    const resultImageDir = path.join(process.cwd(), "crawlerXnode", "result", safeScriptId, "images");
    const imagePath = path.join(resultImageDir, safeFilename);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: "Image not found in crawler storage" });
    }

    const mimeType = getMimeType(safeFilename);
    res.set({
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400'
    });
    res.sendFile(imagePath);
  });

  // Helper function to get MIME type
  function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  // ============================================================
  // Crawler Files
  // ============================================================

  app.get("/api/crawler-files", (req, res) => {
    try {
      const crawlerDir = path.join(process.cwd(), "crawlerXnode", "crawler");
      if (!fs.existsSync(crawlerDir)) {
        return res.json([]);
      }
      const files = fs.readdirSync(crawlerDir).filter(f => f.endsWith('.js'));
      res.json(files);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // ============================================================
  // Scripts
  // ============================================================

  app.get("/api/scripts", async (req, res) => {
    try {
      const ownerId = req.query.ownerId;
      let rows;
      if (ownerId === "admin") {
        rows = await queryAll("SELECT * FROM scripts ORDER BY lastRun DESC");
      } else if (ownerId) {
        rows = await queryAll("SELECT * FROM scripts WHERE ownerId = ?", [ownerId]);
      } else {
        rows = await queryAll("SELECT * FROM scripts WHERE ownerId = 'public-user'");
      }
      res.json(rows);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // Execute script by ID (run button)
  app.post("/api/scripts/:id/run", async (req, res) => {
    const { ownerId } = req.query;
    const { code, params } = req.body;
    try {
      const scriptId = req.params.id;
      await queryRun("UPDATE scripts SET status = 'running' WHERE id = ?", [scriptId]);
      try {
        await executeScript(code || "", params || {}, scriptId, "admin");
        await queryRun("UPDATE scripts SET status = 'idle', lastRun = datetime('now') WHERE id = ?", [scriptId]);
        res.json({ success: true, message: "Execution completed" });
      } catch (err: any) {
        console.error(`Execution error for ${scriptId}:`, err);
        await queryRun("UPDATE scripts SET status = 'error' WHERE id = ?", [scriptId]);
        res.status(500).json({ success: false, error: err.message });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/scripts", async (req, res) => {
    const { id, name, code, cron: cronExpr, params, ownerId } = req.body;
    try {
      if (id) {
        await queryRun(
          "UPDATE scripts SET name = ?, code = ?, cron = ?, params = ? WHERE id = ?",
          [name, code, cronExpr, params, id]
        );
      } else {
        const newId = uuidv4().slice(0, 8);
        await queryRun(
          "INSERT INTO scripts (id, name, code, cron, params, ownerId) VALUES (?, ?, ?, ?, ?, ?)",
          [newId, name, code, cronExpr, params, ownerId || "public-user"]
        );
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.delete("/api/scripts/:id", async (req, res) => {
    try {
      await queryRun("DELETE FROM scripts WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });



  // ============================================================
  // Results - with pagination (include image_src)
  // ============================================================

  app.get("/api/results", async (req, res) => {
    try {
      const ownerId = req.query.ownerId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
      const offset = (page - 1) * limit;
      let rows;
      if (ownerId === "admin") {
        rows = await queryAll(
          "SELECT id, scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp FROM results ORDER BY timestamp DESC LIMIT ? OFFSET ?",
          [limit, offset]
        );
      } else if (ownerId) {
        rows = await queryAll(
          "SELECT id, scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp FROM results WHERE ownerId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
          [ownerId, limit, offset]
        );
      } else {
        rows = await queryAll(
          "SELECT id, scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp FROM results WHERE ownerId = 'public-user' ORDER BY timestamp DESC LIMIT ? OFFSET ?",
          [limit, offset]
        );
      }
      res.json(rows);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.delete("/api/results/:id", async (req, res) => {
    try {
      const id = req.params.id;

      // 先获取要删除的记录
      const result = await queryAll("SELECT id, scriptId, image_src FROM results WHERE id = ?", [id]);
      if (result.length === 0) {
        return res.status(404).json({ success: false, error: "Record not found" });
      }

      const record = result[0];
      const imageSrc = record.image_src;
      let imageRetained = false;

      // 如果有 image_src，检查是否被其他记录引用
      if (imageSrc) {
        const otherRecords = await queryAll(
          "SELECT id, scriptId FROM results WHERE image_src = ? AND id != ?",
          [imageSrc, id]
        );

        // 如果被其他记录引用，保留图片文件（不删除）
        if (otherRecords.length > 0) {
          imageRetained = true;
          console.log(`[Delete] Image "${imageSrc}" retained, referenced by ${otherRecords.length} other record(s)`);
        } else {
          // 如果没有其他记录引用，删除图片文件
          const imagePath = path.join(process.cwd(), "data", "images", imageSrc);
          if (fs.existsSync(imagePath)) {
            try {
              fs.unlinkSync(imagePath);
              console.log(`[Delete] Removed image: ${imagePath}`);
            } catch (err: any) {
              console.error(`[Delete] Failed to remove image: ${err.message}`);
            }
          }
        }
      }

      // 删除数据库记录
      await queryRun("DELETE FROM results WHERE id = ?", [id]);
      res.json({ success: true, imageRetained });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // Update a single result
  app.put("/api/results/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const updates = req.body;
      const allowedFields = ["scriptId", "ownerId", "post", "title", "link", "image", "image_src", "date", "image_url", "image_base64", "magnets", "raw", "timestamp"];

      const validUpdates: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          validUpdates[key] = value;
        }
      }

      if (Object.keys(validUpdates).length === 0) {
        return res.status(400).json({ success: false, error: "No valid fields to update" });
      }

      const setClause = Object.keys(validUpdates)
        .map(key => `${key} = ?`)
        .join(", ");
      const values = Object.values(validUpdates);
      values.push(id);

      await queryRun(`UPDATE results SET ${setClause} WHERE id = ?`, values);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // Import result to database - supports image_src
  app.post("/api/results/import", async (req, res) => {
    try {
      const { scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp } = req.body;

      // Check if a record with the same link exists
      let existing: any[] = [];
      if (link) {
        existing = await queryAll("SELECT id, image_src FROM results WHERE link = ?", [link]);
      }

      // Handle image_src: copy from /result/ to /data/images/ if provided
      if (image_src && scriptId) {
        const sourcePath = path.join(process.cwd(), "crawlerXnode", "result", scriptId, "images", image_src);
        const targetDir = path.join(process.cwd(), "data", "images");
        const targetPath = path.join(targetDir, image_src);

        if (fs.existsSync(sourcePath)) {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          // Copy file
          fs.copyFileSync(sourcePath, targetPath);
          console.log(`[Import] Copied image: ${image_src}`);
        }
      }

      if (existing.length > 0 && link) {
        // Update existing record
        await queryRun(
          "UPDATE results SET scriptId = ?, ownerId = ?, post = ?, title = ?, link = ?, image = ?, image_src = ?, date = ?, image_url = ?, image_base64 = ?, magnets = ?, raw = ?, timestamp = ? WHERE id = ?",
          [scriptId || 'unknown', ownerId || 'public-user', post || null, title || '', link || null, image || null, image_src || null, date || null, image_url || null, image_base64 || null, magnets || null, raw || null, timestamp || new Date().toISOString(), existing[0].id]
        );
        res.json({ success: true, action: 'updated', id: existing[0].id });
      } else {
        // Insert new record
        await queryRun(
          "INSERT INTO results (scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [scriptId || 'unknown', ownerId || 'public-user', post || null, title || '', link || null, image || null, image_src || null, date || null, image_url || null, image_base64 || null, magnets || null, raw || null, timestamp || new Date().toISOString()]
        );
        res.json({ success: true, action: 'inserted' });
      }
    } catch (e: any) {
      console.error("[API] Import result error:", e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 导入文件中的结果（批量导入，支持图片 base64 转换）
  app.post("/api/results/import-from-file", async (req, res) => {
    try {
      const { scriptId, filename, links } = req.body;

      if (!scriptId || !filename || !links || !Array.isArray(links)) {
        return res.status(400).json({ success: false, error: "Missing required parameters: scriptId, filename, links" });
      }

      // 1. Read the all_posts file from server
      const filePath = path.join(process.cwd(), "crawlerXnode", "result", scriptId, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: "File not found: " + filePath });
      }

      const fileContent = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(fileContent);
      const posts = Array.isArray(data) ? data : (data.posts || []);

      // 2. Filter posts by links
      const linksSet = new Set(links);
      const postsToImport = posts.filter(p => p.link && linksSet.has(p.link));

      if (postsToImport.length === 0) {
        return res.json({ success: true, total: 0, inserted: 0, skipped: 0, reason: "No matching posts" });
      }

      // 3. Check which links already exist in database
      const existingLinks = new Set();
      const linkChunks = [];
      const chunkSize = 100;

      for (let i = 0; i < postsToImport.length; i += chunkSize) {
        const chunk = postsToImport.slice(i, i + chunkSize);
        linkChunks.push(chunk);
      }

      for (const chunk of linkChunks) {
        const placeholders = chunk.map(() => "?").join(",");
        const existing = await queryAll(
          `SELECT link FROM results WHERE link IN (${placeholders})`,
          chunk.map(p => p.link)
        );
        for (const row of existing) {
          existingLinks.add(row.link);
        }
      }

      // 4. Import posts that don't exist
      let inserted = 0;
      let skipped = 0;

      for (const post of postsToImport) {
        if (existingLinks.has(post.link)) {
          skipped++;
          continue;
        }

        // Handle image: convert base64 to file if image_src not available
        let imageSrc = post.image_src || null;

        if (!imageSrc && post.image_base64 && typeof post.image_base64 === 'string' && post.image_base64.startsWith('data:image')) {
          const name = extractNameFromLink(post.link || '');
          const result = saveBase64Image(post.image_base64, scriptId, name);
          if (result.success) {
            imageSrc = result.filename;
            console.log(`[Import-File] Converted image: ${imageSrc} for ${post.link}`);
          } else {
            console.error(`[Import-File] Image conversion failed: ${result.error}`);
          }
        }

        // Insert into database (image_base64 is always null)
        await queryRun(
          `INSERT INTO results (scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            scriptId,
            post.ownerId || 'public-user',
            post.post || null,
            post.title || '',
            post.link || null,
            post.image || null,
            imageSrc || null,
            post.date || null,
            post.image_url || null,
            null, // image_base64 is always null
            post.magnets || null,
            typeof post.raw === 'string' ? post.raw : JSON.stringify(post.raw || {}),
            post.timestamp || new Date().toISOString()
          ]
        );
        inserted++;
      }

      res.json({
        success: true,
        total: postsToImport.length,
        inserted,
        skipped,
        message: `Imported ${inserted} posts, skipped ${skipped} duplicates`
      });

    } catch (e: any) {
      console.error("[API] Import from file error:", e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 得到结果总数（支持根据 ownerId 过滤）
  app.get("/api/results/count", async (req, res) => {
    try {
      const ownerId = req.query.ownerId;
      let count;
      if (ownerId === "admin") {
        const result: any = await queryAll("SELECT COUNT(*) as count FROM results");
        count = result[0]?.count || 0;
      } else if (ownerId) {
        const result: any = await queryAll("SELECT COUNT(*) as count FROM results WHERE ownerId = ?", [ownerId]);
        count = result[0]?.count || 0;
      } else {
        const result: any = await queryAll("SELECT COUNT(*) as count FROM results WHERE ownerId = 'public-user'");
        count = result[0]?.count || 0;
      }
      res.json({ count });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // 删除重复结果（忽略域名），优先保留带有 image_src 的记录
  app.post("/api/results/deduplicate", async (req, res) => {
    try {
      // 1. 获取所有记录（可以按需添加 WHERE 条件，如只获取 image_src 非空的）
      const allResults: any[] = await queryAll("SELECT id, title, image_src FROM results WHERE image_src IS NOT NULL");
      // 2. 根据 image_src + title 分组，对每组进行排序
      const imageSrcGroups: Map<string, any[]> = new Map();
      for (const result of allResults) {
        const key = `${result.image_src}:${result.title}`;
        if (!imageSrcGroups.has(key)) {
          imageSrcGroups.set(key, []);
        }
        imageSrcGroups.get(key)!.push(result);
      }
      const duplicateIds: number[] = [];
      let keptWithImageSrc = 0;
      let keptWithBase64 = 0;
      let keptWithoutImage = 0;
      // 3. 处理每组中的数据
      for (const [key, group] of imageSrcGroups) {
        if (group.length === 1) continue;
        const sortedGroup = [...group].sort((a, b) => {
          let aHasImageSrc = false;
          try {
            const aRaw = a.raw ? JSON.parse(a.raw) : {};
            aHasImageSrc = a.image_src ? true : (aRaw.image_src ? true : false);
          } catch {
          }
          let bHasImageSrc = false;
          try {
            const bRaw = b.raw ? JSON.parse(b.raw) : {};
            bHasImageSrc = b.image_src ? true : (bRaw.image_src ? true : false);
          } catch {
          }
          if (aHasImageSrc && !bHasImageSrc) return -1; // 优先保留有 image_src 的
          if (!aHasImageSrc && bHasImageSrc) return 1;
          if (a.image_base64 && typeof a.image_base64 === 'string' && a.image_base64.startsWith('data:image') &&
            !(b.image_base64 && typeof b.image_base64 === 'string' && b.image_base64.startsWith('data:image'))) {
            return -1;
          }
          if (!a.image_base64 && b.image_base64 && typeof b.image_base64 === 'string' && b.image_base64.startsWith('data:image')) {
            return 1;
          }
          return 0;
        });
        // 保留第一条（根据逻辑排序）
        const kept = sortedGroup[0];
        const hasImageSrc = kept.image_src ? true : (kept.raw ? JSON.parse(kept.raw).image_src : false);
        const hasImageBase64 =
          (kept.image_base64 && typeof kept.image_base64 === 'string' && kept.image_base64.startsWith('data:image')) ||
          (kept.raw ? JSON.parse(kept.raw).image_base64 && typeof JSON.parse(kept.raw).image_base64 === 'string' && JSON.parse(kept.raw).image_base64.startsWith('data:image') : false);
        if (hasImageSrc) {
          keptWithImageSrc++;
        } else if (hasImageBase64) {
          keptWithBase64++;
        } else {
          keptWithoutImage++;
        }
        // 收集重复的 id
        for (let i = 1; i < sortedGroup.length; i++) {
          duplicateIds.push(sortedGroup[i].id);
        }
      }
      // 4. 执行删除（使用事务更安全）
      let deletedCount = 0;
      if (duplicateIds.length > 0) {
        const placeholders = duplicateIds.map(() => "?").join(",");
        await queryRun(`DELETE FROM results WHERE id IN (${placeholders})`, duplicateIds);
        deletedCount = duplicateIds.length;
      }
      res.json({
        success: true,
        total: allResults.length,
        uniqueImageSrcPaths: imageSrcGroups.size,
        duplicates: duplicateIds.length,
        deleted: deletedCount,
        stats: {
          keptWithImageSrc,
          keptWithBase64,
          keptWithoutImage
        },
        message: "Duplicates removed successfully."
      });
    } catch (e: any) {
      res.status(500).send("An error occurred during deduplication: " + e.message);
    }
  });


  //获得重复结果的数量
  app.get("/api/results/duplicates", async (req, res) => {
    try {
      const result: any = await queryAll(`
        SELECT COUNT(*) as count FROM results WHERE id NOT IN (
          SELECT MIN(id) FROM results WHERE title IS NOT NULL GROUP BY title, image_src
        )
      `);
      const duplicateRecords = await queryAll(`
          SELECT * FROM results
          WHERE id NOT IN (
            SELECT MIN(id)
            FROM results
            WHERE title IS NOT NULL
            GROUP BY title,image_src
          )
          AND image_src IS NOT title;
      `);
      const count = result[0]?.count || 0;
      res.json({ count: count, results: duplicateRecords?.slice(0, 100) || [] });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // ============================================================
  // Logs
  // ============================================================

  app.get("/api/logs/file/:scriptId", async (req, res) => {
    try {
      const scriptId = req.params.scriptId;
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(process.cwd(), "crawlerXnode", "logs", `${date}_${scriptId}.log`);
      if (!fs.existsSync(logFile)) {
        return res.json([]);
      }
      const content = fs.readFileSync(logFile, "utf-8");
      const lines = content.split('\n');
      res.json(lines.map((line, index) => ({ id: index, content: line, timestamp: new Date().toISOString() })));
    } catch (e: any) {
      console.error(`[Logs API] Error: ${e.message}`);
      res.status(500).send(e.message);
    }
  });


  // ============================================================
  // All Posts - from database (include image_src)
  // ============================================================

  app.get("/api/all-posts", async (req, res) => {
    try {
      const ownerId = req.query.ownerId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
      const offset = (page - 1) * limit;
      let rows;
      if (ownerId === "admin") {
        rows = await queryAll(
          "SELECT id, scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp FROM results ORDER BY timestamp DESC LIMIT ? OFFSET ?",
          [limit, offset]
        );
      } else if (ownerId) {
        rows = await queryAll(
          "SELECT id, scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp FROM results WHERE ownerId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
          [ownerId, limit, offset]
        );
      } else {
        rows = await queryAll(
          "SELECT id, scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp FROM results WHERE ownerId = 'public-user' ORDER BY timestamp DESC LIMIT ? OFFSET ?",
          [limit, offset]
        );
      }
      const posts = rows.map((row: any) => ({
        ...row,
        fileDate: new Date(row.timestamp).toISOString().split('T')[0],
        filename: 'database'
      }));
      res.json(posts);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // ============================================================
  // All Posts Files - from crawler result directory
  // ============================================================

  app.get("/api/all-posts-files", async (req, res) => {
    try {
      const resultDir = path.join(process.cwd(), "crawlerXnode", "result");
      if (!fs.existsSync(resultDir)) {
        console.log("[API] result directory not found:", resultDir);
        return res.json([]);
      }

      const allPosts: any[] = [];

      const findFiles = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            findFiles(fullPath);
          } else if (entry.isFile() && entry.name.startsWith('all_posts') && entry.name.endsWith('.json')) {
            const scriptId = path.basename(dir);
            const fileDate = entry.name.replace('all_posts_', '').replace('.json', '');

            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const data = JSON.parse(content);
              const posts = Array.isArray(data) ? data : (data.posts || []);

              if (Array.isArray(posts) && posts.length > 0) {
                for (const post of posts) {
                  allPosts.push({
                    id: post.id || `${scriptId}_${fileDate}_${allPosts.length}`,
                    scriptId: post.scriptId || scriptId,
                    ownerId: post.ownerId || 'public-user',
                    post: post.post || null,
                    title: post.title || '',
                    link: post.link || null,
                    image: post.image || null,
                    image_src: post.image_src || null,
                    date: post.date || null,
                    image_url: post.image_url || null,
                    image_base64: post.image_base64 || null,
                    magnets: post.magnets || null,
                    raw: typeof post.raw === 'string' ? post.raw : JSON.stringify(post.raw || {}),
                    timestamp: post.timestamp || new Date().toISOString(),
                    fileDate: fileDate,
                    filename: entry.name
                  });
                }
              }
            } catch (e: any) {
              console.error(`[API] Failed to read file ${fullPath}:`, e.message);
            }
          }
        }
      };

      findFiles(resultDir);
      allPosts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      res.json(allPosts);
    } catch (e: any) {
      console.error(`[API] Error in all-posts-files:`, e.message);
      res.status(500).send(e.message);
    }
  });

  // Delete results file by filename
  app.delete("/api/all-posts-file/:scriptId/:filename", async (req, res) => {
    try {
      const { scriptId, filename } = req.params;
      const resultDir = path.join(process.cwd(), "crawlerXnode", "result", scriptId);
      const filePath = path.join(resultDir, filename);

      if (!filename.match(/^all_posts_\d+\.json$/)) {
        return res.status(400).json({ success: false, message: "Invalid filename format" });
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true, message: `File ${filename} deleted` });
      } else {
        res.status(404).json({ success: false, message: `File not found: ${filename}` });
      }
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // Delete results by scriptId and date
  app.delete("/api/all-posts/:scriptId/:fileDate", async (req, res) => {
    try {
      const { scriptId, fileDate } = req.params;
      const { ownerId } = req.query;
      const startDate = `${fileDate} 00:00:00`;
      const endDate = `${fileDate} 23:59:59`;

      await queryRun(
        "DELETE FROM results WHERE scriptId = ? AND ownerId = ? AND timestamp >= ? AND timestamp <= ?",
        [scriptId, ownerId || "public-user", startDate, endDate]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // Delete a single post by ID
  app.delete("/api/posts/:id", async (req, res) => {
    try {
      await queryRun("DELETE FROM results WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // ============================================================
  // RSS Subscriptions
  // ============================================================

  app.get("/api/rss_subscriptions", async (req, res) => {
    try {
      const ownerId = req.query.ownerId || "public-user";
      const rows = await queryAll("SELECT * FROM rss_subscriptions WHERE ownerId = ?", [ownerId]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.post("/api/rss_subscriptions", async (req, res) => {
    const { url, name, ownerId } = req.body;
    try {
      await queryRun("INSERT INTO rss_subscriptions (url, name, ownerId) VALUES (?, ?, ?)", [url, name || "", ownerId || "public-user"]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.delete("/api/rss_subscriptions/:id", async (req, res) => {
    try {
      await queryRun("DELETE FROM rss_subscriptions WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // ============================================================
  // RSS Keys Management
  // ============================================================

  app.get("/api/rss_keys", async (req, res) => {
    try {
      const rows = await queryAll("SELECT * FROM rss_keys ORDER BY createdAt DESC");
      res.json(rows);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.post("/api/rss_keys", async (req, res) => {
    const { name } = req.body;
    try {
      const key = generateRSSKey();
      await queryRun("INSERT INTO rss_keys (key, name, ownerId) VALUES (?, ?, ?)", [key, name || "RSS Key", "admin"]);
      res.json({ success: true, key });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.delete("/api/rss_keys/:id", async (req, res) => {
    try {
      await queryRun("DELETE FROM rss_keys WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // ============================================================
  // RSS Feed
  // ============================================================

  // RSS Feed (需要认证) - 必须在 /api/feed/:scriptId 之前定义（具体路由优先）
  app.get("/api/feed/rss", authenticateRSSKey, async (req: any, res: any) => {
    try {
      const keywords = (req.query.keywords || "").toString();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      console.log(`[RSS Feed] Querying results with keywords: "${keywords}"`);
      let rows: any[] = [];

      try {
        if (keywords.trim()) {
          // 有关键词：在 SQL 层面过滤，搜索 title 和 post 字段
          const keywordArray = keywords
            .split(/[\s+]+/)
            .map((k: string) => k.trim())
            .filter((k: string) => k);
          console.log(`[RSS Feed] Filtering by keywords in SQL:`, keywordArray);

          // 构建 LIKE 条件：每个关键词都需要匹配 (AND)，搜索 title 或 post (OR)
          const likeConditions = keywordArray
            .map(() => "(title LIKE ? OR post LIKE ?)")
            .join(" AND ");
          const likeParams = keywordArray.flatMap((kw) => [`%${kw}%`, `%${kw}%`]);
          const sql = `SELECT * FROM results WHERE ${likeConditions} ORDER BY timestamp DESC LIMIT 100`;
          rows = await queryAll(sql, likeParams);
          console.log(
            `[RSS Feed] SQL query with keywords succeeded, found ${rows.length} results`
          );
        } else {
          // 无关键词：返回最新的 100 条
          rows = await queryAll(
            "SELECT * FROM results ORDER BY timestamp DESC LIMIT 100"
          );
          console.log(
            `[RSS Feed] Query succeeded, found ${rows.length} results`
          );
        }
      } catch (queryError: any) {
        console.error(`[RSS Feed] Query error: ${queryError.message}`);
        console.error(`[RSS Feed] Error stack: ${queryError.stack}`);
        return res.status(500).json({
          success: false,
          error: `Database query error: ${queryError.message}`,
        });
      }

      // 已在 SQL 层面过滤，无需再次过滤
      const filteredRows = rows;

      const feed = new Feed({
        title: "Crawler RSS Feed",
        description: "Latest crawled posts with keyword filtering",
        id: "crawler-rss",
        link: baseUrl,
        copyright: "All rights reserved",
        updated: new Date(),
        generator: "Crawler Manager RSS",
      });

      filteredRows.forEach((data: any) => {
        let enclosure: any = undefined;

        // 检查 enclosure URL 的有效性
        let enclosureUrl = "";
        if (data.image_src) {
          // 使用完整 URL
          enclosureUrl = `${baseUrl}/api/image/${data.scriptId}/${data.image_src}`;
          // 确保 image_src 不是空字符串或无效值
          if (!data.image_src || data.image_src.startsWith('http')) {
            enclosureUrl = "";
          }
        } else if (data.image_base64) {
          enclosureUrl = `data:image/jpeg;base64,${data.image_base64}`;
        } else if (data.image_url) {
          enclosureUrl = data.image_url;
        }

        if (enclosureUrl) {
          enclosure = {
            url: enclosureUrl,
            type: "image/jpeg",
            length: data.image_base64 ? data.image_base64.length : 0,
          };
        }

        // 确保 link 是有效的 URL，如果没有则使用 id 作为占位符
        const validLink = data.link && data.link.startsWith('http') ? data.link : `#${data.id}`;

        // 调试日志：输出 problematic 数据
        if (!data.link || !data.link.startsWith('http')) {
          console.log(`[RSS Feed] Warning: Invalid link for item ${data.id}, using fallback: ${validLink}`);
          console.log(`[RSS Feed] Original link value: "${data.link}"`);
        }

        feed.addItem({
          title: data.title || "No Title",
          id: data.id.toString(),
          link: validLink,
          description: data.post || "",
          content: `
            <div>
              <p>${data.post || ""}</p>
              ${enclosure
              ? `<img src="${enclosure.url}" style="max-width:100%;" />`
              : ""
            }
              ${data.magnets
              ? `<p><strong>磁力链接:</strong><br/>${String(
                data.magnets
              ).replace(/\n/g, "<br/>")}</p>`
              : ""
            }
            </div>
          `,
          date: data.timestamp ? new Date(data.timestamp) : new Date(),
          enclosure: enclosure,
        });
      });

      res.set("Content-Type", "application/rss+xml");
      res.send(feed.rss2());
    } catch (error: any) {
      console.error(`[RSS Feed Error]: ${error.message}`);
      res.status(500).send(error.message);
    }
  });

  app.get("/api/feed/json", authenticateRSSKey, async (req: any, res: any) => {
    try {
      const keywords = (req.query.keywords || "").toString();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      console.log(
        `[RSS Feed JSON] Querying results with keywords: "${keywords}"`
      );

      let rows: any[] = [];
      if (keywords.trim()) {
        // 有关键词：在 SQL 层面过滤，搜索 title 和 post 字段
        const keywordArray = keywords
          .split(/[\s+]+/)
          .map((k: string) => k.trim())
          .filter((k: string) => k);
        console.log(`[RSS Feed JSON] Filtering by keywords in SQL:`, keywordArray);

        // 构建 LIKE 条件：每个关键词都需要匹配 (AND)，搜索 title 或 post (OR)
        const likeConditions = keywordArray
          .map(() => "(title LIKE ? OR post LIKE ?)")
          .join(" AND ");
        const likeParams = keywordArray.flatMap((kw) => [`%${kw}%`, `%${kw}%`]);
        const sql = `SELECT * FROM results WHERE ${likeConditions} ORDER BY timestamp DESC LIMIT 100`;
        rows = await queryAll(sql, likeParams);
        console.log(
          `[RSS Feed JSON] SQL query with keywords succeeded, found ${rows.length} results`
        );
      } else {
        rows = await queryAll(
          "SELECT * FROM results ORDER BY timestamp DESC LIMIT 100"
        );
        console.log(
          `[RSS Feed JSON] Found ${rows.length} results in database`
        );
      }

      const filteredRows = rows;

      res.json({
        success: true,
        count: filteredRows.length,
        keywords: keywords,
        items: filteredRows.map((row: any) => ({
          id: row.id,
          title: row.title,
          link: row.link,
          post: row.post,
          image_src: row.image_src,
          image_base64: row.image_base64,
          image_url: row.image_url,
          magnets: row.magnets,
          date: row.timestamp,
          dateFormatted: row.timestamp ? new Date(row.timestamp).toLocaleString("zh-CN") : "Unknown",
        })),
      });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });
  // ============================================================
  // Execute Script
  // ============================================================

  app.post("/api/execute", async (req, res) => {
    const { code, params, scriptId, ownerId } = req.body;
    try {
      if (scriptId) {
        await queryRun("UPDATE scripts SET status = 'running' WHERE id = ?", [scriptId]);
      }
      try {
        await executeScript(code, params, scriptId || "manual", ownerId || "public-user");
        if (scriptId) {
          await queryRun("UPDATE scripts SET status = 'idle', lastRun = datetime('now') WHERE id = ?", [scriptId]);
        }
        res.json({ success: true, message: "Execution completed" });
      } catch (err: any) {
        console.error(`Execution error for ${scriptId}:`, err);
        if (scriptId) {
          await queryRun("UPDATE scripts SET status = 'error' WHERE id = ?", [scriptId]);
        }
        res.status(500).json({ success: false, error: err.message });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // RSS Proxy
  // ============================================================

  app.get("/api/rss", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("URL required");
    try {
      const feed = await parser.parseURL(url as string);
      res.json(feed);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });

  // ============================================================
  // RSS Feed by scriptId
  // ============================================================

  app.get("/api/feed/:scriptId", async (req, res) => {
    const { scriptId } = req.params;
    try {
      const rows: any = await queryAll("SELECT * FROM results WHERE scriptId = ? ORDER BY timestamp DESC LIMIT 50", [scriptId]);

      const feed = new Feed({
        title: `Crawler Results for ${scriptId}`,
        description: "Latest crawled posts",
        id: scriptId,
        link: process.env.APP_URL || "http://localhost:3000",
        copyright: "All rights reserved",
        updated: new Date(),
        generator: "JS Script Manager",
      });

      rows.forEach((data: any) => {
        feed.addItem({
          title: data.title,
          id: data.id.toString(),
          link: data.url || "",
          description: data.content,
          content: data.content,
          date: new Date(data.timestamp),
        });
      });

      res.set("Content-Type", "application/rss+xml");
      res.send(feed.rss2());
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });
}

