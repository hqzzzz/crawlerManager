
# 为颗芝麻摊个饼

# RSS 爬虫管理平台

一个基于 Node.js 的爬虫管理平台，支持脚本调度、任务管理、结果存储和 RSS 订阅功能。

## 功能特性

- 🕷️ **爬虫脚本管理**：支持自定义 JavaScript 爬虫脚本，可手动执行或定时调度
- 📊 **结果存储与展示**：爬虫结果自动存储到 SQLite 数据库，支持分页查询
- 🖼️ **图片 Base64 编码**：支持图片转 Base64 存储，方便前端展示
- 📡 **RSS 订阅管理**：支持 RSS 源订阅和文章抓取
- 🔍 **文件监控**：自动监控爬虫结果文件并导入数据库
- 📅 **定时任务**：基于 cron 表达式的任务调度
- 📝 **日志记录**：每个脚本的执行日志自动保存

## 项目结构

```
crawlerManager/
├── src/                          # 主项目源码 (TypeScript + React)
│   ├── server/                   # 后端服务
│   │   ├── index.ts             # Express 服务器入口
│   │   ├── routes.ts            # API 路由定义
│   │   ├── db.ts                # SQLite 数据库操作
│   │   ├── crawler-engine.ts    # 爬虫脚本执行引擎
│   │   ├── scheduler.ts         # 定时任务调度器
│   │   └── file-watcher.ts      # 文件监控服务
│   ├── components/              # React 组件
│   ├── views/                   # 页面组件
│   ├── api/                     # API 调用封装
│   └── layouts/                 # 布局组件
├── crawlerXnode/                 # 爬虫运行环境
│   ├── crawler/                 # 爬虫脚本目录
│   │   └── madouqu-crawler.js   # 图库爬虫（图片）
│   ├── result/                  # 爬虫结果存储
│   │   └── [scriptId]/          # 按脚本 ID 分类
│   │       └── all_posts_*.json # 每日抓取结果
│   ├── logs/                    # 脚本执行日志
│   │   └── [scriptId]_YYYY-MM-DD.log
│   └── src/                     # 爬虫工具库
├── .env                         # 环境变量配置
├── crawler.db                   # SQLite 数据库文件
├── package.json                 # 项目依赖配置
├── vite.config.ts              # Vite 构建配置
└── tsconfig.json               # TypeScript 配置
```

## 技术栈

### 后端
- **Express.js** - Web 框架
- **SQLite (better-sqlite3)** - 数据库
- **node-cron** - 定时任务
- **cheerio** - HTML 解析
- **rss-parser** - RSS 解析
- **jsonwebtoken** - JWT 认证

### 前端
- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **TailwindCSS** - 样式框架
- **Lucide React** - 图标库
- **Motion** - 动画库

## 快速开始

### 前置要求

- Node.js 18+
- npm 或 yarn

### 安装步骤

1. **克隆项目并安装依赖**
   ```bash
   npm install
   ```

   注意 crawlerXnod 内同 
 
   ```bash
   cd ./crawlerXnod
   npm install
   ```


2. **配置环境变量**
   
   编辑 `.env` 文件：
   ```env
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin
   JWT_SECRET=your-secret-key-change-me
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```

4. **访问应用**
   
   打开浏览器访问 `http://localhost:3000`

## 使用指南

### 1. 创建爬虫脚本

在管理面板中创建新的爬虫脚本，编写 JavaScript 代码：

```javascript
// 示例：简单网页爬虫
const cheerio = require('cheerio');

async function crawl(params) {
  const { url } = params;
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const posts = [];
  $('.post-item').each((_, el) => {
    posts.push({
      title: $(el).find('h2').text(),
      link: $(el).find('a').attr('href'),
      date: new Date().toISOString()
    });
  });
  
  return { posts };
}

module.exports = { crawl };
```

### 2. 设置定时任务

使用 cron 表达式设置任务执行时间：
- `0 0 * * *` - 每天凌晨执行
- `*/30 * * * *` - 每 30 分钟执行
- `0 9-18 * * 1-5` - 工作日 9:00-18:00 每小时执行

### 3. 查看爬虫结果

- **结果列表**：查看所有抓取的数据
- **图片预览**：支持 Base64 图片直接展示
- **数据导出**：支持 JSON 格式导出

## API 文档

### 认证

```http
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}

# 返回 JWT token
```

### 脚本管理

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | /api/scripts | 获取脚本列表 |
| POST | /api/scripts | 创建/更新脚本 |
| DELETE | /api/scripts/:id | 删除脚本 |
| POST | /api/scripts/:id/run | 执行脚本 |
| POST | /api/scripts/:id/stop | 停止脚本 |

### 结果管理

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | /api/results | 获取结果列表（分页） |
| GET | /api/results/count | 获取结果总数 |
| DELETE | /api/results/:id | 删除单条结果 |
| POST | /api/results/import | 导入结果 |
| POST | /api/results/deduplicate | 去重结果 |

### RSS 订阅

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | /api/rss_subscriptions | 获取订阅列表 |
| POST | /api/rss_subscriptions | 添加订阅 |
| DELETE | /api/rss_subscriptions/:id | 删除订阅 |

## 数据库结构

### scripts 表
```sql
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  cron TEXT,
  params TEXT,
  ownerId TEXT DEFAULT 'public-user',
  status TEXT DEFAULT 'idle',
  lastRun TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### results 表
```sql
CREATE TABLE results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scriptId TEXT,
  ownerId TEXT DEFAULT 'public-user',
  title TEXT,
  link TEXT,
  image TEXT,
  image_url TEXT,
  image_base64 TEXT,
  magnets TEXT,
  post TEXT,
  raw TEXT,
  date TEXT,
  timestamp TEXT
);
```

### rss_subscriptions 表
```sql
CREATE TABLE rss_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  name TEXT,
  ownerId TEXT DEFAULT 'public-user'
);
```

### rss_keys 表
```sql
CREATE TABLE rss_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  ownerId TEXT DEFAULT 'public-user'
);
```

## 开发说明

### 项目命令

```bash
# 开发模式（热重载）
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 类型检查
npm run lint

# 清理构建产物
npm run clean
```

### 目录说明

- **crawler/crawler/** - 存放可执行的爬虫脚本
- **crawler/result/** - 爬虫原始结果存储（JSON 文件）
- **crawler/logs/** - 脚本执行日志
- **src/server/** - 后端 API 服务
- **src/components/** - React 组件库

## 注意事项

1. **Base64 图片**：大图片转 Base64 会显著增加数据库体积，建议压缩后存储
2. **定时任务**：确保服务器时间准确，定时任务基于服务器时间执行
3. **API 密钥**：生产环境请修改默认的 JWT_SECRET 和管理员密码
4. **数据备份**：定期备份 `crawler.db` 文件和 `crawlerXnode/result/` 目录

## 许可证

MIT License
