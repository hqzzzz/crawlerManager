import React, { useState } from "react";
import { FileResultsView } from "./FileResultsView";
import { DatabaseResultsView } from "./DatabaseResultsView";
import { LINQQueryPage } from "./LINQQueryPage";
import { cn } from "../lib/utils";

export function ResultsView({ user, apiFetch }: { user: any; apiFetch: (url: string, options?: RequestInit) => Promise<Response>; }) {
  const [mode, setMode] = useState<"files" | "database" | "linq">("files");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 bg-zinc-900 p-3 rounded-2xl border border-zinc-800">
        <button onClick={() => setMode("files")} className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-all",
          mode === "files" ? "bg-emerald-500/20 text-emerald-500 shadow-lg" : "text-zinc-400 hover:text-white"
        )}>
          文件阅览
        </button>
        <button onClick={() => setMode("database")} className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-all",
          mode === "database" ? "bg-emerald-500/20 text-emerald-500 shadow-lg" : "text-zinc-400 hover:text-white"
        )}>
          数据库预览
        </button>
        <button onClick={() => setMode("linq")} className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-all",
          mode === "linq" ? "bg-blue-500/20 text-blue-500 shadow-lg" : "text-zinc-400 hover:text-white"
        )}>
          LINQ 查询
        </button>
      </div>

      {mode === "files" ? (
        <FileResultsView user={user} apiFetch={apiFetch} />
      ) : mode === "database" ? (
        <DatabaseResultsView user={user} apiFetch={apiFetch} />
      ) : (
        <LINQQueryPage user={user} apiFetch={apiFetch} />
      )}
    </div>
  );
}
