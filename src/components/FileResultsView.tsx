import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ExternalLink, Trash2, Copy, RefreshCw, Database, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { CrawlerResult } from "../types";

interface FileResultsViewProps {
  user: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

interface PostData {
  id: string;
  scriptId: string;
  ownerId: string;
  post: string | null;
  title: string;
  link: string | null;
  image: string | null;
  image_src?: string;
  date: string | null;
  image_base64: string | null;
  magnets: string | null;
  raw: string | object;
  timestamp: string;
  fileDate: string;
  filename: string;
  content?: string;
  images_base64?: string[];
}

export function FileResultsView({ user, apiFetch }: FileResultsViewProps) {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [viewMode, setViewMode] = useState<"card" | "json">("card");
  const [selectedResult, setSelectedResult] = useState<PostData | null>(null);
  const [searchRegex, setSearchRegex] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [totalPosts, setTotalPosts] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);
  const [filterHasImage, setFilterHasImage] = useState<"all" | "yes" | "no">("all");
  const [linqQuery, setLinqQuery] = useState("");
  const [showLinqModal, setShowLinqModal] = useState(false);
  const [linqError, setLinqError] = useState<string | null>(null);
  const [linqResults, setLinqResults] = useState<PostData[]>([]);
  const [selectedLinqIds, setSelectedLinqIds] = useState<Set<string>>(new Set());

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/all-posts-files`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
        setTotalPosts(data.length);
      }
    } catch (e) {
      console.error("Failed to fetch posts", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchPosts();
  }, [user, fetchPosts]);

  // Helper function to check if post has image
  const hasImage = useCallback((post: PostData): boolean => {
    try {
      if (post.image_src) return true;
      if (post.image_base64?.startsWith("data:image")) return true;
      if (post.image && post.image.startsWith("data:image")) return true;
      if (post.images_base64?.find((i: any) => typeof i === "string" && i.startsWith("data:image"))) return true;
      const raw = typeof post.raw === "string" ? JSON.parse(post.raw) : post.raw;
      if (raw?.image_base64?.startsWith("data:image")) return true;
      if (raw?.image && raw.image.startsWith("data:image")) return true;
      if (raw?.images_base64?.find((i: any) => typeof i === "string" && i.startsWith("data:image"))) return true;
    } catch { }
    return false;
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchRegex), 300);
    return () => clearTimeout(timer);
  }, [searchRegex]);

  // Group posts by scriptId and fileDate
  const groupedPosts = useMemo(() => {
    const groups: Record<string, { scriptId: string; fileDate: string; filename: string; posts: PostData[] }> = {};
    for (const post of posts) {
      const key = `${post.scriptId}_${post.fileDate}`;
      if (!groups[key]) {
        groups[key] = { scriptId: post.scriptId, fileDate: post.fileDate, filename: post.filename, posts: [] };
      }
      groups[key].posts.push(post);
    }
    return groups;
  }, [posts]);

  // Filter posts
  const filteredGroups = useMemo(() => {
    const filtered: typeof groupedPosts = {};
    for (const [key, group] of Object.entries(groupedPosts)) {
      let matchedPosts = group.posts.filter(post => {
        if (filterHasImage === "yes" && !hasImage(post)) return false;
        if (filterHasImage === "no" && hasImage(post)) return false;
        if (debouncedSearch.trim()) {
          try {
            const regex = new RegExp(debouncedSearch, "i");
            const text = `${post.title} ${post.link || ""} ${post.magnets || ""} ${post.raw || ""}`;
            return regex.test(text);
          } catch {
            return true;
          }
        }
        return true;
      });
      if (matchedPosts.length > 0) {
        filtered[key] = { ...group, posts: matchedPosts };
      }
    }
    return filtered;
  }, [groupedPosts, debouncedSearch, filterHasImage, hasImage]);

  // Calculate total filtered posts count
  const filteredPostsCount = useMemo(() => {
    return Object.values(filteredGroups).reduce((sum, group) => sum + group.posts.length, 0);
  }, [filteredGroups]);

  // Get all filtered posts as a flat array
  const allFilteredPosts = useMemo(() => {
    return Object.values(filteredGroups).flatMap(group => group.posts);
  }, [filteredGroups]);

  // Toggle file group
  const toggleFile = (key: string) => {
    setExpandedFiles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    setExpandedFiles(Object.keys(filteredGroups).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
  };

  const collapseAll = () => {
    setExpandedFiles({});
  };

  // Clear LINQ query
  const clearLinqQuery = () => {
    setLinqQuery("");
    setLinqResults([]);
    setLinqError(null);
    setShowLinqModal(false);
    setSelectedLinqIds(new Set());
  };

  // LINQ 查询处理
  const executeLinqQuery = () => {
    setLinqError(null);
    try {
      const query = linqQuery.trim();
      if (!query) {
        setLinqError("请输入查询语句");
        return;
      }
      let queryResults: PostData[] = [];
      for (const group of Object.values(filteredGroups)) {
        queryResults = [...queryResults, ...group.posts];
      }
      if (queryResults.length === 0) {
        setLinqError("当前数据为空，无法查询");
        return;
      }
      const parts = query.split('|').map(p => p.trim()).filter(p => p);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith('Where ') || trimmed.startsWith('where ')) {
          const condition = trimmed.slice(6).trim();
          queryResults = queryResults.filter(r => {
            try {
              if (condition.includes('~=') || condition.includes('~=')) {
                const [field, pattern] = condition.split(/~=|~=/);
                const regex = new RegExp(pattern, 'i');
                const value = (r as any)[field.trim()] || '';
                return regex.test(String(value));
              } else if (condition.includes('=')) {
                const [field, value] = condition.split('=');
                const fieldValue = (r as any)[field.trim()] || '';
                return String(fieldValue).toLowerCase().includes(value.toLowerCase());
              }
              return true;
            } catch {
              return false;
            }
          });
        } else if (trimmed.startsWith('OrderBy ') || trimmed.startsWith('orderby ')) {
          const field = trimmed.slice(8).trim();
          queryResults.sort((a, b) => {
            const aVal = (a as any)[field] || '';
            const bVal = (b as any)[field] || '';
            return String(aVal).localeCompare(String(bVal));
          });
        } else if (trimmed.startsWith('OrderByDesc ') || trimmed.startsWith('orderbydesc ')) {
          const field = trimmed.slice(12).trim();
          queryResults.sort((a, b) => {
            const aVal = (a as any)[field] || '';
            const bVal = (b as any)[field] || '';
            return String(bVal).localeCompare(String(aVal));
          });
        } else if (trimmed.startsWith('Take ') || trimmed.startsWith('take ')) {
          const count = parseInt(trimmed.slice(5).trim()) || 10;
          queryResults = queryResults.slice(0, count);
        } else if (trimmed === 'Count' || trimmed === 'count' || trimmed === 'Count()') {
          setLinqError(`共 ${queryResults.length} 条记录`);
          setLinqResults([]);
          return;
        }
      }
      setLinqResults(queryResults);
    } catch (e: any) {
      setLinqError(`查询错误：${e.message}`);
    }
  };

  // 删除选中的 post
  const deleteSelectedPosts = async () => {
    if (selectedLinqIds.size === 0) {
      alert("请先选择要删除的项");
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedLinqIds.size} 条记录？`)) return;
    try {
      const deletePromises = Array.from(selectedLinqIds).map(id => apiFetch(`/api/posts/${id}`, { method: "DELETE" }));
      await Promise.all(deletePromises);
      alert("删除成功");
      setSelectedLinqIds(new Set());
      fetchPosts();
      setLinqResults([]);
    } catch (e: any) {
      alert("删除失败：" + e.message);
    }
  };

  // 导出选中的 post
  const exportSelectedPosts = async () => {
    if (selectedLinqIds.size === 0) {
      alert("请先选择要导出的项");
      return;
    }
    const postsToExport = linqResults.filter(p => selectedLinqIds.has(p.id));
    const dataStr = JSON.stringify(postsToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export_${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    alert(`已导出 ${postsToExport.length} 条记录`);
  };

  // 导入选中的到数据库
  const importSelectedToDatabase = async () => {
    if (selectedLinqIds.size === 0) {
      alert("请先选择要导入的项");
      return;
    }
    if (!confirm(`确定导入选中的 ${selectedLinqIds.size} 条记录到数据库？`)) return;
    try {
      setImporting(true);
      let inserted = 0, updated = 0, skipped = 0;
      for (const post of linqResults.filter(p => selectedLinqIds.has(p.id))) {
        const res = await apiFetch(`/api/results/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptId: post.scriptId, title: post.title, link: post.link, content: post.content || post.post, magnets: post.magnets, raw: post.raw, timestamp: post.timestamp })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.action === 'inserted') inserted++;
          else if (data.action === 'updated') updated++;
          else skipped++;
        }
      }
      alert(`导入完成：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条`);
      setSelectedLinqIds(new Set());
      setLinqResults([]);
    } catch (e: any) {
      alert("导入失败：" + e.message);
    } finally {
      setImporting(false);
    }
  };

  // Toggle selection in LINQ results
  const toggleLinqSelection = (id: string) => {
    setSelectedLinqIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) { newSet.delete(id); } else { newSet.add(id); }
      return newSet;
    });
  };

  // Select all in LINQ results
  const selectAllLinqResults = () => {
    if (selectedLinqIds.size === linqResults.length) {
      setSelectedLinqIds(new Set());
    } else {
      setSelectedLinqIds(new Set(linqResults.map(p => p.id)));
    }
  };

  // 导入筛选后的数据到数据库 (顶部 Import All 按钮使用)
  const importFilteredToDatabase = async () => {
    if (filteredPostsCount === 0) {
      alert("没有筛选后的数据可导入");
      return;
    }
    if (!confirm(`确定导入筛选后的 ${filteredPostsCount} 条记录到数据库？`)) return;
    try {
      setImporting(true);
      let inserted = 0, updated = 0, skipped = 0;
      for (const post of allFilteredPosts) {
        const res = await apiFetch(`/api/results/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptId: post.scriptId, ownerId: post.ownerId, post: post.post, title: post.title, link: post.link, image: post.image, image_src: (post as any).image_src, date: post.date, image_base64: post.image_base64, magnets: post.magnets, raw: post.raw, timestamp: post.timestamp })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.action === "inserted") inserted++;
          else if (data.action === "updated") updated++;
          else skipped++;
        } else {
          skipped++;
        }
      }
      alert(`Import complete!\n- Inserted: ${inserted}\n- Updated: ${updated}\n- Skipped: ${skipped}`);
      fetchPosts();
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  // 导入单个文件组的数据到数据库 (文件组内 Import 按钮使用)
  const importGroupToDatabase = async (groupPosts: PostData[]) => {
    if (groupPosts.length === 0) {
      alert("没有数据可导入");
      return;
    }
    if (!confirm(`确定导入这 ${groupPosts.length} 条记录到数据库？`)) return;
    try {
      setImporting(true);
      let inserted = 0, updated = 0, skipped = 0;
      for (const post of groupPosts) {
        const res = await apiFetch(`/api/results/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptId: post.scriptId, ownerId: post.ownerId, post: post.post, title: post.title, link: post.link, image: post.image, image_src: (post as any).image_src, date: post.date, image_base64: post.image_base64, magnets: post.magnets, raw: post.raw, timestamp: post.timestamp })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.action === "inserted") inserted++;
          else if (data.action === "updated") updated++;
          else skipped++;
        } else {
          skipped++;
        }
      }
      alert(`Import complete!\n- Inserted: ${inserted}\n- Updated: ${updated}\n- Skipped: ${skipped}`);
      fetchPosts();
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Delete file results
  const deleteFileResults = async (scriptId: string, filename: string) => {
    if (!confirm(`Delete file ${filename} from ${scriptId}?`)) return;
    try {
      const res = await apiFetch(`/api/all-posts-file/${scriptId}/${filename}`, { method: "DELETE" });
      if (res.ok) {
        alert("Deleted successfully");
        fetchPosts();
      } else {
        const data = await res.json();
        alert(`Delete failed: ${data.message || res.statusText}`);
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  // Render image
  const renderImage = (post: PostData, onClick?: () => void) => {
    if (post.image_src) {
      const imgSrc = `/api/result-image/${post.scriptId}/${post.image_src}`;
      return (
        <div className="mb-4 rounded-xl overflow-hidden aspect-video bg-zinc-800 cursor-pointer" onClick={onClick}>
          <img src={imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      );
    }
    try {
      let imgSrc: string | null = null;
      if (post.image_base64?.startsWith("data:image")) imgSrc = post.image_base64;
      else if (post.images_base64?.find((i: any) => typeof i === "string" && i.startsWith("data:image"))) {
        imgSrc = post.images_base64.find((i: any) => typeof i === "string" && i.startsWith("data:image"));
      } else {
        const raw = typeof post.raw === "string" ? JSON.parse(post.raw) : post.raw;
        if (raw.image_base64?.startsWith("data:image")) imgSrc = raw.image_base64;
        else if (raw.images_base64?.find((i: any) => typeof i === "string" && i.startsWith("data:image"))) {
          imgSrc = raw.images_base64.find((i: any) => typeof i === "string" && i.startsWith("data:image"));
        }
      }
      if (imgSrc) {
        return (
          <div className="mb-4 rounded-xl overflow-hidden aspect-video bg-zinc-800 cursor-pointer" onClick={onClick}>
            <img src={imgSrc} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
          </div>
        );
      }
    } catch { }
    return null;
  };

  // Render magnets
  const renderMagnets = (magnets: string | null | undefined) => {
    if (!magnets) return null;
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-xs font-mono text-emerald-500">
          <span className="truncate flex-1">{magnets}</span>
          <button onClick={async () => { await navigator.clipboard.writeText(magnets); alert("Magnet link copied!"); }} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-2xl font-bold text-white">File Results Preview</h3>
          <p className="text-zinc-500">
            View results from crawlerXnode/result directory (all_posts_*.json files).
            {totalPosts > 0 && (
              <span className="ml-2 text-emerald-500">
                Total {Object.keys(filteredGroups).length} files / {filteredPostsCount} items (filtered from {totalPosts})
              </span>
            )}
          </p>
        </div>
        <input
          type="text"
          value={searchRegex}
          onChange={(e) => setSearchRegex(e.target.value)}
          placeholder="Regex search (e.g., magnet:|btih:)"
          className="w-full pl-4 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={fetchPosts} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700 flex items-center gap-2">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refresh
          </button>
          <button onClick={expandAll} className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700">Expand All</button>
          <button onClick={collapseAll} className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700">Collapse All</button>
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button onClick={() => setFilterHasImage("all")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", filterHasImage === "all" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}>全部</button>
            <button onClick={() => setFilterHasImage("yes")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", filterHasImage === "yes" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}>有图片</button>
            <button onClick={() => setFilterHasImage("no")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", filterHasImage === "no" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}>无图片</button>
          </div>
          <button onClick={importFilteredToDatabase} disabled={importing || filteredPostsCount === 0} className={cn("px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2", importing ? "bg-zinc-700 text-zinc-400 cursor-not-allowed" : "bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20")}>
            {importing ? (<> <RefreshCw className="w-4 h-4 animate-spin" /> <span>Importing...</span> </>) : (<> <Database className="w-4 h-4" /> <span>Import All ({filteredPostsCount})</span> </>)}
          </button>
          <button onClick={() => setShowLinqModal(true)} disabled={filteredPostsCount === 0} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-500/10 border border-blue-500/50 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <Database className="w-4 h-4" /> <span>LINQ Query</span>
          </button>
        </div>
      </div>

      {/* Results by file group */}
      <div className="space-y-4">
        {Object.entries(filteredGroups).length === 0 ? (
          <div className="text-center py-12 text-zinc-500">No results found. Try adjusting your filters.</div>
        ) : (
          Object.entries(filteredGroups).map(([key, group]) => {
            const isExpanded = expandedFiles[key];
            return (
              <div key={key} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-900" onClick={() => toggleFile(key)}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center transition-transform", isExpanded ? "bg-emerald-500/20 rotate-90" : "bg-zinc-800")}>▶</div>
                    <div>
                      <h4 className="font-semibold text-white">{group.filename}</h4>
                      <p className="text-xs text-zinc-500">{group.scriptId} | {group.fileDate} | {group.posts.length} items</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); importGroupToDatabase(group.posts); }} disabled={importing} className="px-3 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 disabled:opacity-50 flex items-center gap-1">
                      <Database className="w-3 h-3" /> Import ({group.posts.length})
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteFileResults(group.scriptId, group.filename); }} disabled={importing} className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 disabled:opacity-50 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-zinc-800">
                      <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {group.posts.map((post) => (
                            <div key={post.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                              {renderImage(post, () => setSelectedResult(post))}
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="flex-1 min-w-0">
                                  {post.link ? (
                                    <a href={post.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-emerald-400 transition-colors truncate block">{post.title}</a>
                                  ) : (
                                    <h5 className="font-semibold text-white truncate">{post.title}</h5>
                                  )}
                                  <div className="flex flex-wrap gap-3 mt-3">
                                    {(post as any).sid && (
                                      <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                                        <span className="text-zinc-500 mr-1">ID:</span>{(post as any).sid}
                                      </span>
                                    )}
                                    {(post as any).actress && (
                                      <span className="text-xs text-pink-400 bg-pink-500/10 px-2 py-1 rounded border border-pink-500/20">
                                        <span className="text-zinc-500 mr-1">Actress:</span>{(post as any).actress}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {renderMagnets(post.magnets)}
                              {post.content && (<div className="text-sm text-zinc-400 line-clamp-3">{post.content}</div>)}
                              <div className="flex items-center justify-between text-xs text-zinc-500 mt-4 pt-3 border-t border-zinc-800">
                                <span className="text-zinc-400">Date: {post.date || 'N/A'}</span>
                                {post.link && (
                                  <a href={post.link} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline flex items-center gap-1">Source <ExternalLink className="w-3 h-3" /></a>
                                )}
                              </div>


                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Post Detail Modal */}
      <AnimatePresence>
        {selectedResult && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setSelectedResult(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="text-xl font-semibold text-white">Post Details</h3>
                <button onClick={() => setSelectedResult(null)} className="text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-semibold text-white">{selectedResult.title}</h4>
                    <p className="text-sm text-zinc-500 mt-1">{selectedResult.scriptId} | {selectedResult.fileDate}</p>
                  </div>
                  {renderImage(selectedResult)}
                  {renderMagnets(selectedResult.magnets)}
                  {selectedResult.content && (
                    <div className="prose prose-invert max-w-none">
                      <p className="text-zinc-300 whitespace-pre-wrap">{selectedResult.content}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* LINQ Query Modal */}
      {showLinqModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={clearLinqQuery}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-white">LINQ Query - File Management</h3>
              <button onClick={clearLinqQuery} className="text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">查询语句</label>
                <textarea value={linqQuery} onChange={(e) => setLinqQuery(e.target.value)} placeholder="Where title=test | OrderBy date | Take 10" rows={3} className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 font-mono" />
              </div>
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">示例:</p>
                <div className="text-xs text-zinc-400 space-y-1 font-mono">
                  <p>Where title=magnet - 筛选标题包含 magnet 的记录</p>
                  <p>Where title~=^test - 筛选标题以 test 开头的记录 (正则)</p>
                  <p>OrderBy date - 按日期升序排序</p>
                  <p>OrderByDesc timestamp - 按时间戳降序排序</p>
                  <p>Take 50 - 取前 50 条记录</p>
                  <p>Where title=magnet | OrderBy date | Take 20 - 组合查询</p>
                  <p>Count - 显示总数</p>
                </div>
              </div>
              {linqError && (<div className="bg-blue-500/10 border border-blue-500/50 p-4 rounded-xl text-sm text-blue-400">{linqError}</div>)}
              {linqResults.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-zinc-400">查询结果：{linqResults.length} 条</p>
                    <div className="flex gap-2">
                      <button onClick={selectAllLinqResults} className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700">{selectedLinqIds.size === linqResults.length ? '取消全选' : '全选'}</button>
                      <button onClick={deleteSelectedPosts} disabled={selectedLinqIds.size === 0} className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 disabled:opacity-50">删除选中 ({selectedLinqIds.size})</button>
                      <button onClick={exportSelectedPosts} disabled={selectedLinqIds.size === 0} className="px-3 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 disabled:opacity-50">导出选中 ({selectedLinqIds.size})</button>
                      <button onClick={importSelectedToDatabase} disabled={selectedLinqIds.size === 0} className="px-3 py-1.5 text-xs bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 disabled:opacity-50">导入数据库 ({selectedLinqIds.size})</button>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {linqResults.map((post) => (
                      <div key={post.id} className="flex items-center gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                        <input type="checkbox" checked={selectedLinqIds.has(post.id)} onChange={() => toggleLinqSelection(post.id)} className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-500 focus:ring-blue-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{post.title}</p>
                          <p className="text-xs text-zinc-500">{post.scriptId.slice(0, 8)} | {post.fileDate}</p>
                        </div>
                        {(post.image_src || post.image_base64?.startsWith("data:image")) && (
                          <div className="w-12 h-12 rounded bg-zinc-800 overflow-hidden">
                            {post.image_src ? (
                              <img src={`/api/result-image/${post.scriptId}/${post.image_src}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <img src={post.image_base64} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={clearLinqQuery} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-sm hover:bg-zinc-700">关闭</button>
              <button onClick={executeLinqQuery} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600">执行查询</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
