import vm from "vm";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { v4 as uuidv4 } from "uuid";
import { queryRun } from "./db.js";

import Database from 'better-sqlite3';
import pLimit from 'p-limit';

const LOGS_DIR = path.join(process.cwd(), "crawlerXnode", "logs");

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`[CrawlerEngine] Created logs directory: ${LOGS_DIR}`);
}

function getLogFile(scriptId: string): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOGS_DIR, `${date}_${scriptId}.log`);
}

function writeLogToFile(scriptId: string, content: string) {
  try {
    const logFile = getLogFile(scriptId);
    fs.appendFileSync(logFile, content + '\n');
    // 同时记录到控制台以便调试（仅前几行）
    if (content.includes('Script started') || content.includes('Script completed') || content.includes('[ERROR]')) {
      console.log(`[Log ${scriptId}] ${content}`);
    }
  } catch (e) {
    console.error("[CrawlerEngine] Failed to write log to file:", e);
  }
}

// 将参数对象转换为命令行风格的参数数组
function paramsToArgs(parsedParams: any): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(parsedParams)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (Array.isArray(value)) {
      args.push(`--${key}`);
      for (const v of value) {
        args.push(String(v));
      }
    } else if (value !== null && value !== undefined) {
      args.push(`--${key}`);
      args.push(String(value));
    }
  }
  return args;
}

