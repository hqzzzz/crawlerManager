/**
 * 高级爬虫基类
 * 具有完整的反反爬措施，支持会话保持
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');
const path = require('path');
const AntiDetect = require('./anti-detect');
const RequestManager = require('./request-manager');

class AdvancedCrawler {
  constructor(config = {}) {
    this.config = {
      delay: config.delay || 2000,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 30000,
      useHeadless: config.useHeadless !== false,
      sessionKeepAlive: config.sessionKeepAlive !== false,
      sessionTTL: config.sessionTTL || 24 * 60 * 60 * 1000,
      resultDir: config.resultDir || null,
      ...config
    };

    // 确定会话文件路径
    const sessionFile = this.config.resultDir 
      ? path.join(this.config.resultDir, '.sessions.json')
      : null;

    this.antiDetect = new AntiDetect({ sessionFile, sessionTTL: this.config.sessionTTL });
    this.requestManager = new RequestManager(this.config);
    this.sessionId = uuidv4();
    this.requestCount = 0;
  }

  /**
   * 从 URL 提取域名
   */
  extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch (e) {
      return null;
    }
  }

  /**
   * 发起请求
   */
  async fetch(url, options = {}) {
    this.requestCount++;
    const domain = this.extractDomain(url);

    // 根据域名获取请求头（优先使用会话保持的配置）
    let headers;
    if (this.config.sessionKeepAlive && domain) {
      headers = this.antiDetect.generateHeadersForDomain(domain, options.headers);
    } else {
      const userAgent = this.antiDetect.getRandomUserAgent();
      headers = this.antiDetect.generateHeaders(userAgent, options.headers);
    }

    // 随机延迟模拟人类行为
    await this.randomDelay(500, 2000);

    try {
      const response = await axios({
        url,
        method: options.method || 'GET',
        headers,
        timeout: this.config.timeout,
        maxRedirects: 5,
        validateStatus: () => true,
        ...options
      });

      const isSuccess = response.status >= 200 && response.status < 300;

      // 检查响应状态
      if (response.status === 429) {
        console.warn(`[429] 频率限制 - ${url}`);
        await this.randomDelay(5000, 10000);
        return this.retryFetch(url, options, domain);
      }

      if (response.status === 403) {
        console.warn(`[403] 禁止访问 - ${url}，将清除会话并重试`);
        if (domain && this.config.sessionKeepAlive) {
          this.antiDetect.markDomainFailure(domain);
        }
        return this.retryFetch(url, options, domain);
      }

      // 成功时保存会话指纹
      if (isSuccess && domain && this.config.sessionKeepAlive) {
        this.antiDetect.markDomainSuccess(domain, headers);
        console.log(`[成功] 会话已保存 - ${domain}`);
      }

      return {
        success: isSuccess,
        status: response.status,
        data: response.data,
        headers: response.headers
      };
    } catch (error) {
      console.error(`[错误] ${error.message} - ${url}`);
      
      if (domain && this.config.sessionKeepAlive) {
        this.antiDetect.markDomainFailure(domain);
      }
      
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * 重试请求
   */
  async retryFetch(url, options, domain, retries = 0) {
    if (retries >= this.config.maxRetries) {
      return { success: false, error: '达到最大重试次数' };
    }

    retries++;
    console.log(`[重试] 第 ${retries} 次重试 - ${url}`);

    if (this.config.sessionKeepAlive && domain) {
      this.antiDetect.markDomainFailure(domain);
    }

    await this.randomDelay(2000, 5000);
    return this.fetch(url, options);
  }

  /**
   * 随机延迟
   */
  async randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 解析 HTML 内容
   */
  parseHTML(html, selector) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    if (!selector) {
      return html;
    }

    const results = [];
    $(selector).each((_, element) => {
      results.push({
        text: $(element).text().trim(),
        html: $(element).html(),
        attr: (attr) => $(element).attr(attr)
      });
    });

    return results;
  }

  /**
   * 提取所有链接
   */
  extractLinks(html, baseUrl) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const links = new Set();

    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        try {
          const fullUrl = new URL(href, baseUrl).href;
          links.add(fullUrl);
        } catch (e) {
          // 忽略无效 URL
        }
      }
    });

    return Array.from(links);
  }

  /**
   * 获取随机代理
   */
  async getProxy() {
    return this.requestManager.getProxy();
  }

  /**
   * 清理资源
   */
  async cleanup() {
    await this.requestManager.cleanup();
  }

  /**
   * 批量爬取多个 URL
   */
  async crawlMultiple(urls, options = {}) {
    const results = [];
    const concurrency = options.concurrency || 3;

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.fetch(url, options))
      );
      results.push(...batchResults);

      if (i + concurrency < urls.length) {
        await this.randomDelay(3000, 6000);
      }
    }

    return results;
  }

  /**
   * 获取会话统计数据
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      requestCount: this.requestCount,
      proxyRotationCount: this.requestManager.getRotationCount()
    };
  }

  /**
   * 获取会话保持统计信息
   */
  getSessionStats() {
    if (this.config.sessionKeepAlive) {
      return this.antiDetect.getSessionStats();
    }
    return { message: '会话保持功能已禁用' };
  }

  /**
   * 清除指定域名的会话
   */
  clearSession(domain) {
    if (domain) {
      this.antiDetect.markDomainFailure(domain);
      console.log(`[清除会话] ${domain}`);
    }
  }

  /**
   * 清除所有会话
   */
  clearAllSessions() {
    const sessionFile = this.config.resultDir
      ? path.join(this.config.resultDir, '.sessions.json')
      : null;
    
    this.antiDetect = new AntiDetect({ sessionFile, sessionTTL: this.config.sessionTTL });
    console.log('[清除会话] 所有会话已清除');
  }

  /**
   * 保存结果到文件
   */
  saveResults(data, filename, customDir = null) {
    const resultDir = customDir || this.config.resultDir || path.join(__dirname, '..', 'result');
    
    if (!filename.endsWith('.json')) {
      filename = `${filename}.json`;
    }
    
    const filepath = path.join(resultDir, filename);
    const fs = require('fs');
    
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[保存] 结果已保存到 ${filepath}`);
    return filepath;
  }
}

module.exports = AdvancedCrawler;
module.exports.createCrawler = (config) => new AdvancedCrawler(config);
