import React, { useState, useEffect } from "react";
import { Play, Copy, ExternalLink, RefreshCw, Link as LinkIcon, Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface RSSKey {
  id: string;
  name: string;
  key: string;
  keywords: string;
  createdAt: string;
}

interface RSSFeedTestProps {
  user: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export function RSSFeedTest({ user, apiFetch }: RSSFeedTestProps) {
  const [keys, setKeys] = useState<RSSKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [customKeywords, setCustomKeywords] = useState("");
  const [feedFormat, setFeedFormat] = useState<"rss" | "json">("rss");
  const [loading, setLoading] = useState(false);
  const [feedData, setFeedData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await apiFetch("/api/rss_keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
        if (data.length > 0 && !selectedKeyId) {
          setSelectedKeyId(data[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch RSS keys", e);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const selectedKey = keys.find(k => k.id === selectedKeyId);

  // Generate full RSS feed URL
  const getFeedUrl = () => {
    if (!selectedKey) return "";
    const baseUrl = `${window.location.origin}/api/feed/${feedFormat}`;
    const params = new URLSearchParams({ key: selectedKey.key });
    if (customKeywords.trim()) {
      params.append("keywords", customKeywords.trim());
    }
    return `${baseUrl}?${params.toString()}`;
  };

  const testFeed = async () => {
    if (!selectedKey) return;
    setLoading(true);
    setFeedData(null);
    try {
      const url = getFeedUrl();
      const res = await apiFetch(url);
      if (res.ok) {
        const text = await res.text();
        // RSS format returns XML, JSON format returns JSON
        if (feedFormat === "json") {
          const data = JSON.parse(text);
          setFeedData(data);
        } else {
          // For RSS, store the XML content and item count
          // Parse XML to extract items for preview
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, "text/xml");
          const items: any[] = [];
          const entries = xmlDoc.querySelectorAll("item");
          entries.forEach((entry) => {
            const title = entry.querySelector("title")?.textContent || "";
            const link = entry.querySelector("link")?.textContent || "";
            const description = entry.querySelector("description")?.textContent || "";
            const pubDate = entry.querySelector("pubDate")?.textContent || "";
            items.push({ title, link, content: description, pubDate });
          });
          setFeedData({ items, xml: text });
        }
      } else {
        const error = await res.text();
        alert(`请求失败：${error}`);
      }
    } catch (e: any) {
      alert(`请求错误：${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = async () => {
    const url = getFeedUrl();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openInNewTab = () => {
    const url = getFeedUrl();
    window.open(url, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold text-white">RSS Feed 测试</h3>
        <p className="text-zinc-500">测试 RSS 密钥并预览抓取结果</p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <LinkIcon className="w-4 h-4" />
          查询配置
        </h4>

        {/* Key Selection */}
        <div>
          <label className="block text-sm text-zinc-400 mb-2">选择密钥</label>
          <select
            value={selectedKeyId}
            onChange={e => setSelectedKeyId(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
          >
            {keys.map(key => (
              <option key={key.id} value={key.id}>
                {key.name}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Keywords */}
        <div>
          <label className="block text-sm text-zinc-400 mb-2">
            关键词过滤 (可选)
          </label>
          <input
            type="text"
            value={customKeywords}
            onChange={e => setCustomKeywords(e.target.value)}
            
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
          />
          <p className="text-xs text-zinc-500 mt-1">
            关键词使用 "+" 或 " " 连接
          </p>
        </div>

        {/* Format Selection */}
        <div>
          <label className="block text-sm text-zinc-400 mb-2">返回格式</label>
          <div className="flex gap-2">
            <button
              onClick={() => setFeedFormat("rss")}
              className={cn(
                "flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all",
                feedFormat === "rss"
                  ? "bg-emerald-500 text-zinc-950"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              )}
            >
              RSS XML
            </button>
            <button
              onClick={() => setFeedFormat("json")}
              className={cn(
                "flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all",
                feedFormat === "json"
                  ? "bg-emerald-500 text-zinc-950"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              )}
            >
              JSON
            </button>
          </div>
        </div>

        {/* Generated URL */}
        <div>
          <label className="block text-sm text-zinc-400 mb-2">生成的查询链接</label>
          <div className="flex gap-2">
            <code className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-emerald-500 overflow-x-auto">
              {getFeedUrl() || "请选择密钥"}
            </code>
            <button
              onClick={copyUrl}
              disabled={!selectedKeyId}
              className={cn(
                "px-4 py-2 rounded-xl transition-all flex items-center gap-2",
                copied
                  ? "bg-emerald-500 text-zinc-950"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              )}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={openInNewTab}
              disabled={!selectedKeyId}
              className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-all flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Test Button */}
        <button
          onClick={testFeed}
          disabled={!selectedKeyId || loading}
          className={cn(
            "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
            selectedKeyId && !loading
              ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
          )}
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              加载中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              测试查询
            </>
          )}
        </button>
      </div>

      {/* Results Preview */}
      {feedData && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            查询结果 ({feedData.items?.length || 0} 条)
          </h4>

          {/* JSON View */}
          {feedFormat === "json" && (
            <div className="bg-zinc-950 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs text-emerald-500 font-mono">
                {JSON.stringify(feedData, null, 2)}
              </pre>
            </div>
          )}

          {/* RSS Items View */}
          {feedFormat === "rss" && feedData.items && (
            <div className="space-y-4">
              {feedData.items.map((item: any, index: number) => (
                <div key={index} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-medium text-white">{item.title}</h5>
                    <span className="text-xs text-zinc-500 whitespace-nowrap ml-4">
                      {new Date(item.pubDate).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  {item.content && (
                    <p className="text-sm text-zinc-400 line-clamp-2 mb-2">
                      {item.content}
                    </p>
                  )}
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-500 hover:underline flex items-center gap-1"
                    >
                      {item.link}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!feedData && !loading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <LinkIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-500">点击"测试查询"按钮预览 RSS Feed 内容</p>
        </div>
      )}
    </motion.div>
  );
}