export async function executeScript(
  code: string,
  params: any,
  scriptId: string,
  ownerId: string,
  onLog?: (msg: string) => void
) {
  // 从不同格式解析参数
  let parsedParams: any = {};

  if (typeof params === 'string') {
    const str = params.trim();
    // 首先尝试 JSON 格式
    if (str.startsWith('{')) {
      try {
        parsedParams = JSON.parse(str);
      } catch (e) {
        console.error('Failed to parse JSON params:', e);
        parsedParams = {};
      }
    } else {
      // 解析命令行风格：--key1 value1 --key2 value2 或 -key1 value1
      const args = str.match(/(?:-[^\s-]+\s+[^\s-]+|-[\w-]+)+/g) || [];
      for (const arg of args) {
        const match = arg.match(/-([\w-]+)\s+(.+)/);
        if (match) {
          const [, key, value] = match;
          // 如果看起来像数字，则尝试解析为数字
          parsedParams[key] = /^\d+$/.test(value) ? parseInt(value) : /^\d+\.\d+$/.test(value) ? parseFloat(value) : value;
        }
      }
    }
  } else if (typeof params === 'object' && params !== null) {
    parsedParams = params;
  }

  // 将参数转换为命令行参数
  const argsArray = paramsToArgs(parsedParams);

  console.log(`[CrawlerEngine] Parsed params:`, parsedParams);
  console.log(`[CrawlerEngine] Args array:`, argsArray);

  // 为本次运行清除/初始化日志文件
  try {
    const logFile = getLogFile(scriptId);
    console.log(`[CrawlerEngine] Initializing log file: ${logFile}`);
    console.log(`[CrawlerEngine] Logs dir exists: ${fs.existsSync(LOGS_DIR)}`);
    const startTime = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false // 使用 24 小时制
    });
    fs.writeFileSync(logFile, `[=== Script ${scriptId} started at ${startTime} ===]\n`);
    fs.appendFileSync(logFile, `[CrawlerEngine] Params: ${JSON.stringify(parsedParams)}\n`);
    fs.appendFileSync(logFile, `[CrawlerEngine] Args: ${argsArray.join(' ')}\n`);
    console.log(`[CrawlerEngine] Log file initialized successfully`);
  } catch (e: any) {
    console.error("[CrawlerEngine] Failed to initialize log file:", e.message);
  }

  const moduleObj = { exports: {} };

  // 创建带有 argv 的模拟进程对象
  const mockProcess = {
    ...process,
    argv: ['node', `${scriptId}.js`, ...argsArray],
    env: process.env,
    cwd: () => process.cwd(),
    exit: (code?: number) => {
      throw new Error(`Process.exit(${code}) called`);
    },
  };

  const context: any = {
    console: {
      log: (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const logLine = `[${new Date().toISOString()}] ${msg}`;
        onLog?.(logLine);
        writeLogToFile(scriptId, logLine);
      },
      error: (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const logLine = `[${new Date().toISOString()}] [ERROR] ${msg}`;
        onLog?.(logLine);
        writeLogToFile(scriptId, logLine);
      },
      warn: (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const logLine = `[${new Date().toISOString()}] [WARN] ${msg}`;
        onLog?.(logLine);
        writeLogToFile(scriptId, logLine);
      },
      info: (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const logLine = `[${new Date().toISOString()}] [INFO] ${msg}`;
        onLog?.(logLine);
        writeLogToFile(scriptId, logLine);
      },
      debug: (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const logLine = `[${new Date().toISOString()}] [DEBUG] ${msg}`;
        onLog?.(logLine);
        writeLogToFile(scriptId, logLine);
      },
    },
    module: moduleObj,
    exports: moduleObj.exports,
    params: parsedParams,
    // 同时直接提供参数供使用它的脚本使用
    axios,
    cheerio,
    url: { URL },
    path,
    Buffer,
    process: mockProcess,
    // 注入带有 argv 的模拟进程
    __filename: path.join(process.cwd(), "crawlerXnode", "crawler", `${scriptId}.js`),
    __dirname: path.join(process.cwd(), "crawlerXnode", "crawler"),
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    require: (moduleName: string) => {
      if (moduleName === "axios") return axios;
      if (moduleName === "cheerio") return cheerio;
      if (moduleName === "tough-cookie") return { CookieJar };
      if (moduleName === "url") return { URL };
      if (moduleName === "path") return path;
      if (moduleName === "fs") return context.fs;
      if (moduleName === "uuid") return { v4: uuidv4 };
      if (moduleName === "p-limit") return pLimit;
      if (moduleName === "better-sqlite3") return Database;
      try {
        const nodeModulesPath = path.resolve(process.cwd(), "crawlerXnode", "node_modules", moduleName);
        if (fs.existsSync(nodeModulesPath)) {
          return require(nodeModulesPath);
        }
      } catch (e) {
        // 忽略加载错误，继续尝试其他方式                                                                    
      }
      const localPath = path.resolve(process.cwd(), "crawlerXnode", "src", moduleName.endsWith(".js") ? moduleName : `${moduleName}.js`);
      if (fs.existsSync(localPath)) {
        const moduleCode = fs.readFileSync(localPath, "utf-8");
        const moduleDir = path.dirname(localPath);
        const moduleContext = {
          ...context,
          module: { exports: {} },
          exports: {},
          __filename: localPath,
          __dirname: moduleDir
        };
        vm.createContext(moduleContext);
        const moduleScript = new vm.Script(moduleCode);
        moduleScript.runInContext(moduleContext);
        return (moduleContext as any).module.exports || (moduleContext as any).exports;
      }
      throw new Error(`Module not found: ${moduleName}`);
    },
    fs: {
      readFileSync: (p: string, encoding: any) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        return fs.readFileSync(fullPath, encoding);
      },
      writeFileSync: (p: string, data: any, encoding: any) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return fs.writeFileSync(fullPath, data, encoding);
      },
      existsSync: (p: string) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        return fs.existsSync(fullPath);
      },
      mkdirSync: (p: string, options: any) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        return fs.mkdirSync(fullPath, options);
      },
      unlinkSync: (p: string) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        return fs.unlinkSync(fullPath);
      },
      readdirSync: (p: string, options: any) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        return fs.readdirSync(fullPath, options);
      },
      rmSync: (p: string, options: any) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        return fs.rmSync(fullPath, options);
      },
      statSync: (p: string, options: any) => {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Access denied");
        return fs.statSync(fullPath, options);
      }
    },
    fetch: async (url: string, options?: any) => {
      const response = await fetch(url, options);
      return await response.json();
    },
  };

  vm.createContext(context);

  // ESM-like 脚本的基本预处理
  let processedCode = code;
  if (code.includes("import") || code.includes("export") || code.includes("__filename")) {
    processedCode = code
      .replace(/import\s+(\w+)\s+from\s+['"](.+)['"]/g, "const $1 = require('$2')")
      .replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"](.+)['"]/g, "const $1 = require('$2')")
      .replace(/import\s+\{\s*(.+)\s*\}\s+from\s+['"](.+)['"]/g, "const { $1 } = require('$2')")
      .replace(/export\s+default\s+(\w+)/g, "module.exports = $1")
      .replace(/export\s+const\s+(\w+)/g, "exports.$1")
      .replace(/(const|let|var)\s+__filename\s*=\s*(__filename|fileURLToPath\(import\.meta\.url\));?/g, "")
      .replace(/(const|let|var)\s+__dirname\s*=\s*path\.dirname\(__filename\);?/g, "")
      .replace(/fileURLToPath\(import\.meta\.url\)/g, "__filename")
      .replace(/import\.meta\.url/g, "('file://' + __filename)");
  }

  const script = new vm.Script(`(async () => {
    try {
      ${processedCode}
    } catch (e) {
      console.error("Script error:", e);
      throw e;
    }
  })()`);

  try {
    await script.runInContext(context);
    // 将完成消息写入文件
    writeLogToFile(scriptId, `[=== Script ${scriptId} completed at ${new Date().toISOString()} ===]`);
  } finally {
    // No DB log cleanup needed anymore
  }
}
