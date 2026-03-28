import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import path from "path";

const DB_TYPE = process.env.DB_TYPE || "sqlite"; // 'sqlite' or 'mysql'
let sqliteDb: any;
let mysqlPool: any;

export async function initDB() {
  if (DB_TYPE === "mysql") {
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "crawler_manager",
      port: Number(process.env.DB_PORT) || 3306,
    });

    // Create tables
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS scripts (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code TEXT NOT NULL,
        cron VARCHAR(255),
        params TEXT,
        status VARCHAR(50) DEFAULT 'idle',
        lastRun DATETIME,
        ownerId VARCHAR(255) NOT NULL
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scriptId VARCHAR(255) NOT NULL,
        ownerId VARCHAR(255) NOT NULL,
        post VARCHAR(500),
        title VARCHAR(500),
        link VARCHAR(500),
        image VARCHAR(1000),
        image_src VARCHAR(1000),
        date VARCHAR(255),
        image_url VARCHAR(1000),
        image_base64 TEXT,
        sid TEXT,
        actress TEXT,
        magnets TEXT,
        raw TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS rss_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        url VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        ownerId VARCHAR(255) NOT NULL
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS rss_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255),
        ownerId VARCHAR(255) NOT NULL,
        keywords TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_results_scriptId ON results(scriptId)`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_results_ownerId ON results(ownerId)`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_results_link ON results(link(255))`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_results_timestamp ON results(timestamp)`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_results_scriptId_ownerId ON results(scriptId, ownerId)`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_scripts_ownerId ON scripts(ownerId)`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_scripts_lastRun ON scripts(lastRun)`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_ownerId ON rss_subscriptions(ownerId)`);
    await mysqlPool.query(`CREATE INDEX IF NOT EXISTS idx_rss_keys_key ON rss_keys(key)`);

    // Add image_src column if not exists (migration)
    try {
      await mysqlPool.query(`ALTER TABLE results ADD COLUMN image_src VARCHAR(1000)`);
    } catch (e: any) {
      // Column may already exist
      if (!e.message?.includes("Duplicate column")) {
        console.warn("[DB] Migration warning:", e.message);
      }
    }

    // Add new columns here - 在这里添加新字段示例:
    // await addColumnIfNotExists("results", "new_field_name", "VARCHAR(255)", "'default_value'");
    // await addColumnIfNotExists("scripts", "description", "TEXT");

  } else {
    const dbPath = path.join(process.cwd(), "data", "crawler.db");
    sqliteDb = new Database(dbPath);

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        cron TEXT,
        params TEXT,
        status TEXT DEFAULT 'idle',
        lastRun TEXT,
        ownerId TEXT NOT NULL
      )
    `);

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scriptId TEXT NOT NULL,
        ownerId TEXT NOT NULL,
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
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS rss_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        name TEXT,
        ownerId TEXT NOT NULL
      )
    `);

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS rss_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        name TEXT,
        ownerId TEXT NOT NULL,
        keywords TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_results_scriptId ON results(scriptId)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_results_ownerId ON results(ownerId)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_results_link ON results(link)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_results_timestamp ON results(timestamp)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_results_scriptId_ownerId ON results(scriptId, ownerId)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_scripts_ownerId ON scripts(ownerId)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_scripts_lastRun ON scripts(lastRun)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_ownerId ON rss_subscriptions(ownerId)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_rss_keys_key ON rss_keys(key)`);

    // Add new columns here - 在这里添加新字段示例:
    // await addColumnIfNotExists("results", "description", "TEXT");
    try {
      //sqliteDb.exec(`ALTER TABLE results ADD COLUMN image_src TEXT`);
      await addColumnIfNotExists("results", "image_src", "TEXT");
      await addColumnIfNotExists("results", "description", "TEXT");
      await addColumnIfNotExists("results", "actress", "TEXT");
    } catch (e: any) {
      // Column may already exist
      if (!e.message?.includes("duplicate column")) {
        console.warn("[DB] Migration warning:", e.message);
      }
    }

  }
}

// Helper to replace datetime('now') with NOW() for MySQL
function adaptQuery(sql: string): string {
  if (DB_TYPE === "mysql") {
    return sql.replace(/datetime\('now'\)/g, "NOW()");
  }
  return sql;
}

/**
 * 检查列是否存在，不存在则添加
 * @param tableName 表名
 * @param columnName 列名
 * @param columnType 列类型 (如 VARCHAR(255), TEXT, INT, DATETIME 等)
 * @param defaultValue 默认值 (可选)
 */
export async function addColumnIfNotExists(
  tableName: string,
  columnName: string,
  columnType: string,
  defaultValue?: string
) {
  const hasColumn = await checkColumnExists(tableName, columnName);
  if (!hasColumn) {
    let alterSql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
    if (defaultValue !== undefined) {
      alterSql += ` DEFAULT ${defaultValue}`;
    }
    try {
      if (DB_TYPE === "mysql") {
        await mysqlPool.query(alterSql);
        console.log(`[DB] Column added: ${columnName} to ${tableName}`);
      } else {
        sqliteDb.exec(alterSql);
        console.log(`[DB] Column added: ${columnName} to ${tableName}`);
      }
    } catch (e: any) {
      if (!e.message?.includes("Duplicate column") && !e.message?.includes("duplicate column")) {
        console.warn(`[DB] Warning adding column ${columnName}:`, e.message);
      }
    }
  } else {
    console.log(`[DB] Column already exists: ${columnName} in ${tableName}`);
  }
}

/**
 * 检查列是否存在
 * @param tableName 表名
 * @param columnName 列名
 */
export async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    if (DB_TYPE === "mysql") {
      const [rows]: any = await mysqlPool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [process.env.DB_NAME || "crawler_manager", tableName, columnName]
      );
      return rows.length > 0;
    } else {
      const rows = sqliteDb.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
      return rows.some((col) => col.name === columnName);
    }
  } catch (e: any) {
    console.warn(`[DB] Error checking column ${columnName}:`, e.message);
    return false;
  }
}

export async function queryAll(sql: string, params: any[] = []) {
  sql = adaptQuery(sql);
  if (DB_TYPE === "mysql") {
    const [rows] = await mysqlPool.query(sql, params);
    return rows;
  } else {
    return sqliteDb.prepare(sql).all(...params);
  }
}

export async function queryRun(sql: string, params: any[] = []) {
  sql = adaptQuery(sql);
  if (DB_TYPE === "mysql") {
    const [result] = await mysqlPool.execute(sql, params);
    return result;
  } else {
    return sqliteDb.prepare(sql).run(...params);
  }
}
