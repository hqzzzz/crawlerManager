import React, { useState, useEffect } from "react";
import { Trash2, Rss, Plus, RefreshCw, ExternalLink, Copy, Key, PlusCircle, Eye } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface RSSKey {
  id: string;
  name: string;
  key: string;
  keywords: string;
  ownerId: string;
  createdAt: string;
}

interface RSSSubscription {
  id: string;
  url: string;
  name: string;
  ownerId: string;
}

interface RSSViewProps {
  user: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export function RSSView({ user, apiFetch }: RSSViewProps) {
  const [subs, setSubs] = useState<RSSSubscription[]>([]);
  const [keys, setKeys] = useState<RSSKey[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [activeFeed, setActiveFeed] = useState<any>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [activeSection, setActiveSection] = useState<"subscriptions" | "keys">("keys");
  const [showKey, setShowKey] = useState<string | null>(null);

  const fetchSubs = async () => {
    try {
      const res = await apiFetch(`/api/rss_subscriptions?ownerId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setSubs(data);
      }
    } catch (e) {
      console.error("Failed to fetch RSS subscriptions", e);
    }
  };

  const fetchKeys = async () => {
    try {
      const res = await apiFetch("/api/rss_keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      }
    } catch (e) {
      console.error("Failed to fetch RSS keys", e);
    }
  };

  useEffect(() => {
    fetchSubs();
    fetchKeys();
  }, [user]);

  const addSub = async () => {
    if (!newUrl) return;
    try {
      const res = await apiFetch(`/api/rss?url=${encodeURIComponent(newUrl)}`);
      if (!res.ok) throw new Error("Invalid RSS feed");
      const feed = await res.json();
      const saveRes = await apiFetch("/api/rss_subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl, name: feed.title || "Unnamed Feed", ownerId: user.uid })
      });
      if (saveRes.ok) {
        setNewUrl("");
        fetchSubs();
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteSub = async (id: string) => {
    try {
      const res = await apiFetch(`/api/rss_subscriptions/${id}`, { method: "DELETE" });
      if (res.ok) fetchSubs();
    } catch (e) {
      alert("Failed to delete subscription");
    }
  };

  const addKey = async () => {
    if (!newKeyName.trim()) {
      alert("请输入密钥名称");
      return;
    }
    try {
      const res = await apiFetch("/api/rss_keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`RSS Key created: ${data.key}\n请妥善保存！`);
        setNewKeyName("");
        fetchKeys();
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm("确定要删除此 RSS 密钥吗？")) return;
    try {
      const res = await apiFetch(`/api/rss_keys/${id}`, { method: "DELETE" });
      if (res.ok) fetchKeys();
    } catch (e) {
      alert("Failed to delete key");
    }
  };

  const copyKey = async (text: string) => {
    await navigator.clipboard.writeText(text);
    alert("已复制到剪贴板");
  };

  const copyFeedUrl = async (key: string) => {
    const url = `${window.location.origin}/api/feed/rss?key=${key}`;
    await navigator.clipboard.writeText(url);
    alert("RSS URL 已复制");
  };

  const copyJsonFeedUrl = async (key: string) => {
    const url = `${window.location.origin}/api/feed/rss-json?key=${key}`;
    await navigator.clipboard.writeText(url);
    alert("JSON URL 已复制");
  };

  const viewFeed = async (url: string) => {
    setLoadingFeed(true);
    try {
      const res = await apiFetch(`/api/rss?url=${encodeURIComponent(url)}`);
      const feed = await res.json();
      setActiveFeed(feed);
    } catch (e: any) {
      alert("Error loading feed");
    } finally {
      setLoadingFeed(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      {/* Left Panel */}
      <div className="lg:col-span-1 space-y-6">
        <div>
          <h3 className="text-2xl font-bold text-white">RSS 订阅管理</h3>
          <p className="text-zinc-500">管理 RSS 密钥和订阅源</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl">
          <button
            onClick={() => setActiveSection("keys")}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors",
              activeSection === "keys"
                ? "bg-emerald-500 text-zinc-950"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Key className="w-4 h-4 inline mr-1" />
            密钥管理
          </button>
          <button
            onClick={() => setActiveSection("subscriptions")}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors",
              activeSection === "subscriptions"
                ? "bg-emerald-500 text-zinc-950"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Rss className="w-4 h-4 inline mr-1" />
            订阅源
          </button>
        </div>

        {/* RSS Keys Section */}
        {activeSection === "keys" && (
          <>
            {/* Create New Key */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4" />
                创建新密钥
              </h4>
              <input
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="密钥名称"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={addKey}
                className="w-full py-2 bg-emerald-500 text-zinc-950 rounded-xl hover:bg-emerald-400 transition-colors font-medium"
              >
                创建密钥
              </button>
            </div>

            {/* Keys List */}
            <div className="space-y-3">
              {keys.map(key => (
                <div key={key.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{key.name}</span>
                    <button
                      onClick={() => deleteKey(key.id)}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Full Key Display */}
                  <div className="bg-zinc-950 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-zinc-800 rounded px-2 py-1.5 text-xs text-emerald-500 font-mono break-all">
                        {showKey === key.id ? key.key : `${key.key.substring(0, 12)}...${key.key.substring(key.key.length - 6)}`}
                      </code>
                      <button
                        onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white transition-colors"
                        title={showKey === key.id ? "隐藏密钥" : "显示完整密钥"}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => copyKey(key.key)}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-emerald-400 transition-colors"
                        title="复制完整密钥"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Feed URLs */}
                  <div className="space-y-2">
                    {/* RSS URL */}
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-400 truncate">
                        /api/feed/rss?key=...
                      </code>
                      <button
                        onClick={() => copyFeedUrl(key.key)}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-emerald-400 transition-colors"
                        title="复制 RSS URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* JSON URL */}
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-500 truncate">
                        /api/feed/rss-json?key=...
                      </code>
                      <button
                        onClick={() => copyJsonFeedUrl(key.key)}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-emerald-400 transition-colors"
                        title="复制 JSON URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-600">
                    创建于：{new Date(key.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              ))}
              {keys.length === 0 && (
                <p className="text-zinc-500 text-center py-8">
                  暂无 RSS 密钥，请创建一个新的密钥
                </p>
              )}
            </div>
          </>
        )}

        {/* Subscriptions Section */}
        {activeSection === "subscriptions" && (
          <>
            <div className="flex gap-2">
              <input
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="Feed URL..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={addSub}
                className="p-3 bg-emerald-500 text-zinc-950 rounded-xl hover:bg-emerald-400 transition-colors"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-3">
              {subs.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => viewFeed(sub.url)}
                  className={cn(
                    "w-full p-4 rounded-2xl border flex items-center justify-between group transition-all",
                    activeFeed?.feedUrl === sub.url
                      ? "bg-emerald-500/10 border-emerald-500/50 text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Rss
                      className={cn(
                        "w-5 h-5 flex-shrink-0",
                        activeFeed?.feedUrl === sub.url ? "text-emerald-500" : "text-zinc-600"
                      )}
                    />
                    <span className="font-medium truncate">{sub.name}</span>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await deleteSub(sub.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right Panel - Feed Preview */}
      <div className="lg:col-span-2">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl min-h-[600px] flex flex-col overflow-hidden">
          {loadingFeed ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          ) : activeFeed ? (
            <>
              <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
                <h4 className="text-xl font-bold text-white mb-1">{activeFeed.title}</h4>
                <p className="text-sm text-zinc-500">{activeFeed.description}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {activeFeed.items.map((item: any, i: number) => (
                  <div key={i} className="group">
                    <div className="flex justify-between items-start mb-2">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-bold text-white hover:text-emerald-500 transition-colors flex items-center gap-2"
                      >
                        {item.title}
                        <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      <span className="text-xs text-zinc-600 whitespace-nowrap ml-4">
                        {new Date(item.pubDate).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 line-clamp-2">
                      {item.contentSnippet || item.content}
                    </p>
                    <div className="mt-4 h-px bg-zinc-800 group-last:hidden" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 p-8 text-center">
              <Rss className="w-16 h-16 mb-4 opacity-20" />
              <p>选择一个订阅源或查看 RSS 密钥生成的 Feed</p>
              <div className="mt-4 text-sm text-zinc-500">
                <p>RSS Feed 格式:</p>
                <code className="block mt-2 bg-zinc-800 px-4 py-2 rounded-lg">
                  /api/feed/rss?key=YOUR_KEY
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
