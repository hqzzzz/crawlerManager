import axios from 'axios';
import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';
import path from 'path';
import pLimit from 'p-limit';
import { fileURLToPath } from 'url';

// 获取当前文件目录 (ES Module 兼容)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
let DB_PATH = path.join(__dirname, '..', '..','data',  "crawler.db");
let sqliteDb;
const CONCURRENCY_LIMIT = 6; // 并发数，建议 3-10

// --- 数据库辅助函数 (同步操作，因为 better-sqlite3 是同步的) ---

function initDB() {
    sqliteDb = new Database(DB_PATH);

    // 创建基础表
    sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scriptId TEXT,
      ownerId TEXT,
      post TEXT,
      title TEXT,
      link TEXT,
      image TEXT,
      image_src TEXT,
      date TEXT,
      image_url TEXT,
      image_base64 TEXT,
      sid TEXT,
      actress TEXT,
      magnets TEXT,
      raw TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      sid TEXT,
      UNIQUE(sid) 
    )
  `);

    // 尝试添加列 (SQLite 不支持直接 ALTER TABLE ADD COLUMN IF NOT EXISTS，需要检查)
    try {
        const tableInfo = sqliteDb.prepare("PRAGMA table_info(results)").all();
        const columnNames = tableInfo.map(col => col.name);

        if (!columnNames.includes('image_src')) {
            sqliteDb.exec("ALTER TABLE results ADD COLUMN image_src TEXT");
            console.log("[DB] Added column: image_src");
        }
        if (!columnNames.includes('sid')) {
            sqliteDb.exec("ALTER TABLE results ADD COLUMN sid TEXT");
            console.log("[DB] Added column: sid");
        }
        if (!columnNames.includes('actress')) {
            sqliteDb.exec("ALTER TABLE results ADD COLUMN actress TEXT");
            console.log("[DB] Added column: actress");
        }
    } catch (e) {
        console.warn("[DB] Migration warning:", e.message);
    }
}

// 封装数据库查询 (同步)
function queryAll(sql, params = []) {
    return sqliteDb.prepare(sql).all(...params);
}

function queryRun(sql, params = []) {
    return sqliteDb.prepare(sql).run(...params);
}

// 核心保存逻辑：更新或插入 (Upsert)
function saveOrUpdateToDb(sid, actress, url, id) {
    // 先检查是否存在相同 sid 的记录
    try {
        // Update existing record
        queryRun(
            "UPDATE results SET actress = ?, sid = ? WHERE id = ?",
            [actress || null, sid || null, id]
        );
        console.log(`[DB] Updated record ID ${id} with actress: ${actress}`);
        console.log(`[DB] Updated record ID ${id} with sid: ${sid}`);
    } catch (err) {
        console.error(`[DB] Error saving/updating record for sid: ${sid} - ${err.message}`);
    }
}

// --- 网络与解析 ---

async function fetchHtml(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        console.error(`[HTTP] 请求失败: ${url} - ${error.message}`);
        return null;
    }
}

   // --- 解析帖子详情页  const metaContent = $('meta[name="description"]').attr('content') || '';---
function extractMetaInfo(metaContent) {
    console.log(`[解析] 原始 meta sid 内容: "${metaContent}"`);
    if (!metaContent) return { id: null, title: null, actress: null };
    let id = null;
    let title = null;
    let actress = null;
    // 1. 定义正则
    // 番号正则：匹配 (麻豆番号 | 香蕉番號...) : 空格 (可选) 内容 (字母数字横杠)
    const idRegex = /(麻豆番号|香蕉番號|番號|片號)[:：]\s*([A-Za-z0-9-]+)/i;
    // 女郎正则：匹配 (麻豆女郎 | 女郎...) : 空格 (可选) 内容 (直到遇到 下載地址 或 结尾)
    // 注意：这里使用 [\s\S]*? 非贪婪匹配，防止吞掉后面的“下載地址”
    const actressRegex = /(麻豆女郎|女郎|主演|演員)[:：]\s*([\s\S]*?)(?=\s*(?:下載地址|下載|$))/i;
    const TITLE_REGEX = /(麻豆片名|杏吧片名|糖心片名|香蕉片名|片名)[:：]\s*(.+?)(?=\s*(?:麻豆女郎|麻豆片名|杏吧片名|糖心片名|香蕉片名|下载地址|下载|$))/i;
    // 2. 提取番号
    const idMatch = metaContent.match(idRegex);
    if (idMatch && idMatch[2]) {
      id = idMatch[2].trim().replace(" ", '');
    }
    const titleMatch = metaContent.match(TITLE_REGEX);
    if (titleMatch && titleMatch[2]) {
      title = titleMatch[2].trim().replace("下載地址：","").replace(" ", '');;
      if (title.length === 0) title = null;
    }
    const actressMatch = metaContent.match(actressRegex);
    if (actressMatch && actressMatch[2]) {
      actress = actressMatch[2].trim().replace("下載地址：","").replace(" ", ''); 
    }
    console.log(`[解析] 提取结果 - ID: "${id}", Title: "${title}", Actress: "${actress}"`);
    return {
      sid: id,
      title: title,
      actress: actress
    };
  }

function parseHtml(html) {
    if (!html) return { sid: null, actress: null };
    const $ = cheerio.load(html);
    const metaContent = $('meta[name="description"]').attr('content') || '';
    // 2. 解析
    const data = extractMetaInfo(metaContent);


    return { sid: data.sid, actress: data.actress };
}

// --- 并发处理逻辑 ---

async function processPosts(rows) {
    const limit = pLimit(CONCURRENCY_LIMIT);
    console.log(`\n🚀 开始并发处理，共 ${rows.length} 条数据，并发数: ${CONCURRENCY_LIMIT}\n`);

    const tasks = rows.map(post => {
        return limit(async () => {
            try {
                console.log(`⏳ [${post.id}] 正在访问: ${post.link} \r\n (${post.title})`);

                const html = await fetchHtml(post.link);
                if (!html) {
                    console.warn(`⚠️ [${post.id}] 获取 HTML 失败，跳过`);
                    return;
                }

                const data = parseHtml(html);

                if (data.sid || data.actress) {
                    // 直接调用同步函数，不需要 await
                    saveOrUpdateToDb(data.sid, data.actress, post.link, post.id);
                    console.log(`✅ [${post.id}] 处理成功: ${data.sid} - ${data.actress}`);
                } else {
                    //console.warn(`⚠️ [${post.id}] 未能提取完整数据`);
                    //console.log(`  描述: "${data.sid}", 演员: "${data.actress}"`);
                }
            } catch (err) {
                console.error(`❌ [${post.id}] 任务执行异常: ${err.message}`);
                // 记录错误但不中断其他任务
            }
        });
    });

    // 等待所有任务完成
    const results = await Promise.allSettled(tasks);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;

    console.log(`\n🏁 处理完成!`);
    console.log(`成功: ${successCount}, 失败: ${failedCount}`);
}

// --- 主流程 ---

async function main() {
    try {
        initDB();

        // 查询需要处理的记录 (这里假设所有记录都需要检查，或者你可以加 WHERE 条件)
        // 示例：只处理 sid 为空的记录
        const rows = queryAll(
            "SELECT id, title, sid, actress, link FROM results ORDER BY id ASC"
        );

        if (rows.length === 0) {
            console.log("📭 没有需要处理的数据。");
            return;
        }

        let filter_row = [];
        rows.forEach(row => {
            if (row.link && (!row.sid || row.sid.length === 0) && (!row.actress || row.actress.length === 0)) {
                filter_row.push(row);
            }
        });


        await processPosts(filter_row);

    } catch (err) {
        console.error('❌ 主程序发生未捕获错误:', err);
    } finally {
        if (sqliteDb) {
            sqliteDb.close();
            console.log('🔒 数据库连接已关闭。');
        }
    }
}

main();