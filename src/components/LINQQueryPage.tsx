import React, { useState, useCallback, useEffect } from "react";
import { Database, Play, Trash2, Edit2, Save, X, Check, Download, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../lib/utils";
import { CrawlerResult } from "../types";

interface LINQQueryPageProps {
  user: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export function LINQQueryPage({ user, apiFetch }: LINQQueryPageProps) {
  const [linqQuery, setLinqQuery] = useState("");
  const [linqResults, setLinqResults] = useState<CrawlerResult[]>([]);
  const [linqError, setLinqError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editField, setEditField] = useState<string>("");
  const [editValue, setEditValue] = useState<string>("");
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // 执行 LINQ 查询
  const executeLinqQuery = useCallback(async () => {
    setLinqError(null);
    setLoading(true);
    try {
      const query = linqQuery.trim();
      if (!query) {
        setLinqError("请输入查询语句");
        setLoading(false);
        return;
      }

      // 先获取所有数据
      const res = await apiFetch(`/api/results?ownerId=admin&limit=10000`);
      if (!res.ok) throw new Error("Failed to fetch data");
      const allResults: CrawlerResult[] = await res.json();

      if (allResults.length === 0) {
        setLinqError("当前没有数据可供查询");
        setLoading(false);
        return;
      }

      let queryResults = [...allResults];
      const parts = query.split('|').map(p => p.trim()).filter(p => p);

      for (const part of parts) {
        const trimmed = part.trim();

        // Where 条件查询
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
        }
        // OrderBy 排序
        else if (trimmed.startsWith('OrderBy ') || trimmed.startsWith('orderby ')) {
          const field = trimmed.slice(8).trim();
          queryResults.sort((a, b) => {
            const aVal = (a as any)[field] || '';
            const bVal = (b as any)[field] || '';
            return String(aVal).localeCompare(String(bVal));
          });
        }
        // OrderByDesc 降序排序
        else if (trimmed.startsWith('OrderByDesc ') || trimmed.startsWith('orderbydesc ')) {
          const field = trimmed.slice(12).trim();
          queryResults.sort((a, b) => {
            const aVal = (a as any)[field] || '';
            const bVal = (b as any)[field] || '';
            return String(bVal).localeCompare(String(aVal));
          });
        }
        // Take 限制数量
        else if (trimmed.startsWith('Take ') || trimmed.startsWith('take ')) {
          const count = parseInt(trimmed.slice(5).trim()) || 10;
          queryResults = queryResults.slice(0, count);
        }
        // Count 计数
        else if (trimmed === 'Count' || trimmed === 'count' || trimmed === 'Count()') {
          setTotalCount(queryResults.length);
          setLinqResults([]);
          setLoading(false);
          return;
        }
      }

      setLinqResults(queryResults);
      setTotalCount(queryResults.length);
      setSelectedIds(new Set());
    } catch (e: any) {
      setLinqError(`查询错误：${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [linqQuery, apiFetch]);

  // 清除查询
  const clearQuery = () => {
    setLinqQuery("");
    setLinqResults([]);
    setLinqError(null);
    setSelectedIds(new Set());
    setTotalCount(0);
  };

  // 切换选择
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

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === linqResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(linqResults.map(r => r.id)));
    }
  };

  // 批量删除
  const bulkDelete = async () => {
    if (selectedIds.size === 0) {
      alert("请先选择要删除的项");
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条记录？`)) return;

    try {
      const deletePromises = Array.from(selectedIds).map(id =>
        apiFetch(`/api/results/${id}`, { method: "DELETE" })
      );
      await Promise.all(deletePromises);
      alert("删除成功");
      setSelectedIds(new Set());
      executeLinqQuery();
    } catch (e: any) {
      alert("删除失败：" + e.message);
    }
  };

  // 批量更新字段
  const bulkUpdate = async () => {
    if (selectedIds.size === 0) {
      alert("请先选择要更新的项");
      return;
    }
    if (!editField || !editValue) {
      alert("请选择字段并输入值");
      return;
    }
    if (!confirm(`确定将选中的 ${selectedIds.size} 条记录的 ${editField} 字段更新为 "${editValue}"？`)) return;

    try {
      for (const id of selectedIds) {
        const res = await apiFetch(`/api/results/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [editField]: editValue })
        });
        if (!res.ok) throw new Error(`Failed to update ${id}`);
      }
      alert("更新成功");
      setShowBulkEdit(false);
      setEditField("");
      setEditValue("");
      setSelectedIds(new Set());
      executeLinqQuery();
    } catch (e: any) {
      alert("更新失败：" + e.message);
    }
  };

  // 导出选中数据
  const exportSelected = () => {
    if (selectedIds.size === 0) {
      alert("请先选择要导出的项");
      return;
    }
    const dataToExport = linqResults.filter(r => selectedIds.has(r.id));
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `linq_export_${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    alert(`已导出 ${dataToExport.length} 条记录`);
  };

  // 示例查询
  const examples = [
    "Where title~=magnet - 筛选标题包含 magnet 的记录",
    "Where title=test | OrderBy date | Take 50 - 筛选并排序取前 50 条",
    "OrderByDesc timestamp | Take 100 - 按时间降序取前 100 条",
    "Count - 显示总数",
    "Where magnets~=magnet: | Count - 统计有磁力链的记录数"
  ];

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h3 className="text-2xl font-bold text-white">LINQ 查询 - 数据库</h3>
        <p className="text-zinc-500">对数据库进行 LINQ 风格查询并批量编辑结果</p>
      </div>

      {/* 查询输入 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">查询语句</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={linqQuery}
              onChange={(e) => setLinqQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeLinqQuery()}
              placeholder="Where title=magnet | OrderBy date | Take 50"
              className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              onClick={executeLinqQuery}
              disabled={loading}
              className="px-6 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              {loading ? "查询中..." : "执行"}
            </button>
            <button
              onClick={clearQuery}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-sm hover:bg-zinc-700 flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              清除
            </button>
          </div>
        </div>

        {/* 示例 */}
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2">示例查询:</p>
          <div className="flex flex-wrap gap-2">
            {examples.map((example, index) => (
              <button
                key={index}
                onClick={() => setLinqQuery(example.split(' - ')[0])}
                className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 font-mono"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* 错误提示 */}
        {linqError && (
          <div className="bg-blue-500/10 border border-blue-500/50 p-4 rounded-xl text-sm text-blue-400">
            {linqError}
          </div>
        )}
      </div>

      {/* 结果统计 */}
      {totalCount > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              查询结果：<span className="text-emerald-400 font-bold">{totalCount}</span> 条
            </p>
            {selectedIds.size > 0 && (
              <p className="text-sm text-zinc-400">
                已选择：<span className="text-blue-400 font-bold">{selectedIds.size}</span> 条
              </p>
            )}
          </div>
        </div>
      )}

      {/* 批量操作按钮 */}
      {selectedIds.size > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-wrap gap-2">
          <button
            onClick={toggleSelectAll}
            className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            {selectedIds.size === linqResults.length ? (
              <>取消全选</>
            ) : (
              <>全选</>
            )}
          </button>
          <button
            onClick={bulkDelete}
            className="px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-sm hover:bg-red-500/20 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            批量删除
          </button>
          <button
            onClick={() => setShowBulkEdit(!showBulkEdit)}
            className="px-4 py-2 bg-blue-500/10 text-blue-400 rounded-xl text-sm hover:bg-blue-500/20 flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            批量编辑
          </button>
          <button
            onClick={exportSelected}
            className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm hover:bg-emerald-500/20 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出选中
          </button>
        </div>
      )}

      {/* 批量编辑面板 */}
      {showBulkEdit && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-bold text-white">批量编辑</h4>
            <button
              onClick={() => setShowBulkEdit(false)}
              className="text-zinc-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={editField}
              onChange={(e) => setEditField(e.target.value)}
              className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">选择字段</option>
              <option value="title">title</option>
              <option value="link">link</option>
              <option value="content">content</option>
              <option value="magnets">magnets</option>
              <option value="scriptId">scriptId</option>
              <option value="ownerId">ownerId</option>
            </select>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="输入新值"
              className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={bulkUpdate}
              className="px-6 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              应用
            </button>
          </div>
        </div>
      )}

      {/* 结果表格 */}
      {linqResults.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-950 border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === linqResults.length && linqResults.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Link</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {linqResults.map((result) => (
                  <tr key={result.id} className="hover:bg-zinc-800/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(result.id)}
                        onChange={() => toggleSelection(result.id)}
                        className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400 font-mono">
                      {String(result.id).slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white max-w-xs truncate">
                      {result.title}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400 max-w-xs truncate font-mono">
                      {result.link || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(result.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {totalCount === 0 && !loading && !linqError && (
        <div className="text-center py-12 text-zinc-500">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>输入查询语句并点击执行来查询数据</p>
        </div>
      )}
    </div>
  );
}
