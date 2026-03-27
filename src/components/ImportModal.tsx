import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Database, Upload, X, CheckCircle } from "lucide-react";

interface ImportModalProps {
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onImportComplete: () => void;
}

export function ImportModal({ apiFetch, onClose, onImportComplete }: ImportModalProps) {
  const [checkResult, setCheckResult] = useState<{ needed: boolean; fileCount?: number; files?: string[]; reason?: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number>(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    checkImportNeeded();
  }, []);

  const checkImportNeeded = async () => {
    try {
      const res = await apiFetch("/api/check-import-needed");
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
      }
    } catch (e) {
      console.error("Failed to check import needed:", e);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await apiFetch("/api/import-all-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importData: true }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setImported(data.imported || 0);
        setCompleted(true);
        
        setTimeout(() => {
          onImportComplete();
          onClose();
        }, 2000);
      }
    } catch (e) {
      console.error("Import failed:", e);
      alert("导入失败");
      setImporting(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!checkResult) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-zinc-400">检查中...</p>
        </div>
      </div>
    );
  }

  if (!checkResult.needed) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden"
      >
        {completed ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">导入完成!</h3>
            <p className="text-zinc-400">成功导入 {imported} 条记录</p>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Database className="w-6 h-6 text-emerald-500" />
                <h3 className="text-xl font-bold text-white">导入数据</h3>
              </div>
              <button onClick={handleSkip} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-zinc-400">
                检测到 {checkResult.fileCount} 个 `all_posts` 文件尚未导入数据库。
              </p>
              
              {checkResult.files && checkResult.files.length > 0 && (
                <div className="bg-zinc-950 rounded-xl p-4 max-h-40 overflow-y-auto">
                  <p className="text-xs text-zinc-500 mb-2">发现的文件:</p>
                  {checkResult.files.map((file, index) => (
                    <div key={index} className="text-xs text-zinc-300 font-mono py-1">
                      {file}
                    </div>
                  ))}
                </div>
              )}
              
              <p className="text-sm text-zinc-500">
                导入后，这些记录将出现在"数据库预览"视图中。
              </p>
            </div>
            
            <div className="p-6 border-t border-zinc-800 flex gap-3">
              <button
                onClick={handleSkip}
                disabled={importing}
                className="flex-1 px-4 py-3 bg-zinc-800 text-zinc-300 font-bold rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                跳过
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex-1 px-4 py-3 bg-emerald-500 text-zinc-950 font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    导入
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
