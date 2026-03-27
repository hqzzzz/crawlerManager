import React, { useState, useEffect, useRef } from "react";
import { Play, Square, Plus, Trash2, Settings, FileText, Rss, Code, Clock, Save, RefreshCw, X, Zap, Copy } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { Script } from "../types";

interface ScriptsViewProps {
  user: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export function ScriptsView({ user, apiFetch }: ScriptsViewProps) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [editingScript, setEditingScript] = useState<Partial<Script> | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [crawlerFiles, setCrawlerFiles] = useState<string[]>([]);
  const [executionLogs, setExecutionLogs] = useState<{ scriptId: string; scriptName: string; logs: string[]; autoRefresh: boolean; } | null>(null);
  const [runParamsModal, setRunParamsModal] = useState<{ scriptId: string; scriptName: string; params: string; } | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const fetchScripts = async () => {
    try {
      const res = await apiFetch(`/api/scripts?ownerId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setScripts(data);
      }
    } catch (e) {
      console.error("[ScriptsView] fetchScripts error:", e);
    }
  };

  useEffect(() => {
    fetchScripts();
    const interval = setInterval(fetchScripts, 1000);
    return () => clearInterval(interval);
  }, [user]);

  const handleOpenImport = async () => {
    try {
      const res = await apiFetch("/api/crawler-files");
      if (res.ok) {
        const files = await res.json();
        setCrawlerFiles(files);
        setShowImportModal(true);
      }
    } catch (e) {
      alert("Failed to fetch crawler files");
    }
  };

  const handleImportFile = async (filename: string) => {
    try {
      const res = await fetch(`/crawlerXnode/crawler/${filename}`);
      let code = await res.text();
      code = code.replace(/import\s+(\w+)\s+from\s+['"](.+)['"]/g, "const $1 = require('$2')");
      code = code.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"](.+)['"]/g, "const $1 = require('$2')");
      code = code.replace(/import\s+\{\s*(.+)\s*\}\s+from\s+['"](.+)['"]/g, "const { $1 } = require('$2')");
      code = code.replace(/export\s+default\s+(\w+)/g, "module.exports = $1");
      code = code.replace(/export\s+const\s+(\w+)/g, "exports.$1");
      code = code.replace(/(const|let|var)\s+__filename\s*=\s*(__filename|fileURLToPath\(import\.meta\.url\));?/g, "");
      code = code.replace(/(const|let|var)\s+__dirname\s*=\s*path\.dirname\(__filename\);?/g, "");
      code = code.replace(/fileURLToPath\(import\.meta\.url\)/g, "__filename");
      code = code.replace(/import\.meta\.url/g, "('file://' + __filename)");
      if (!code.includes("main()") && !code.includes("main().catch")) {
        code += "\n\n// Auto-added main call\nmain().catch(() => {});";
      }
      let defaultParams = "{}";
      if (filename === "madouqu-crawler.js") {
        defaultParams = JSON.stringify({ page: [2, 10] }, null, 2);
      }
      setEditingScript({ name: filename.replace('.js', ''), code: code, cron: "0 0 * * *", params: defaultParams });
      setShowImportModal(false);
    } catch (e) {
      alert("Failed to import script");
    }
  };

  const saveScript = async () => {
    if (!editingScript?.name || !editingScript?.code) return;
    const data = {
      name: editingScript.name,
      code: editingScript.code,
      cron: editingScript.cron || "",
      params: editingScript.params || "{}",
      id: editingScript.id,
      ownerId: user.uid
    };
    const res = await apiFetch(`/api/scripts?ownerId=${user.uid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      setEditingScript(null);
      fetchScripts();
    } else {
      const result = await res.json();
      alert("Error: " + (result.error || "Failed to save"));
    }
  };

  const deleteScript = async (id: string) => {
    if (!confirm("Are you sure you want to delete this script?")) return;
    const res = await apiFetch(`/api/scripts/${id}?ownerId=${user.uid}`, { method: "DELETE" });
    if (res.ok) fetchScripts();
  };

  const runScriptWithDefaultParams = async (script: Script) => {
    try {
      const scriptId = script.id;
      const scriptName = script.name;
      console.log("[runScriptWithDefaultParams] Starting script with default params:", scriptId, scriptName);
      const res = await apiFetch(`/api/scripts/${scriptId}/run?ownerId=${user.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: script.code, params: JSON.parse(script.params || "{}"), scriptId: scriptId, ownerId: user.uid })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      await fetchScripts();
      setTimeout(() => showLogs(scriptId, scriptName, true), 500);
    } catch (e: any) {
      alert("Error: " + e.message);
      fetchScripts();
    }
  };

  const runScript = async (script: Script) => {
    setRunParamsModal({ scriptId: script.id, scriptName: script.name, params: script.params || "{}" });
  };

  const runScriptWithParams = async (customParams: string) => {
    if (!runParamsModal) return;
    try {
      const scriptId = runParamsModal.scriptId;
      const scriptName = runParamsModal.scriptName;
      let params: any;
      const trimmedParams = customParams.trim();
      if (trimmedParams.startsWith("{")) {
        params = JSON.parse(trimmedParams);
      } else {
        params = parseCommandLineParams(trimmedParams);
      }
      console.log("[runScriptWithParams] Starting script with custom params:", scriptId, scriptName, params);
      const script = scripts.find(s => s.id === scriptId);
      if (!script) {
        throw new Error("Script not found");
      }
      const res = await apiFetch(`/api/scripts/${scriptId}/run?ownerId=${user.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: script.code, params: params, scriptId: scriptId, ownerId: user.uid })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      await fetchScripts();
      setRunParamsModal(null);
      setTimeout(() => showLogs(scriptId, scriptName, true), 500);
    } catch (e: any) {
      if (e instanceof SyntaxError && customParams.trim().startsWith("{")) {
        alert("Invalid JSON format. Please check your input.");
      } else {
        alert("Error: " + e.message);
      }
      fetchScripts();
    }
  };

  const parseCommandLineParams = (input: string): Record<string, any> => {
    const result: Record<string, any> = {};
    const tokens = input.split(/\s+/).filter(t => t.length > 0);
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (!token.startsWith('--') && !token.startsWith('-')) {
        i++;
        continue;
      }
      const key = token.startsWith('--') ? token.slice(2) : token.slice(1);
      if (!key) {
        i++;
        continue;
      }
      const values: string[] = [];
      i++;
      while (i < tokens.length && !tokens[i].startsWith('--') && !tokens[i].startsWith('-')) {
        values.push(tokens[i]);
        i++;
      }
      if (values.length === 0) {
        result[key] = true;
      } else if (values.length === 1) {
        result[key] = convertToNumber(values[0]);
      } else {
        result[key] = values.map(convertToNumber);
      }
    }
    return result;
  };

  const convertToNumber = (str: string): number | string => {
    if (/^-?\d+$/.test(str)) {
      return parseInt(str, 10);
    }
    if (/^-?\d+\.\d+$/.test(str)) {
      return parseFloat(str);
    }
    return str;
  };

  const showLogs = async (scriptId: string, scriptName: string, enableAutoRefresh = false) => {
    try {
      const res = await apiFetch(`/api/logs/file/${scriptId}`);
      if (res.ok) {
        const data = await res.json();
        const allLogs = data.map((l: any) => l.content).filter(Boolean);
        setExecutionLogs({ scriptId, scriptName, logs: allLogs.length > 0 ? allLogs : ['等待脚本执行或脚本未输出日志...'], autoRefresh: enableAutoRefresh });
      }
    } catch (e) {
      console.error("[ScriptsView] showLogs error:", e);
    }
  };

  const toggleAutoRefresh = () => {
    setExecutionLogs(prev => prev ? { ...prev, autoRefresh: !prev.autoRefresh } : null);
  };

  const refreshLogs = () => {
    if (executionLogs?.scriptId && executionLogs?.scriptName) {
      showLogs(executionLogs.scriptId, executionLogs.scriptName);
    }
  };

  useEffect(() => {
    if (!executionLogs?.autoRefresh || !executionLogs.scriptId) return;
    const interval = setInterval(() => {
      const res = apiFetch(`/api/logs/file/${executionLogs.scriptId}`);
      res.then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const allLogs = data.map((l: any) => l.content).filter(Boolean);
          setExecutionLogs(prev => prev ? { ...prev, logs: allLogs } : null);
        }
      }).catch(() => { });
    }, 2000);
    return () => clearInterval(interval);
  }, [executionLogs?.autoRefresh, executionLogs?.scriptId, user.uid]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [executionLogs?.logs]);

  const copyScriptId = async (scriptId: string) => {
    await navigator.clipboard.writeText(scriptId);
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <div className="flex justify-between items-center">
        {/* <div>
          <h3 className="text-2xl font-bold text-white">Scripts Manage</h3>
        </div> */}
        
        {/* 【修改 1】Import Script 和 New Script 按钮靠右，左侧显示脚本数量 */}
        <div className="flex justify-between items-center w-full">
          <div className="text-sm text-zinc-500">
            {scripts.length} script{scripts.length !== 1 ? 's' : ''} loaded
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleOpenImport}
              className="px-6 py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Import Script
            </button>
            <button
              onClick={() => setEditingScript({ name: "", code: "console.log('Hello World');", cron: "", params: "{}" })}
              className="px-6 py-3 bg-emerald-500 text-zinc-950 font-bold rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              New Script
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {scripts.map(script => (
          <div key={script.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-emerald-500">
                  <Code className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">{script.name}</h4>
                  {/* 【修改 2】显示 Script ID，可点击复制 */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-zinc-600 bg-zinc-950 px-2 py-0.5 rounded">
                      ID: {script.id.slice(0, 8)}...{script.id.slice(-4)}
                    </span>
                    <button
                      onClick={() => copyScriptId(script.id)}
                      className="p-0.5 hover:bg-zinc-800 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
                      title="Copy full Script ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm text-zinc-500">{script.cron || "Manual only"}</span>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-base font-bold uppercase",
                      script.status === "idle" ? "bg-zinc-800 text-zinc-400" :
                        script.status === "running" ? "bg-emerald-500/20 text-emerald-500 animate-pulse" :
                          "bg-red-500/20 text-red-500"
                    )}>
                      {script.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingScript(script)}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                  onClick={() => deleteScript(script.id)}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => runScript(script)}
                disabled={script.status === "running"}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Run with custom parameters"
              >
                <Play className="w-4 h-4" />
                Run
              </button>
              <button
                onClick={() => runScriptWithDefaultParams(script)}
                disabled={script.status === "running"}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Quick run with default parameters"
              >
                <Zap className="w-4 h-4" />
                Quick Run
              </button>
              <button
                onClick={() => showLogs(script.id, script.name)}
                className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-colors"
                title="View Logs"
              >
                <FileText className="w-5 h-5" />
              </button>
              <a
                href={`/api/feed/${script.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-orange-400 rounded-xl transition-colors"
                title="RSS Feed"
              >
                <Rss className="w-5 h-5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Run Parameters Modal */}
      <AnimatePresence>
        {runParamsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setRunParamsModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Run Script: {runParamsModal.scriptName}</h3>
                <button
                  onClick={() => setRunParamsModal(null)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    Parameters (JSON Format)
                  </label>
                  <textarea
                    id="runParams"
                    defaultValue={runParamsModal.params}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white font-mono text-sm h-48 focus:outline-none focus:border-emerald-500 resize-none"
                    placeholder='{"key": "value"}'
                  />
                  <p className="text-[10px] text-zinc-600">
                    Enter valid JSON. The script will use these parameters for execution.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => setRunParamsModal(null)}
                  className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const paramsInput = document.getElementById('runParams') as HTMLTextAreaElement;
                    runScriptWithParams(paramsInput.value);
                  }}
                  className="px-8 py-3 bg-emerald-500 text-zinc-950 font-bold rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Run
                </button>
                <button
                  onClick={() => {
                    runScriptWithDefaultParams(scripts.find(s => s.id === runParamsModal.scriptId)!);
                    setRunParamsModal(null);
                  }}
                  className="px-8 py-3 bg-zinc-700 text-white font-bold rounded-xl hover:bg-zinc-600 transition-colors flex items-center gap-2"
                >
                  <Zap className="w-5 h-5" />
                  Quick Run
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor Modal */}
      {editingScript && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{editingScript.id ? "Edit Script" : "New Script"}</h3>
              <button
                onClick={() => setEditingScript(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Name</label>
                  <input
                    value={editingScript.name}
                    onChange={e => setEditingScript({ ...editingScript, name: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. My Crawler"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Cron Schedule (Optional)</label>
                  <input
                    value={editingScript.cron}
                    onChange={e => setEditingScript({ ...editingScript, cron: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. */30 * * * *"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Parameters (JSON)</label>
                <textarea
                  value={editingScript.params}
                  onChange={e => setEditingScript({ ...editingScript, params: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white font-mono text-sm h-24 focus:outline-none focus:border-emerald-500"
                  placeholder='{"key": "value"}'
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">JS Code</label>
                <textarea
                  value={editingScript.code}
                  onChange={e => setEditingScript({ ...editingScript, code: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white font-mono text-sm h-64 focus:outline-none focus:border-emerald-500"
                  placeholder="console.log(params.key);"
                />
                <p className="text-[10px] text-zinc-600">
                  Available globals: console, params, fetch, saveResult({"{ title, content, url, raw }"})
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-4">
              <button
                onClick={() => setEditingScript(null)}
                className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveScript}
                className="px-8 py-3 bg-emerald-500 text-zinc-950 font-bold rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save Script
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6"
            >
              <h3 className="text-xl font-bold text-white mb-4">Import Crawler Script</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {crawlerFiles.map(file => (
                  <button
                    key={file}
                    onClick={() => handleImportFile(file)}
                    className="w-full text-left p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white transition-colors"
                  >
                    {file}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="mt-4 w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Execution Logs Modal */}
      <AnimatePresence>
        {executionLogs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 z-[200]"
            onClick={() => setExecutionLogs(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-3xl flex flex-col max-h-[85vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Execution Logs: {executionLogs.scriptName}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={toggleAutoRefresh}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      executionLogs.autoRefresh ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-800 text-zinc-400 hover:text-white"
                    )}
                    title={executionLogs.autoRefresh ? "Disable Auto-refresh" : "Enable Auto-refresh"}
                  >
                    <RefreshCw className={cn("w-4 h-4", executionLogs.autoRefresh ? "animate-spin" : "")} />
                  </button>
                  <button
                    onClick={() => setExecutionLogs(null)}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div
                ref={logsContainerRef}
                className="flex-1 overflow-y-auto bg-black rounded-xl p-4 font-mono text-sm max-h-[60vh]"
              >
                {executionLogs.logs.length === 0 ? (
                  <p className="text-zinc-500 italic">No logs generated.</p>
                ) : (
                  executionLogs.logs.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        "mb-1 py-0.5",
                        log.includes("[ERROR]") || log.includes("error") ? "text-red-400" :
                          log.includes("[WARN]") || log.includes("warn") ? "text-yellow-400" :
                            log.includes("[INFO]") || log.includes("info") ? "text-blue-400" :
                              "text-emerald-400"
                      )}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
