/**
 * 请求管理器
 * 处理代理轮换、请求限流、会话管理等功能
 */

const axios = require('axios');
const { CookieJar } = require('tough-cookie');

class RequestManager {
  constructor(config = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent || 5,
      rateLimit: config.rateLimit || 10, // 每秒最大请求数
      proxyRotation: config.proxyRotation !== false,
      ...config
    };

    this.currentConcurrency = 0;
    this.requestQueue = [];
    this.cookieJar = new CookieJar();
    this.proxyList = config.proxies || [];
    this.currentProxyIndex = 0;
    this.rotationCount = 0;
    this.lastRequestTime = 0;
    this.requestTimestamps = [];
    
    // 会话状态存储
    this.sessionData = new Map();
  }

  /**
   * 获取代理（从代理池轮换）
   */
  async getProxy() {
    if (this.proxyList.length === 0) {
      return null;
    }

    const proxy = this.proxyList[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
    this.rotationCount++;

    return {
      httpProxy: proxy,
      httpsProxy: proxy
    };
  }

  /**
   * 获取旋转次数
   */
  getRotationCount() {
    return this.rotationCount;
  }

  /**
   * 限流控制
   */
  async rateLimit() {
    const now = Date.now();
    
    // 清理 1 秒前的时间戳
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < 1000
    );

    // 如果达到限流阈值，等待
    if (this.requestTimestamps.length >= this.config.rateLimit) {
      const waitTime = 1000 - (now - this.requestTimestamps[0]);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.requestTimestamps.push(now);
  }

  /**
   * 并发控制
   */
  async acquireConcurrency() {
    while (this.currentConcurrency >= this.config.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.currentConcurrency++;
  }

  /**
   * 释放并发槽位
   */
  releaseConcurrency() {
    this.currentConcurrency--;
  }

  /**
   * 获取会话 Cookie
   */
  getCookies(url) {
    return this.cookieJar.getCookiesSync(url);
  }

  /**
   * 设置 Cookie
   */
  setCookie(cookieString, url) {
    return this.cookieJar.setCookieSync(cookieString, url);
  }

  /**
   * 清除所有 Cookie
   */
  clearCookies() {
    this.cookieJar = new CookieJar();
  }

  /**
   * 存储会话数据
   */
  setSessionData(key, value) {
    this.sessionData.set(key, value);
  }

  /**
   * 获取会话数据
   */
  getSessionData(key) {
    return this.sessionData.get(key);
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.requestQueue = [];
    this.sessionData.clear();
    this.cookieJar = new CookieJar();
  }

  /**
   * 添加代理到代理池
   */
  addProxy(proxy) {
    if (!this.proxyList.includes(proxy)) {
      this.proxyList.push(proxy);
    }
  }

  /**
   * 移除代理
   */
  removeProxy(proxy) {
    this.proxyList = this.proxyList.filter(p => p !== proxy);
  }

  /**
   * 获取代理池状态
   */
  getProxyStatus() {
    return {
      totalProxies: this.proxyList.length,
      rotationCount: this.rotationCount,
      currentProxyIndex: this.currentProxyIndex
    };
  }

  /**
   * 健康检查代理
   */
  async checkProxy(proxy) {
    try {
      const response = await axios.get('https://httpbin.org/ip', {
        timeout: 5000,
        proxy: {
          host: proxy.split(':')[0],
          port: parseInt(proxy.split(':')[1]),
        }
      });
      return {
        valid: response.status === 200,
        ip: response.data?.origin
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 验证代理列表
   */
  async validateProxies() {
    const validProxies = [];
    
    for (const proxy of this.proxyList) {
      const result = await this.checkProxy(proxy);
      if (result.valid) {
        validProxies.push(proxy);
      }
    }
    
    this.proxyList = validProxies;
    return validProxies;
  }
}

module.exports = RequestManager;
