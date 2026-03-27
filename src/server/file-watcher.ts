import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { queryAll, queryRun } from "./db.js";

interface PostData {
  id?: string | number;
  title: string;
  link?: string;
  content?: string;
  date?: string;
  image?: string;
  image_url?: string;
  image_src?: string;
  image_base64?: string;
  magnets?: string;
  post?: string;
  raw?: any;
  timestamp?: string;
  scriptId?: string;
  ownerId?: string;
}

// Log helper with timestamp
function log(message: string) {
  const timestamp = new Date().toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false // 使用 24 小时制
});
  console.log(`[FileWatcher ${timestamp}] ${message}`);
}

// 从链接中提取名称（复用 routes.ts 的逻辑）
function extractNameFromLink(link: string): string {
  try {
    const pathname = new URL(link).pathname;
    const segments = pathname.replace(/^\/|\/$/g, "").split("/");
    return segments.filter(s => s).pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

// 保存 base64 图片到服务器（复用 routes.ts 的逻辑）
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

export function setupFileWatcher() {
  const resultDir = path.join(process.cwd(), "crawlerXnode", "result");
  if (!fs.existsSync(resultDir)) {
    log("Result directory does not exist, waiting for creation...");
    return;
  }

  log(`Starting file watcher on: ${resultDir}`);

  const watcher = chokidar.watch(resultDir, {
    ignored: /(^|[\/\\])\./, // ignore dot files
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 1000
    }
  });

  watcher
    .on("add", (filePath) => {
      log(`📄 New file detected: ${path.basename(filePath)}`);
      handleFileChange(filePath, "added");
    })
    .on("change", (filePath) => {
      log(`📝 File modified: ${path.basename(filePath)}`);
      handleFileChange(filePath, "modified");
    })
    .on("unlink", (filePath) => {
      log(`🗑️ File deleted: ${path.basename(filePath)}`);
      handleFileChange(filePath, "deleted");
    })
    .on("error", (error) => {
      log(`❌ Watcher error: ${error.message}`);
    });
}

async function handleFileChange(filePath: string, eventType: string) {
  const filename = path.basename(filePath);

  // Only process all_posts*.json files
  if (!filename.startsWith("all_posts") || !filename.endsWith(".json")) {
    return;
  }

  log(`Processing ${eventType} event for: ${filename}`);

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    // Handle both array and object with posts property
    const posts: PostData[] = Array.isArray(data) ? data : (data.posts || []);

    if (posts.length === 0) {
      log(`⚠️ No posts found in ${filename}`);
      return;
    }

    // Extract scriptId from directory name
    const scriptId = path.basename(path.dirname(filePath));

    // Get ownerId - use the script's ownerId or default to "admin" to match frontend
    const scripts: any[] = await queryAll("SELECT ownerId FROM scripts WHERE id = ?", [scriptId]);
    const ownerId = scripts.length > 0 ? scripts[0].ownerId : "admin";

    // Extract fileDate from filename (e.g., all_posts_20260319.json -> 20260319)
    const fileDate = filename.replace("all_posts_", "").replace(".json", "");

    log(`📋 Script ID: ${scriptId}, Date: ${fileDate}, Total posts: ${posts.length}`);

    let syncedCount = 0;
    let updatedCount = 0;

    for (const post of posts) {
      const link = post.link;
      if (!link) {
        continue;
      }

      if (!(post.image_src || post.image_base64)) {
        continue;
      }

      if (!post.image_src && post.image_base64 && typeof post.image_base64 === 'string' && post.image_base64.startsWith('data:image')) {
        const name = extractNameFromLink(post.link || '');
        const result = saveBase64Image(post.image_base64, scriptId, name);

        if (result.success) {
          post.image_src = result.filename;
          log(`🖼️ Converted image: ${post.image_src} for ${post.link}`);
        } else {
          log(`❌ Image conversion failed: ${result.error} for ${post.link}`);
        }
      }
      //存在 image_src ;
      else if (post.image_src && scriptId) {
        const sourcePath = path.join(process.cwd(), "crawlerXnode", "result", scriptId, "images", image_src);
        const targetDir = path.join(process.cwd(), "data", "images");
        const targetPath = path.join(targetDir, post.image_src);

        if (fs.existsSync(sourcePath)) {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          // Copy file
          fs.copyFileSync(sourcePath, targetPath);
          console.log(`[Import] Copied image: ${post.image_src}`);
        }
      }

      //相同链接的帖子只更新不新增，避免重复数据过多
      const existing: any[] = await queryAll(
        "SELECT id FROM results WHERE link = ?", [link]
      );

      if (existing.length > 0) {
        // Update existing record
        await queryRun(
          `UPDATE results SET 
            post = ?, title = ?, image = ?, image_src = ?,   date = ?, 
            image_url = ?, image_base64 = ?, magnets = ?, 
            raw = ?, timestamp = ?
           WHERE link = ?`,
          [
            post.post || null,
            post.title || "",
            post.image || null,
            post.image_src || null,
            post.date || null,
            post.image_url || null,
            post.image_base64 || null,
            post.magnets || null,
            typeof post.raw === "string" ? post.raw : JSON.stringify(post),
            post.timestamp || new Date().toISOString(),
            link
          ]
        );
        updatedCount++;
      } else {
        // Insert new post
        await queryRun(
          `INSERT INTO results (scriptId, ownerId, post, title, link, image, image_src, date, image_url, image_base64, magnets, raw, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            scriptId,
            ownerId,
            post.post || null,
            post.title || "",
            link,
            post.image || null,
            post.image_src || null,
            post.date || null,
            post.image_url || null,
            post.image_base64 || null,
            post.magnets || null,
            typeof post.raw === "string" ? post.raw : JSON.stringify(post),
            post.timestamp || new Date().toISOString()
          ]
        );
        syncedCount++;
      }
    }

    log(`✅ Sync complete: ${syncedCount} new posts imported, ${updatedCount} duplicates updated`);
  } catch (e: any) {
    log(`❌ Error processing ${filename}: ${e.message}`);
  }
}
