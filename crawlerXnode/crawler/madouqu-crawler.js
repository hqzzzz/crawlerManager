/**
 * 图库爬虫 - 支持图片下载
 * 目标站点：https://madouqu.sbs/
 * 
 * 功能：
 * - 爬取帖子列表和详情
 * - 下载图片到本地文件系统
 * - 生成 image_src 文件名
 * - 保留 image_base64 但不再主要使用
 * 
 * 用法:
 * node madouqu-crawler.js # 默认爬取第 1-3 页
 * node madouqu-crawler.js -page X # 爬取第 X 页
 * node madouqu-crawler.js -page X1 X2 # 爬取从 X1 到 X2 页
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
//import { HttpsProxyAgent } from 'https-proxy-agent';
//import { SocksProxyAgent } from 'socks-proxy-agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _baseURL = `https://madouqu.sbs/`;

const MAX_CONCURRENT = 6; // 并发数，建议 3-10
class MadouQuCrawler {

  constructor(config = {}) {
    this.baseURL = config.baseURL || _baseURL;
    this.cleanDomain = this.baseURL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.delay = config.delay || 3000;
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 30000;

    const scriptName = path.basename(__filename, '.js');
    this.resultDir = path.join(__dirname, '..', 'result', scriptName);
    this.imagesDir = path.join(this.resultDir, 'images');

    this.sessionFile = path.join(this.resultDir, '.sessions.json');
    this.sessionTTL = config.sessionTTL || 24 * 60 * 60 * 1000;

    const today = new Date();
    const dateStr = String(today.getFullYear()) + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
    this.allPostsFile = path.join(this.resultDir, `all_posts_${dateStr}.json`);
    this.pagePostsFile = path.join(this.resultDir, `page_posts_${dateStr}.json`);
    this.postsHistoryFile = path.join(this.resultDir, 'posts_history.json');

    this.ensureResultDir();
    this.sessions = this.loadSessions();
    this.requestCount = 0;
    this.postsHistory = this.loadPostsHistory();

    // 图片下载统计
    this.downloadedImages = 0;
    this.failedImages = 0;
  }

  ensureResultDir() {
    if (!fs.existsSync(this.resultDir)) {
      fs.mkdirSync(this.resultDir, { recursive: true });
      console.log('[目录创建] 创建结果目录:', this.resultDir);
    }
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
      console.log('[目录创建] 创建图片目录:', this.imagesDir);
    }
  }

  loadSessions() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        return JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8'));
      }
    } catch (error) {
      console.warn('加载会话文件失败:', error.message);
    }
    return {};
  }

  saveSessions() {
    try {
      this.cleanupExpiredSessions();
      fs.writeFileSync(this.sessionFile, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (error) {
      console.warn('保存会话文件失败:', error.message);
    }
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    for (const domain of Object.keys(this.sessions)) {
      if (now - this.sessions[domain].lastSuccess > this.sessionTTL) {
        delete this.sessions[domain];
      }
    }
  }

  loadPostsHistory() {
    try {
      if (fs.existsSync(this.postsHistoryFile)) {
        const data = JSON.parse(fs.readFileSync(this.postsHistoryFile, 'utf-8'));
        console.log(`[历史记录] 已加载 ${data.posts?.length || 0} 个已爬取帖子的历史记录`);
        return data.posts || [];
      }
    } catch (error) {
      console.warn('加载历史记录文件失败:', error.message);
    }
    return [];
  }



  saveSinglePostToHistory(postInfo) {
    try {
      const historyEntry = {
        title: postInfo.title || '',
        link: postInfo.link || '',
        have_magnets: postInfo.magnets && postInfo.magnets.length > 0,
        have_images: postInfo.image_src !== null,
      };

      let history = [];
      if (fs.existsSync(this.postsHistoryFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(this.postsHistoryFile, 'utf-8'));
          history = data.posts || [];
        } catch (e) {
          console.log('[历史记录] 文件损坏或为空，重新创建');
        }
      }

      const existingIndex = history.findIndex(p => p.link === historyEntry.link);
      if (existingIndex >= 0) {
        history[existingIndex] = historyEntry;
      } else {
        history.push(historyEntry);
      }

      const data = {
        type: 'posts_history',
        posts: history,
        totalPosts: history.length,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(this.postsHistoryFile, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[历史记录] 已保存：${historyEntry.title.substring(0, 30)}... (总计：${history.length})`);
    } catch (error) {
      console.warn('保存历史记录失败:', error.message);
    }
  }

  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  getHeaders() {
    const domain = `${this.baseURL}`;
    const session = this.sessions[domain];
    let userAgent, acceptLanguage, referer;

    if (session && Date.now() - session.lastSuccess < this.sessionTTL) {
      userAgent = session.userAgent;
      acceptLanguage = session.acceptLanguage;
      referer = session.referer;
      //console.log('[会话复用] 使用保存的 UA 和请求头');
    } else {
      userAgent = this.getRandomUserAgent();
      acceptLanguage = 'zh-CN,zh;q=0.9,en;q=0.8';
      console.log('[新会话] 生成新的 UA 和请求头');
    }

    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    if (referer) headers['Referer'] = referer;

    return { headers, userAgent, acceptLanguage, referer };
  }

  saveSuccessSession(domain, userAgent, acceptLanguage, referer) {
    this.sessions[domain] = { userAgent, acceptLanguage, referer, lastSuccess: Date.now() };
    this.saveSessions();
    //console.log('[会话保存] 成功保存会话信息');
  }

  clearFailedSession(domain) {
    if (this.sessions[domain]) {
      delete this.sessions[domain];
      this.saveSessions();
      console.log('[会话清除] 清除失败的会话');
    }
  }

  async randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async fetch(url, options = {}) {
    this.requestCount++;
    const { headers, userAgent, acceptLanguage, referer } = this.getHeaders();
    await this.randomDelay(2000, 4000);

    try {
      const response = await axios({
        url,
        method: options.method || 'GET',
        headers: { ...headers, ...options.headers },
        timeout: this.timeout,
        maxRedirects: 5,
        validateStatus: () => true
      });

      const isSuccess = response.status >= 200 && response.status < 300;
      const domain = `${this.baseURL}`;

      if (response.status === 429) {
        console.warn('[429] 频率限制，等待 10 秒后重试...');
        await this.randomDelay(10000, 15000);
        return this.retryFetch(url, options);
      }

      if (response.status === 403) {
        console.warn('[403] 禁止访问，清除会话后重试...');
        this.clearFailedSession(domain);
        return this.retryFetch(url, options);
      }

      if (isSuccess) {
        this.saveSuccessSession(domain, userAgent, acceptLanguage, referer || url);
      }

      return { success: isSuccess, status: response.status, data: response.data, headers: response.headers };
    } catch (error) {
      console.error(`[请求失败] ${error.message}`);
      this.clearFailedSession(this.baseURL);
      return { success: false, error: error.message, data: null };
    }
  }

  retryFetch(url, options, retries = 0) {
    if (retries >= this.maxRetries) return { success: false, error: '达到最大重试次数' };
    retries++;
    console.log(`[重试] 第${retries}次重试...`);
    return this.randomDelay(3000, 5000).then(() => this.fetch(url, options));
  }

  convertRelativeDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return null;
    dateStr = dateStr.trim();
    const now = new Date();
    let daysAgo = 0;
    let matched = false;

    const dateMatch = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (dateMatch) return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

    const patterns = [
      { regex: /(\d+)\s*年前/, unit: 'year' },
      { regex: /(\d+)\s*月前/, unit: 'month' },
      { regex: /(\d+)\s*周前/, unit: 'week' },
      { regex: /(\d+)\s*天前/, unit: 'day' },
      { regex: /(\d+)\s*小时\s*前/, unit: 'hour' },
      { regex: /(\d+)\s*时前/, unit: 'hour' },
      { regex: /(\d+)\s*分钟\s*前/, unit: 'minute' },
      { regex: /(\d+)\s*分前/, unit: 'minute' }
    ];

    for (const pattern of patterns) {
      const match = dateStr.match(pattern.regex);
      if (match) {
        matched = true;
        const value = parseInt(match[1], 10);
        switch (pattern.unit) {
          case 'minute': daysAgo = value / 1440; break;
          case 'hour': daysAgo = value / 24; break;
          case 'day': daysAgo = value; break;
          case 'week': daysAgo = value * 7; break;
          case 'month': daysAgo = value * 30; break;
          case 'year': daysAgo = value * 365; break;
        }
        break;
      }
    }

    if (!matched) {
      console.log(`[日期解析失败] 原始文本：${dateStr}`);
      return null;
    }

    const targetDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  }

  // --- 解析帖子详情页  const metaContent = $('meta[name="description"]').attr('content') || '';---
  extractMetaInfo(metaContent) {
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
      title = titleMatch[2].trim().replace("下載地址：", "").replace(" ", '');;
      if (title.length === 0) title = null;
    }
    const actressMatch = metaContent.match(actressRegex);
    if (actressMatch && actressMatch[2]) {
      actress = actressMatch[2].trim().replace("下載地址：", "").replace(" ", '');
    }
    console.log(`[解析] 提取结果 - ID: "${id}", Title: "${title}", Actress: "${actress}"`);
    return {
      sid: id,
      title: title,
      actress: actress
    };
  }
  /**
   * 从帖子链接提取名称，从图片 URL 提取扩展名
   * 例如：postLink=.../xb1976/, imageUrl=xxx.png -> xb1976.png
   */
  extractImageFilename(postLink, imageUrl) {
    let basename = 'unknown';
    let extension = '.jpg'; // 默认扩展名

    // 从 postLink 提取名称主体 (如 xb1976)
    try {
      const url = new URL(postLink);
      const pathname = url.pathname;
      const segments = pathname.split('/').filter(s => s.length > 0);
      basename = segments.length > 0 ? segments[segments.length - 1] : 'unknown';
    } catch (e) {
      basename = `image_${Date.now()}`;
    }

    // 从 imageUrl 提取扩展名 (如 .png, .jpg)
    try {
      const imgPath = new URL(imageUrl).pathname;
      const imgBasename = path.basename(imgPath);
      const match = imgBasename.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
      if (match) {
        extension = match[0].toLowerCase();
        if (extension === '.jpeg') extension = '.jpg'; // 统一为 jpg
      }
    } catch (e) {
      // 无法提取则使用默认
    }

    return `${basename}${extension}`;
  }

  /**
   * 下载图片到本地文件系统
   * @param {string} imageUrl - 图片 URL
   * @param {string} filename - 目标文件名
   * @returns {Promise<string|null>} - 返回保存的文件名，失败返回 null
   */
  async downloadImage(imageUrl, filename, options = {}) {
    const { headers, userAgent, acceptLanguage, referer } = this.getHeaders();
    options.headers = {
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Referer": this.baseURL,
      "DNT": "1",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "image",
    };
    const finalHeaders = {
      ...headers,
      ...(options.headers || {})
    };
    //const agent =new HttpsProxyAgent('http://10.10.1.10:1080'); //

    try {
      const response = await axios({
        url: imageUrl,
        method: options.method || 'GET',
        headers: finalHeaders,
        responseType: 'arraybuffer',

        timeout: this.timeout,
        serializeParams: true,
        //httpsAgent: agent,

      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const filePath = path.join(this.imagesDir, filename);
      fs.writeFileSync(filePath, response.data);

      this.downloadedImages++;
      console.log(`[图片下载] 成功：${filename} (${this.downloadedImages}/${this.downloadedImages + this.failedImages})`);

      return filename;
    } catch (error) {
      this.failedImages++;
      console.error(`[图片下载失败] ${imageUrl} - ${error.message}`);
      return null;
    }
  }

  parsePostList(html) {
    const $ = cheerio.load(html);
    const posts = [];

    console.log("🔍 找到帖子元素数量:", posts.length);

    $('.post, .article, .card, .grid-item, [class*="post"], [class*="article"]').each((_, element) => {
      const $el = $(element);
      const title = $el.find('h2, h3, h4, .title, [class*="title"]').first().text().trim();
      const link = $el.find('a').first().attr('href');

      let image = null;
      const $img = $el.find('img.lazyloaded, img[data-src], img').first();
      if ($img.length) {
        //image = ($img.attr('data-src') || $img.attr('src')).replace(/(\.jpg|\.jpeg|\.png)(\?.*|$)/i, '$1');
        image = $img.attr('data-src');
        if (image && (image.includes('data:image/gif') || image.includes('pixel.gif'))) image = null;
      }

      const dateRaw = $el.find('.date, .time, [class*="date"], [class*="time"]').first().text().trim();
      const date = this.convertRelativeDate(dateRaw);


      if (title && link) {
        posts.push({
          title,
          link: this.toAbsoluteUrl(link),
          //替换图片 URL 中的域名为 this.baseURL 的域名，确保图片链接正确
          image: image ? this.toAbsoluteUrl(image.replace(/https:\/\/i0\.wp\.com\/[^/]+\//, `https://${this.cleanDomain}/`)) : null,
          date
        });
      }
    });

    if (posts.length === 0) {
      $('a').each((_, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim();
        if (href && text.length > 5 && text.length < 100) {
          const absLink = this.toAbsoluteUrl(href);
          if (!posts.some(p => p.link === absLink)) {
            posts.push({ title: text, link: absLink, image: null, date: null });
          }
        }
      });
    }

    console.log(`[解析结果] 找到 ${posts.length} 个帖子`);
    return posts;
  }

  async fetchImageAsBase64(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      const mimeType = response.headers['content-type'];
      const base64 = Buffer.from(response.data).toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      throw new Error(`无法获取图片：${error.message}`);
    }
  }

  /**
   * 解析帖子页面，下载图片并返回帖子信息
   */
  async parsePostPage(html, post) {
    const $ = cheerio.load(html);
    const magnetLinks = [];

    const postInfo = {
      title: '',
      image_url: '',
      image_base64: '',
      image_src: null,  // 新增：图片文件名
      sid: null,
      actress: null,
      magnets: []
    };

    postInfo.title = $('h1, h2, .post-title, .article-title').first().text().trim();

    // 优先查找特定图片
    const $target =$('[class*="wp-image-"]');
    let imageUrls = [];

    if ($target.length) {
      postInfo.image_url = $target.attr('data-src') || $target.attr('src');
      imageUrls.push(postInfo.image_url);
    } else {
      const baseUrlObj = new URL(this.baseURL);
      const baseUrlHost = baseUrlObj.hostname;

      $('img').each((_, element) => {
        let src = $(element).attr('data-src') || $(element).attr('data-lazy-src') || $(element).attr('src');
        if (!src || src.includes('data:image/gif') || src.includes('placeholder')) return;

        const absoluteUrl = this.toAbsoluteUrl(src);
        if (absoluteUrl) {
          try {
            const urlObj = new URL(absoluteUrl);
            const isInternal = urlObj.hostname === baseUrlHost;
            if (!isInternal && !imageUrls.includes(absoluteUrl)) {
              imageUrls.push(absoluteUrl);
            }
          } catch (e) {
            console.log(`[图片] 无效 URL: ${absoluteUrl}`);
          }
        }
      });
    }

    // 下载第一张图片并生成 image_src
    if (imageUrls.length > 0) {
      const firstImageUrl = imageUrls[0].replace(/https:\/\/i0\.wp\.com\/[^/]+\//, `https://${this.cleanDomain}/`);  //.replace(/(\.jpg|\.jpeg|\.png)(\?.*|$)/i, '$1');
      postInfo.image_url = firstImageUrl;

      // 生成文件名并下载
      const filename = this.extractImageFilename(post.link, firstImageUrl);
      const downloadedFilename = await this.downloadImage(firstImageUrl, filename);

      if (downloadedFilename) {
        postInfo.image_src = downloadedFilename;
        // 同时保留 base64（可选，用于兼容性）
        // try {
        //   postInfo.image_base64 = await this.fetchImageAsBase64(firstImageUrl);
        // } catch (e) {
        //   console.log('[Base64 获取失败] 跳过 base64 编码');
        // }
      } else {
        const filename = this.extractImageFilename(post.link, post.image);
        const downloadedFilename = await this.downloadImage(post.image, filename);
        if (downloadedFilename) {
          post.image_src = downloadedFilename;
        }
      }
    }

    // 提取磁力链接
    $('a[href^="magnet:"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && !magnetLinks.includes(href)) {
        magnetLinks.push(href);
      }
    });

    const matches = $('body').text().match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]{40}/g);
    if (matches) {
      matches.forEach(match => {
        if (!magnetLinks.includes(match)) magnetLinks.push(match);
      });
    }

    postInfo.magnets = magnetLinks;


    const metaContent = $('meta[name="description"]').attr('content') || '';
    let metaInfo = this.extractMetaInfo(metaContent);

    if (!postInfo.sid && postInfo.sid !== "") postInfo.sid = metaInfo.sid;
    if (!postInfo.actress && postInfo.actress !== "") postInfo.actress = metaInfo.actress;

    console.log(`[解析结果] 标题：${postInfo.title || '未知'}, 图片：${postInfo.image_src || '无'}, 磁力链接数：${postInfo.magnets.length}`);



    return postInfo;
  }

  toAbsoluteUrl(url) {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    try {
      return new URL(url, this.baseURL).href;
    } catch (e) {
      return null;
    }
  }

  getNextPageLink(html) {
    const $ = cheerio.load(html);
    const link = $('a.next, a[rel="next"], .pagination a.next, .page-nav a:last').first().attr('href');
    return link ? this.toAbsoluteUrl(link) : null;
  }

  loadAllPosts() {
    if (fs.existsSync(this.allPostsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.allPostsFile, 'utf-8'));
        console.log(`[加载] 已加载当天 all_posts (${data.posts?.length || 0} 个帖子)`);
        return data.posts || [];
      } catch (e) {
        console.warn('加载 all_posts 失败:', e.message);
      }
    }
    console.log('[加载] 未发现当天 all_posts，创建新文件');
    return [];
  }

  isPostInHistory(post) {
    return this.postsHistory.some(p => p.link === post.link
      && (p.have_images && p.have_magnets && p.title == post.title));
  }
  isPostComplete(existingPosts, link) {
    const existing = existingPosts.find(p => p.link === link);
    if (!existing) return false;

    const hasImages = (existing.image_src && existing.image_src.length > 0)
      || (existing.image_base64 && existing.image_base64.length > 0 && existing.image_base64.startsWith('data:image'));
    const hasMagnets = existing.magnets && existing.magnets.length > 0;
    return hasImages || hasMagnets;
  }

  async crawlPost(post) {
    const result = await this.fetch(post.link);
    if (!result.success) return null;

    const postInfo = await this.parsePostPage(result.data, post);
    postInfo.link = post.link;

    return postInfo;
  }


  // 并发爬取帖子详情，处理结果并保存
  async crawlWithPLimit(postsToProcess, existingPosts, maxPosts = 0) {
    const limit = pLimit(MAX_CONCURRENT); // 设置并发限制
    let completedCount = 0;
    let failedCount = 0;
    let totalProcessed = 0;
    // 将任务映射为 Promise 数组
    const tasks = postsToProcess.map((post, index) => {
      return limit(async () => {
        if (maxPosts > 0 && totalProcessed >= maxPosts) return; // 检查限制

        try {
          console.log(`[详情开始] [${index + 1}/${postsToProcess.length}] ${post.title.substring(0, 30)}...`);
          const postInfo = await this.crawlPost(post);

          if (postInfo) {
            const fullPostInfo = { ...post, ...postInfo };
            existingPosts.push(fullPostInfo);
            if (fullPostInfo.image_url || fullPostInfo.image_base64 || fullPostInfo.magnets?.length > 0) {
              this.saveSinglePostToHistory(fullPostInfo);
            }
            completedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
          console.error(`[详情失败] ${error.message}`);
        } finally {
          totalProcessed++;
        }
      });
    });
    // 等待所有任务完成
    await Promise.all(tasks);
    // 最终保存
    const saveData = {
      type: 'all_posts',
      posts: existingPosts,
      totalPosts: existingPosts.length,
      crawledAt: new Date().toISOString()
    };
    fs.writeFileSync(this.allPostsFile, JSON.stringify(saveData, null, 2), 'utf-8');

    console.log(`完成！成功: ${completedCount}, 失败: ${failedCount}`);
  }

  async crawlAllPostsImages(startPage = 1, maxPages = 0, maxPosts = 0) {
    console.log('\n=== 开始爬取所有帖子图片和磁力链接 ===');
    console.log(`图片保存目录：${this.imagesDir}`);


    const existingPosts = this.loadAllPosts();

    let totalProcessed = 0;
    let completedCount = 0;
    let failedCount = 0;
    let skipCount = 0;
    let historySkipCount = 0;


    let currentPage = 1;
    let currentUrl = this.baseURL;
    if (startPage > 1) {
      currentPage = startPage;
      // 生成指定页码的 URL
      currentUrl = `${this.baseURL}page/${startPage}/`;
    }

    const endPage = startPage + maxPages - 1;

    while (currentPage <= endPage) {
      console.log(`\n--- 爬取列表页：第 ${currentPage} 页 ---`);

      const result = await this.fetch(currentUrl);
      console.log(`[列表页] 请求 ${currentUrl} - 状态码: ${result.status}, 成功: ${result.success}`);
      if (!result.success) {
        console.log(`❌ 请求失败：状态码 ${result.status}, 错误：${result.error || '未知'}`);
        break;
      }

      const posts = this.parsePostList(result.data);
      console.log(`[列表页] 找到 ${posts.length} 个帖子`);

      if (posts.length === 0) break;

      const postsToProcess = [];
      for (const post of posts) {
        if (this.isPostInHistory(post)) {
          historySkipCount++;
          console.log(` [跳过历史记录] ${post.title.substring(0, 30)}...`);
          continue;
        }
        if (this.isPostComplete(existingPosts, post.link)) {
          skipCount++;
          console.log(` [跳过已完成] ${post.title.substring(0, 30)}...`);
          continue;
        }
        postsToProcess.push(post);
      }

      console.log(`[列表页] 需处理：${postsToProcess.length} 个，跳过：${skipCount + historySkipCount}`);

      if (postsToProcess.length > 0) {
        await this.crawlWithPLimit(postsToProcess, existingPosts);
      }

      if (maxPosts > 0 && totalProcessed >= maxPosts) break;

      const nextLink = this.getNextPageLink(result.data);
      if (!nextLink || nextLink === currentUrl) {
        console.log('[已到达最后一页]');
        break;
      }

      currentUrl = nextLink;
      currentPage++;

      if (currentPage <= endPage) await this.randomDelay(2000, 4000);
    }

    console.log(`\n=== 爬取完成 ===`);
    console.log(`总计：${totalProcessed}, 成功：${completedCount}, 失败：${failedCount}, 跳过：${skipCount + historySkipCount}`);
    console.log(`图片下载：成功 ${this.downloadedImages}, 失败 ${this.failedImages}`);
    console.log(`all_posts 文件：${this.allPostsFile}`);
    console.log(`历史记录文件：${this.postsHistoryFile}`);

    return existingPosts;
  }

  getSessionStats() {
    const domain = `${this.baseURL}`;
    const session = this.sessions[domain];
    if (session) {
      const age = Math.round((Date.now() - session.lastSuccess) / 1000 / 60);
      return {
        domain,
        hasSession: true,
        userAgent: session.userAgent?.substring(0, 50) + '...',
        age: `${age}分钟前`
      };
    }
    return { domain, hasSession: false };
  }

  printStats() {
    console.log('\n=== 统计信息 ===');
    console.log(`总请求数：${this.requestCount}`);
    console.log('会话状态:', this.getSessionStats());
    console.log(`历史记录数：${this.postsHistory.length}`);
    console.log(`图片下载：成功 ${this.downloadedImages}, 失败 ${this.failedImages}`);
  }
}

