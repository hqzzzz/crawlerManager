/**
 * 配置模块
 * 集中管理爬虫配置和代理设置
 */

// 默认配置
const defaultConfig = {
  // 请求延迟 (毫秒)
  delay: 2000,
  
  // 最大重试次数
  maxRetries: 3,
  
  // 请求超时 (毫秒)
  timeout: 30000,
  
  // 并发数
  maxConcurrent: 5,
  
  // 每秒最大请求数
  rateLimit: 10,
  
  // 是否使用无头浏览器
  useHeadless: true,
  
  // 是否启用代理轮换
  proxyRotation: true,
  
  // 是否启用会话保持
  sessionKeepAlive: true,
  
  // 会话有效期 (毫秒)
  sessionTTL: 24 * 60 * 60 * 1000,
  
  // 代理列表 (可以添加你的代理服务器)
  proxies: [
    // 'http://username:password@proxy1.com:8080',
    // 'http://username:password@proxy2.com:8080',
  ],
  
  // 用户代理池
  userAgents: {
    chrome: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    ],
    firefox: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    ]
  }
};

// 加载自定义配置
function loadConfig(customConfig = {}) {
  return {
    ...defaultConfig,
    ...customConfig
  };
}

// 验证配置
function validateConfig(config) {
  const errors = [];
  
  if (config.delay < 0) {
    errors.push('delay 必须是非负数');
  }
  
  if (config.maxRetries < 0) {
    errors.push('maxRetries 必须是非负数');
  }
  
  if (config.timeout < 1000) {
    errors.push('timeout 必须至少为 1000 毫秒');
  }
  
  if (config.maxConcurrent < 1) {
    errors.push('maxConcurrent 必须至少为 1');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 代理配置
const proxyConfig = {
  // 免费代理 API (可选)
  freeProxyApis: [
    'https://free-proxy-list.net/',
    'https://www.sslproxies.org/'
  ],
  
  // 付费代理服务示例
  paidProxyServices: {
    // Bright Data
    brightData: {
      host: 'brd.superproxy.io',
      port: 33333,
      username: 'your-username',
      password: 'your-password'
    },
    // Smartproxy
    smartproxy: {
      host: 'gate.smartproxy.com',
      port: 10000,
      username: 'your-username',
      password: 'your-password'
    }
  }
};

// 目标网站特定配置
const siteConfigs = {
  // 示例：针对特定网站的配置
  'example.com': {
    delay: 3000,
    rateLimit: 5,
    useProxy: true
  },
  'twitter.com': {
    delay: 5000,
    rateLimit: 3,
    useProxy: true
  }
};

module.exports = {
  defaultConfig,
  loadConfig,
  validateConfig,
  proxyConfig,
  siteConfigs
};
