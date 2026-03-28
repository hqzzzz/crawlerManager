import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Copy, Database, RefreshCw, X, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { CrawlerResult } from "../types";

interface DatabaseResultsViewProps {
  user: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export function DatabaseResultsView({ user, apiFetch }: DatabaseResultsViewProps) {
  const [results, setResults] = useState<CrawlerResult[]>([]);
  const [viewMode, setViewMode] = useState<"card" | "json">("card");
  const [selectedResult, setSelectedResult] = useState<CrawlerResult | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateResults, setDuplicateResults] = useState<CrawlerResult[]>([]);
  const [deduplicating, setDeduplicating] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchRegex, setSearchRegex] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [groupBySource, setGroupBySource] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"date" | "timestamp">("timestamp");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterHasImage, setFilterHasImage] = useState<"all" | "yes" | "no">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const LIMIT = 100;
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollPositionKey = `db-scroll-${user?.uid || 'admin'}`;
  const savedScrollTop = useRef<number>(0);
  const isInitialMount = useRef(true);

  // Helper function to check if result has image
  const hasImage = useCallback((result: CrawlerResult & { image_src?: string; image_base64?: string; raw?: any }): boolean => {
    try {
      const raw = typeof result.raw === "string" ? JSON.parse(result.raw || "{}") : result.raw;
      if (result.image_src) return true;  // 新增：检查 image_src
      if ((result as any).image_base64?.startsWith("data:image")) return true;
      if (raw?.image_base64?.startsWith("data:image")) return true;
      if (Array.isArray(raw?.images_base64) && raw.images_base64.find((i: any) => typeof i === "string" && i.startsWith("data:image"))) return true;
      if ((result as any).image?.startsWith("data:image")) return true;
    } catch { }
    return false;
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchRegex), 300);
    return () => clearTimeout(timer);
  }, [searchRegex]);

  // 恢复滚动位置（仅在初始加载时）
  useEffect(() => {
    if (isInitialMount.current && !results.length) {
      isInitialMount.current = false;
      const saved = sessionStorage.getItem(scrollPositionKey);
      if (saved && containerRef.current) {
        setTimeout(() => {
          containerRef.current!.scrollTop = parseInt(saved, 10);
        }, 0);
      }
    }
  }, [scrollPositionKey, results.length]);

  // 保存滚动位置
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      sessionStorage.setItem(scrollPositionKey, container.scrollTop.toString());
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [scrollPositionKey]);

  // Fetch results
  const fetchResults = useCallback(async (append = false, pageNum?: number) => {
    setLoading(true);
    try {
      const currentPage = pageNum ?? (append ? page : 1);
      const res = await apiFetch(`/api/results?ownerId=admin&limit=${LIMIT}&page=${currentPage}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          if (containerRef.current) {
            savedScrollTop.current = containerRef.current.scrollTop;
          }
          setResults((prev) => [...prev, ...data]);
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = savedScrollTop.current;
            }
          }, 0);
        } else {
          setResults(data);
        }
        setHasMore(data.length === LIMIT);
      }
    } catch (e) {
      setHasMore(false);
      console.error("Failed to fetch results", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page]);

  // Scroll loading with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.1 }
    );
    const el = document.getElementById("load-more-trigger");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [loading, hasMore]);

  useEffect(() => {
    fetchResults(true, page);
  }, [page, fetchResults]);

  // Fetch counts
  const fetchDuplicateCount = useCallback(async () => {
    const res = await apiFetch(`/api/results/duplicates`);
    if (res.ok) {
      const data = await res.json(); // 只调用一次 json()
      setDuplicateCount(data.count || 0);
      setDuplicateResults(data.results || []);
    }
  }, [apiFetch]);

  const fetchTotalCount = useCallback(async () => {
    const res = await apiFetch(`/api/results/count?ownerId=admin`);
    if (res.ok) setTotalResults((await res.json()).count || 0);
  }, [apiFetch]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setResults([]);
    fetchResults(false, 1);
    fetchDuplicateCount();
    fetchTotalCount();
  }, [user]);

  // Actions
  const deleteResult = async (id: string) => {
    if (!confirm("Delete this record?")) return;
    const res = await apiFetch(`/api/results/${id}`, { method: "DELETE" });
    if (res.ok) {
      sessionStorage.removeItem(scrollPositionKey);
      setResults([]);
      setPage(1);
      fetchResults(false, 1);
      fetchDuplicateCount();
      fetchTotalCount();
    }
  };

  // 批量删除选中的记录
  const deleteSelected = async () => {
    if (selectedIds.size === 0) {
      alert("请先选择要删除的项");
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条记录？`)) return;
    try {
      setDeleting(true);
      const deletePromises = Array.from(selectedIds).map(id =>
        apiFetch(`/api/results/${id}`, { method: "DELETE" })
      );
      await Promise.all(deletePromises);
      alert(`删除成功 ${selectedIds.size} 条记录`);
      setSelectedIds(new Set());
      sessionStorage.removeItem(scrollPositionKey);
      setResults([]);
      setPage(1);
      fetchResults(false, 1);
      fetchDuplicateCount();
      fetchTotalCount();
    } catch (e: any) {
      alert("删除失败：" + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const deduplicate = async () => {
    if (!confirm(`Found ${duplicateCount} duplicate records. Keep records with base64 images, delete duplicates?`)) return;
    try {
      setDeduplicating(true);
      const res = await apiFetch(`/api/results/deduplicate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Deduplication complete!\nTotal: ${data.total}\nDeleted: ${data.deleted}\nKept with base64: ${data.keptWithBase64}\nWithout images: ${data.keptWithoutBase64}`);
        sessionStorage.removeItem(scrollPositionKey);
        setResults([]);
        setPage(1);
        fetchResults(false, 1);
        fetchDuplicateCount();
        fetchTotalCount();
      }
    } catch (e: any) {
      alert("Deduplication failed: " + e.message);
    } finally {
      setDeduplicating(false);
    }
  };

  const handleRefresh = () => {
    sessionStorage.removeItem(scrollPositionKey);
    setResults([]);
    setPage(1);
    fetchResults(false, 1);
    fetchDuplicateCount();
  };

  const toggleTask = (scriptId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [scriptId]: prev[scriptId] === false ? true : false }));
  };

  // Toggle selection - 点击 card 选中
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select all visible results
  const selectAllVisible = () => {
    const visibleIds = new Set(filteredAndSortedResults.map(r => r.id));
    if (selectedIds.size === visibleIds.size) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(visibleIds);
    }
  };

  // Filter and group results
  const filteredResults = useMemo(() => {
    let filtered = results;
    // Apply image filter
    if (filterHasImage === "yes") {
      filtered = filtered.filter(hasImage);
    } else if (filterHasImage === "no") {
      filtered = filtered.filter(r => !hasImage(r));
    }
    // Apply regex search
    if (debouncedSearch.trim()) {
      try {
        const regex = new RegExp(debouncedSearch, "i");
        filtered = filtered.filter((r) => {
          const text = `${r.title || ""} ${r.link || ""} ${(r as any).post || ""} ${(r as any).raw || ""}`;
          return regex.test(text);
        });
      } catch {
        // Keep original if invalid regex
      }
    }
    return filtered;
  }, [results, debouncedSearch, filterHasImage, hasImage]);

  // Sort results (默认按 Date 降序)
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults];
    sorted.sort((a: any, b: any) => {
      let valA: any = sortBy === "date" ? (a.date || "1970-01-01") : a.timestamp;
      let valB: any = sortBy === "date" ? (b.date || "1970-01-01") : b.timestamp;
      // Handle null/empty values
      if (!valA) valA = "1970-01-01";
      if (!valB) valB = "1970-01-01";
      const comparison = String(valA).localeCompare(String(valB));
      return sortOrder === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredResults, sortBy, sortOrder]);

  const filteredAndSortedResults = sortedResults;

  const groupedResults = useMemo(() => {
    const groups: Record<string, CrawlerResult[]> = {};
    for (const result of filteredAndSortedResults) {
      if (!groups[result.scriptId]) groups[result.scriptId] = [];
      groups[result.scriptId].push(result);
    }
    return groups;
  }, [filteredAndSortedResults]);

  // Render helpers
  const renderImage = (result: CrawlerResult & { image_src?: string; image_base64?: string; raw?: any }, onClick?: (e?: React.MouseEvent) => void) => {
    // 优先使用 image_src
    if (result.image_src) {
      const imgSrc = `/api/image/${result.scriptId}/${result.image_src}`;
      return (
        <div className="mb-4 rounded-xl overflow-hidden bg-zinc-800 aspect-video cursor-pointer" onClick={onClick}>
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      );
    }

    // 回退到 base64
    try {
      const raw = typeof result.raw === "string" ? JSON.parse(result.raw || "{}") : result.raw;
      let imgSrc: string | null = null;
      const checkBase64 = (val: any) => typeof val === "string" && val.startsWith("data:image");

      if (checkBase64((result as any).image_base64)) imgSrc = (result as any).image_base64;
      else if (checkBase64(raw.image_base64)) imgSrc = raw.image_base64;
      else if (Array.isArray(raw.images_base64)) {
        imgSrc = raw.images_base64.find(checkBase64) || null;
      }
      if (!imgSrc && checkBase64((result as any).image)) imgSrc = (result as any).image;

      if (imgSrc) {
        return (
          <div className="mb-4 rounded-xl overflow-hidden bg-zinc-800 aspect-video cursor-pointer" onClick={onClick}>
            <img
              src={imgSrc}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </div>
        );
      }
    } catch (e) {
      console.error("Error parsing image:", e);
    }
    return null;
  };

  const renderMagnets = (magnets: string | null | undefined) => {
    if (!magnets) return null;
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-xs font-mono text-emerald-500">
          <span className="truncate flex-1">{magnets}</span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(magnets);
              alert("Magnet link copied!");
            }}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  // Card - click card to select, click image to view details
  const ResultCard = ({ result, scriptId }: { result: CrawlerResult & { image_src?: string; post?: string; date?: string }; scriptId: string }) => {
    const isSelected = selectedIds.has(result.id);
    return (
      <div
        className={cn(
          "bg-zinc-900 border rounded-2xl overflow-hidden transition-all cursor-pointer",
          isSelected ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-zinc-800 hover:border-zinc-700"
        )}
        onClick={() => toggleSelection(result.id)}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">
                {scriptId.slice(0, 8)}
              </span>
              {isSelected && (
                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-500 bg-blue-500/10 px-2 py-1 rounded">
                  Selected
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteResult(result.id);
              }}
              className="text-zinc-500 hover:text-red-400"
              title="Delete"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {renderImage(result, (e) => {
            e?.stopPropagation?.();
            setSelectedResult(result);
          })}

          <h4 className="text-lg font-bold text-white mb-2 line-clamp-2">{result.title}</h4>

          <div className="flex flex-wrap gap-2 mt-2">
            {(result as any).sid && (
              <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                <span className="text-zinc-500 mr-1">ID:</span>{(result as any).sid}
              </span>
            )}
            {(result as any).actress && (
              <span className="text-xs text-pink-400 bg-pink-500/10 px-2 py-1 rounded border border-pink-500/20">
                <span className="text-zinc-500 mr-1">Actress:</span>{(result as any).actress}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mb-4 line-clamp-3">{result.post}</p>
          {renderMagnets((result as any).magnets)}

          <div className="flex items-center justify-between text-xs text-zinc-500 mt-4 pt-3 border-t border-zinc-800">
            <span className="text-zinc-400">Date: {(result as any).date || new Date(result.timestamp).toLocaleDateString()}</span>
            {result.link && (
              <a
                href={result.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500 hover:underline flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                Source
              </a>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="space-y-6 overflow-y-auto">
      {/* Scroll Progress Indicator */}
      {results.length > 0 && (
        <div className="fixed top-16 right-4 z-50 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl px-4 py-2 shadow-lg">
          <div className="text-xs text-zinc-400">
            <span className="text-emerald-400 font-bold">{filteredAndSortedResults.length}</span>
            <span className="mx-1">/</span>
            <span>{totalResults || "∞"}</span>
            <span className="ml-2 text-zinc-500">results</span>
          </div>
          <div className="w-32 h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: totalResults > 0 ? `${(filteredAndSortedResults.length / totalResults) * 100}%` : "100%" }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-2xl font-bold text-white">Database Preview</h3>
          <p className="text-zinc-500">
            View and manage crawl results in database.
            {totalResults > 0 && (
              <span className="ml-2 text-emerald-500 inline-flex items-center gap-1">
                Total {filteredAndSortedResults.length} / {totalResults} records
              </span>
            )}
            {selectedIds.size > 0 && (
              <span className="ml-2 text-blue-500 inline-flex items-center gap-1">
                {selectedIds.size} selected
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
          {duplicateCount > 0 ? (
            <button
              onClick={deduplicate}
              disabled={deduplicating}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                deduplicating
                  ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                  : "bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500/20"
              )}
            >
              {deduplicating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Deduplicate ({duplicateCount})</span>
                </>
              )}
            </button>
          ) : (
            <button
              disabled
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-zinc-800 text-zinc-600 cursor-not-allowed"
            >
              <Database className="w-4 h-4" />
              <span>No Duplicates</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700 flex items-center gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>

          <button
            onClick={() => setGroupBySource(!groupBySource)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
              groupBySource
                ? "bg-emerald-500/10 border border-emerald-500/50 text-emerald-400"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700"
            )}
          >
            {groupBySource ? "Grouped" : "Ungrouped"}
          </button>

          {/* Image filter */}
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setFilterHasImage("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                filterHasImage === "all" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              全部
            </button>
            <button
              onClick={() => setFilterHasImage("yes")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                filterHasImage === "yes" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              有图片
            </button>
            <button
              onClick={() => setFilterHasImage("no")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                filterHasImage === "no" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              无图片
            </button>
          </div>

          {/* Sort options */}
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => {
                setSortBy("date");
                setSortOrder(sortOrder === "desc" ? "asc" : "desc");
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                sortBy === "date" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Date {sortOrder === "desc" ? "↓" : "↑"}
            </button>
            <button
              onClick={() => {
                setSortBy("timestamp");
                setSortOrder(sortOrder === "desc" ? "asc" : "desc");
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                sortBy === "timestamp" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Time {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>

          {/* View mode */}
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setViewMode("card")}
              className={cn("px-4 py-2 rounded-lg text-sm font-medium", viewMode === "card" ? "bg-zinc-800 text-white" : "text-zinc-500")}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode("json")}
              className={cn("px-4 py-2 rounded-lg text-sm font-medium", viewMode === "json" ? "bg-zinc-800 text-white" : "text-zinc-500")}
            >
              JSON
            </button>
          </div>

          {/* Delete selected */}
          <button
            onClick={deleteSelected}
            disabled={deleting || selectedIds.size === 0}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2",
              deleting || selectedIds.size === 0
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500/20"
            )}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Selected ({selectedIds.size})</span>
          </button>

          {/* Select all */}
          <button
            onClick={selectAllVisible}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700"
          >
            {selectedIds.size === filteredAndSortedResults.length ? "Deselect All" : "Select All"}
          </button>
        </div>
      </div>

      {viewMode === "card" ? (
        <div className="space-y-8">
          {loading && results.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">Loading...</div>
          ) : (
            <>
              {groupBySource ? (
                Object.entries(groupedResults)
                  .filter(([, taskResults]) => taskResults.length > 0)
                  .map(([scriptId, taskResults]) => (
                    <div key={scriptId} className="space-y-4">
                      <div
                        onClick={() => toggleTask(scriptId)}
                        className="flex items-center justify-between cursor-pointer hover:bg-zinc-900/50 p-3 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm uppercase tracking-widest font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                            Task: {scriptId.slice(0, 8)}
                          </span>
                          <span className="text-zinc-400 text-sm">{taskResults.length} results</span>
                        </div>
                        <span className="text-zinc-500">{expandedTasks[scriptId] !== false ? "▼" : "▶"}</span>
                      </div>
                      {expandedTasks[scriptId] !== false && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pl-4 border-l-2 border-zinc-800/50">
                          {taskResults.map((result) => (
                            <ResultCard key={result.id} result={result} scriptId={scriptId} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
              ) : (
                <>
                  {filteredAndSortedResults.length === 0 && results.length > 0 && (
                    <div className="text-center py-12 text-zinc-500">No results match the search.</div>
                  )}
                  {filteredAndSortedResults.length === 0 && results.length === 0 && !loading && (
                    <div className="text-center py-12 text-zinc-500">No records in database.</div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAndSortedResults.map((result) => (
                      <ResultCard key={result.id} result={result} scriptId={result.scriptId} />
                    ))}
                  </div>
                </>
              )}

              <div id="load-more-trigger" className="py-8 text-center">
                {loading && <span className="text-zinc-500">Loading more...</span>}
                {!hasMore && results.length > 0 && <span className="text-zinc-600">No more records</span>}
                {!hasMore && results.length === 0 && <span className="text-zinc-600">No records</span>}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 overflow-x-auto">
          <pre className="text-xs text-emerald-500 font-mono">{JSON.stringify(filteredAndSortedResults, null, 2)}</pre>
        </div>
      )}

      {/* Modal for detailed view */}
      {selectedResult && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setSelectedResult(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Result Details</h3>
              <button onClick={() => setSelectedResult(null)} className="text-zinc-500 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {renderImage(selectedResult)}
              <div>
                <h4 className="text-lg font-bold text-white mb-2">{selectedResult.title}</h4>
                <p className="text-sm text-zinc-400">{(selectedResult as any).post}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500">ID:</span>
                  <span className="ml-2 text-zinc-300 font-mono break-all">{selectedResult.id}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Script:</span>
                  <span className="ml-2 text-zinc-300 font-mono">{selectedResult.scriptId}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Date:</span>
                  <span className="ml-2 text-zinc-300">{(selectedResult as any).date || "N/A"}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Timestamp:</span>
                  <span className="ml-2 text-zinc-300">{new Date(selectedResult.timestamp).toLocaleString()}</span>
                </div>
              </div>
              {(selectedResult as any).link && (
                <div>
                  <span className="text-zinc-500 text-xs">Link:</span>
                  <a
                    href={(selectedResult as any).link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-1 text-emerald-500 hover:underline text-sm break-all"
                  >
                    {(selectedResult as any).link}
                  </a>
                </div>
              )}
              {renderMagnets((selectedResult as any).magnets)}
              <details className="bg-zinc-950 rounded-xl p-4">
                <summary className="text-sm font-bold text-zinc-300 cursor-pointer">Raw Data</summary>
                <pre className="text-xs text-emerald-500 font-mono mt-2 overflow-x-auto">
                  {JSON.stringify(selectedResult, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