async function main() {
  const crawler = new MadouQuCrawler({
    baseURL: _baseURL,
    delay: 3000,
    maxRetries: 3,
    timeout: 30000
  });

  try {
    const args = process.argv.slice(2);
    let pageArgs = [];
    let jsonParams = null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-page' || args[i] === '--page') {
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          pageArgs.push(args[i]);
          i++;
        }
        break;
      }
      if (args[i] === '-json' || args[i] === '--json' || args[i] === '-j') {
        i++;
        if (i < args.length) {
          try {
            jsonParams = JSON.parse(args[i]);
          } catch (e) {
            console.warn('JSON 参数解析失败:', e.message);
          }
        }
        break;
      }
    }
    if (jsonParams) {
      if (jsonParams.page && Array.isArray(jsonParams.page)) {
        if (jsonParams.page[0] !== undefined) pageArgs = [String(jsonParams.page[0])];
        if (jsonParams.page[1] !== undefined) pageArgs.push(String(jsonParams.page[1]));
      } else {
        if (jsonParams.startPage !== undefined) pageArgs = [String(jsonParams.startPage)];
        if (jsonParams.endPage !== undefined && pageArgs.length > 0) pageArgs.push(String(jsonParams.endPage));
      }
      if (jsonParams.maxPages !== undefined) {
        if (pageArgs.length === 0) pageArgs = ['1'];
        pageArgs.push(String(parseInt(pageArgs[0], 10) + jsonParams.maxPages - 1));
      }
      if (jsonParams.maxPosts !== undefined) {
        console.log(`[参数] 最多抓取详情：${jsonParams.maxPosts} 个`);
      }
      if (jsonParams.post !== undefined) {
        const postingMode_url = crawler.toAbsoluteUrl(jsonParams.post);
        console.log(`[参数] 贴子模式 URL: ${postingMode_url}`);
        let _post = { link: postingMode_url, title: '单贴模式', image: null, date: null };
        let postsToProcess = [];
        postsToProcess.push(_post);
        await crawler.crawlWithPLimit(postsToProcess, [], 2);
        return;
      }
    }

    if (pageArgs.length === 0) {
      pageArgs = ['1', '3'];
      console.log('[默认配置] 爬取第 1-3 页');
    }

    const startPage = parseInt(pageArgs[0], 10);
    const endPage = pageArgs.length > 1 ? parseInt(pageArgs[1], 10) : null;

    if (isNaN(startPage) || startPage < 1) {
      console.error('错误的开始页码，必须为正整数');
      process.exit(1);
    }
    if (endPage !== null && (isNaN(endPage) || endPage < startPage)) {
      console.error('错误的结束页码，必须大于等于开始页码');
      process.exit(1);
    }

    let pageCount = endPage ? endPage - startPage + 1 : 1;
    console.log(`\n[参数] 开始页：${startPage}, 结束页：${endPage || startPage}, 共${pageCount}页`);

    const maxPages = jsonParams && jsonParams.maxPages !== undefined ? jsonParams.maxPages : 1000;
    const maxPosts = jsonParams && jsonParams.maxPosts !== undefined ? jsonParams.maxPosts : 0;
    const maxPostsLimit = maxPosts > 0 ? maxPosts : 1000;
    pageCount = Math.min(pageCount, maxPages);
    console.log(`\n[参数] 最多抓取详情：${pageCount} 页, ${maxPostsLimit > 0 ? maxPostsLimit + ' 个帖子' : '不限帖子数量'}`);

    const allResults = await crawler.crawlAllPostsImages(startPage, pageCount, maxPostsLimit);

    console.log(`\n=== 所有任务完成 ===`);
    console.log(`总计：${allResults.length} 个帖子`);

    crawler.printStats();
  } catch (error) {
    console.error('\n[错误]', error);
    crawler.printStats();
    process.exit(1);
  }
}

main().catch(console.error);

export default MadouQuCrawler;


/*


--json { "page": [1120, 1400],"maxPages": 3,"maxPosts": 50}

*/