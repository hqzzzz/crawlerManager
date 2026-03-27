/**
 * 反反爬工具模块
 * 提供 User-Agent 生成、请求头伪造、指纹规避等功能
 * 支持会话保持：一天内成功请求尽量使用相同的 UA 和请求头
 */
const fs = require('fs');
const path = require('path');

class AntiDetect {
  constructor(options = {}) {
    // 会话存储文件路径
    this.sessionFile = options.sessionFile || path.join(__dirname, '.crawler_sessions.json');
    
    // 会话有效期（毫秒）- 默认 24 小时
    this.sessionTTL = options.sessionTTL || 24 * 60 * 60 * 1000;
    
    // 主流浏览器的 User-Agent 池
    this.userAgents = {
      chrome: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      ],
      firefox: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
      ],
      safari: [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
      ]
    };

    // 常见网站 Referer 池
    this.referers = [
      'https://www.google.com/',
      'https://www.bing.com/',
      'https://www.baidu.com/',
      'https://www.yahoo.com/',
      'https://www.DuckDuckGo.com/',
      'https://www.reddit.com/',
      'https://www.twitter.com/',
      'https://www.facebook.com/'
    ];

    // 屏幕分辨率池
    this.screenResolutions = [
      '1920x1080', '1366x768', '1536x864', '1440x900',
      '2560x1440', '3840x2160', '1280x720'
    ];

    // 时区列表
    this.timezones = [
      'America/New_York', 'America/Los_Angeles', 'Europe/London',
      'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Seoul'
    ];

    // 加载已存在的会话
    this.sessions = this.loadSessions();
  }

  /**
   * 获取随机 User-Agent
   */
  getRandomUserAgent() {
    const browsers = Object.keys(this.userAgents);
    const browser = browsers[Math.floor(Math.random() * browsers.length)];
    const agents = this.userAgents[browser];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * 获取特定浏览器的 User-Agent
   */
  getUserAgent(browser = 'chrome') {
    const agents = this.userAgents[browser] || this.userAgents.chrome;
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * 生成完整的请求头
   */
  generateHeaders(userAgent, customHeaders = {}) {
    const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
    const acceptLanguage = this.randomAcceptLanguage();
    const acceptEncoding = 'gzip, deflate, br';
    const connection = 'keep-alive';
    
    const headers = {
      'User-Agent': userAgent,
      'Accept': accept,
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': acceptEncoding,
      'Connection': connection,
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': this.getSecChUa(userAgent),
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': this.getPlatform(userAgent),
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    };

    // 添加随机 Referer
    if (Math.random() > 0.3) {
      headers['Referer'] = this.referers[Math.floor(Math.random() * this.referers.length)];
    }

    // 合并自定义头
    return { ...headers, ...customHeaders };
  }

  /**
   * 生成随机的 Accept-Language
   */
  randomAcceptLanguage() {
    const languages = [
      'en-US,en;q=0.9',
      'zh-CN,zh;q=0.9',
      'zh-TW,zh;q=0.9',
      'ko-KR,ko;q=0.9',
      'ja-JP,ja;q=0.9',
      'de-DE,de;q=0.9',
      'fr-FR,fr;q=0.9'
    ];
    return languages[Math.floor(Math.random() * languages.length)];
  }

  /**
   * 获取 Sec-Ch-Ua 值
   */
  getSecChUa(userAgent) {
    if (userAgent.includes('Chrome')) {
      return '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
    } else if (userAgent.includes('Firefox')) {
      return '"Not_A Brand";v="8", "Firefox";v="121"';
    }
    return '"Not_A Brand";v="8", "Chromium";v="120"';
  }

  /**
   * 获取平台信息
   */
  getPlatform(userAgent) {
    if (userAgent.includes('Windows')) return '"Windows"';
    if (userAgent.includes('Mac')) return '"macOS"';
    if (userAgent.includes('Linux')) return '"Linux"';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return '"iOS"';
    return '"Windows"';
  }

  /**
   * 生成随机 Cookie
   */
  generateCookies() {
    const cookies = {};
    const cookieNames = ['session_id', 'user_pref', 'lang', 'theme', 'tracking_id'];
    
    cookieNames.forEach(name => {
      if (Math.random() > 0.5) {
        cookies[name] = this.randomString(16);
      }
    });
    
    return cookies;
  }

  /**
   * 生成随机字符串
   */
  randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 生成随机屏幕信息
   */
  getScreenInfo() {
    const resolution = this.screenResolutions[Math.floor(Math.random() * this.screenResolutions.length)];
    const [width, height] = resolution.split('x').map(Number);
    
    return {
      width,
      height,
      availWidth: width - 16,
      availHeight: height - 40,
      colorDepth: 24,
      pixelDepth: 24
    };
  }

  /**
   * 生成随机时区
   */
  getRandomTimezone() {
    return this.timezones[Math.floor(Math.random() * this.timezones.length)];
  }

  /**
   * 生成完整的浏览器指纹信息
   */
  generateFingerprint() {
    return {
      userAgent: this.getRandomUserAgent(),
      screen: this.getScreenInfo(),
      timezone: this.getRandomTimezone(),
      language: this.randomAcceptLanguage(),
      platform: 'Win32',
      cookiesEnabled: true,
      doNotTrack: 'unknown'
    };
  }

  /**
   * 加载会话数据
   */
  loadSessions() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = fs.readFileSync(this.sessionFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('加载会话文件失败:', error.message);
    }
    return {};
  }

  /**
   * 保存会话数据
   */
  saveSessions() {
    try {
      // 清理过期会话
      this.cleanupExpiredSessions();
      fs.writeFileSync(this.sessionFile, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (error) {
      console.warn('保存会话文件失败:', error.message);
    }
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const domains = Object.keys(this.sessions);
    
    for (const domain of domains) {
      const session = this.sessions[domain];
      if (now - session.lastSuccess > this.sessionTTL) {
        delete this.sessions[domain];
      }
    }
  }

  /**
   * 获取域名的会话指纹（如果存在且未过期）
   * @param {string} domain - 域名
   * @returns {object|null} - 会话指纹或 null
   */
  getSessionFingerprint(domain) {
    const session = this.sessions[domain];
    
    if (!session) {
      return null;
    }
    
    // 检查是否过期
    const now = Date.now();
    if (now - session.lastSuccess > this.sessionTTL) {
      delete this.sessions[domain];
      this.saveSessions();
      return null;
    }
    
    return {
      userAgent: session.userAgent,
      acceptLanguage: session.acceptLanguage,
      referer: session.referer
    };
  }

  /**
   * 保存域名的会话指纹
   * @param {string} domain - 域名
   * @param {object} fingerprint - 指纹信息
   */
  saveSessionFingerprint(domain, fingerprint) {
    this.sessions[domain] = {
      userAgent: fingerprint.userAgent,
      acceptLanguage: fingerprint.acceptLanguage,
      referer: fingerprint.referer,
      lastSuccess: Date.now()
    };
    this.saveSessions();
  }

  /**
   * 获取域名的 User-Agent（优先使用会话保持的 UA）
   * @param {string} domain - 域名
   * @returns {string} - User-Agent
   */
  getUserAgentForDomain(domain) {
    const session = this.getSessionFingerprint(domain);
    if (session && session.userAgent) {
      return session.userAgent;
    }
    return this.getRandomUserAgent();
  }

  /**
   * 生成域名的请求头（优先使用会话保持的配置）
   * @param {string} domain - 域名
   * @param {object} customHeaders - 自定义请求头
   * @returns {object} - 请求头对象
   */
  generateHeadersForDomain(domain, customHeaders = {}) {
    const session = this.getSessionFingerprint(domain);
    
    // 使用会话保持的配置或生成新的
    const userAgent = session?.userAgent || this.getRandomUserAgent();
    const acceptLanguage = session?.acceptLanguage || this.randomAcceptLanguage();
    
    const headers = this.generateHeaders(userAgent, {
      'Accept-Language': acceptLanguage,
      ...customHeaders
    });
    
    // 如果有会话 Referer，优先使用
    if (session?.referer) {
      headers['Referer'] = session.referer;
    }
    
    return headers;
  }

  /**
   * 标记域名为成功状态（保存指纹）
   * @param {string} domain - 域名
   * @param {object} headers - 使用的请求头
   */
  markDomainSuccess(domain, headers) {
    this.saveSessionFingerprint(domain, {
      userAgent: headers['User-Agent'],
      acceptLanguage: headers['Accept-Language'],
      referer: headers['Referer']
    });
  }

  /**
   * 标记域名为失败状态（清除会话）
   * @param {string} domain - 域名
   */
  markDomainFailure(domain) {
    if (this.sessions[domain]) {
      delete this.sessions[domain];
      this.saveSessions();
    }
  }

  /**
   * 获取所有活跃会话统计
   */
  getSessionStats() {
    const domains = Object.keys(this.sessions);
    const now = Date.now();
    
    return {
      totalSessions: domains.length,
      sessions: domains.map(domain => ({
        domain,
        lastSuccess: new Date(this.sessions[domain].lastSuccess).toISOString(),
        age: Math.round((now - this.sessions[domain].lastSuccess) / 1000 / 60) + ' 分钟前'
      }))
    };
  }
}

module.exports = AntiDetect;
