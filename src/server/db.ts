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

    // Add image_src column if not exists (migration)
    try {
      sqliteDb.exec(`ALTER TABLE results ADD COLUMN image_src TEXT`);
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
