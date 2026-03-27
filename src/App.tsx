import React, { useState } from "react";
import { Rss, Code, LogOut, Terminal, FileText } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";

// Components
import { Login } from "./components/Login";
import { ScriptsView } from "./components/ScriptsView";
import { ResultsView } from "./components/ResultsView";
import { RSSView } from "./components/RSSView";
import { RSSFeedTest } from "./components/RSSFeedTest";
import { NavButton } from "./components/NavButton";
import { ImportModal } from "./components/ImportModal";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user] = useState<any>({
    uid: "admin",
    email: "Admin@9.x.com",
    displayName: "Admin",
    photoURL: "https://api.dicebear.com/9.x/thumbs/svg?seed=Zoie"
  });
  const [activeTab, setActiveTab] = useState<"scripts" | "results" | "rss">("scripts");
  const [rssSubTab, setRssSubTab] = useState<"keys" | "test">("keys");
  const [showImportModal, setShowImportModal] = useState(true);
  const [hasCheckedImport, setHasCheckedImport] = useState(false);

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("token");
  };

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401 || res.status === 403) {
      handleLogout();
      // 不抛出错误，让调用者检查 res.ok
      return res;
    }

    return res;
  };

  const handleImportComplete = () => {
    setShowImportModal(false);
    setHasCheckedImport(true);
  };

  const handleCloseImport = () => {
    setShowImportModal(false);
    setHasCheckedImport(true);
  };

  if (!token) {
    return (
      <Login
        onLogin={(t) => {
          setToken(t);
          localStorage.setItem("token", t);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans">
      {/* Import Modal */}
      {showImportModal && !hasCheckedImport && (
        <ImportModal
          apiFetch={apiFetch}
          onClose={handleCloseImport}
          onImportComplete={handleImportComplete}
        />
      )}

      {/* Sidebar */}
      <nav className="fixed left-0 top-0 bottom-0 w-20 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-8 gap-8 z-50">
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Terminal className="w-6 h-6 text-zinc-950" />
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <NavButton
            active={activeTab === "scripts"}
            onClick={() => setActiveTab("scripts")}
            icon={<Code className="w-6 h-6" />}
            label="Scripts"
          />
          <NavButton
            active={activeTab === "results"}
            onClick={() => setActiveTab("results")}
            icon={<FileText className="w-6 h-6" />}
            label="Results"
          />
          <NavButton
            active={activeTab === "rss"}
            onClick={() => {
              setActiveTab("rss");
              setRssSubTab("keys");
            }}
            icon={<Rss className="w-6 h-6" />}
            label="RSS"
          />
        </div>

        <button
          onClick={handleLogout}
          className="w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-red-400"
          title="Logout"
        >
          <LogOut className="w-6 h-6" />
        </button>
      </nav>

      {/* Main Content */}
      <main className="pl-20 min-h-screen">
        <header className="h-20 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-40">
          <h2 className="text-xl font-semibold text-white capitalize">{activeTab}</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">{user.email}</span>
            <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full border border-zinc-700" />
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === "scripts" && (
              <ScriptsView key="scripts" user={user} apiFetch={apiFetch} />
            )}
            {activeTab === "results" && (
              <ResultsView key="results" user={user} apiFetch={apiFetch} />
            )}
            {activeTab === "rss" && (
              <div key="rss" className="space-y-6">
                {/* RSS Sub-tab Switcher */}
                <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl w-fit">
                  <button
                    onClick={() => setRssSubTab("keys")}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      rssSubTab === "keys"
                        ? "bg-emerald-500 text-zinc-950"
                        : "text-zinc-400 hover:text-white"
                    )}
                  >
                    密钥管理
                  </button>
                  <button
                    onClick={() => setRssSubTab("test")}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      rssSubTab === "test"
                        ? "bg-emerald-500 text-zinc-950"
                        : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Feed 测试
                  </button>
                </div>

                {rssSubTab === "keys" && (
                  <RSSView key="rss-keys" user={user} apiFetch={apiFetch} />
                )}
                {rssSubTab === "test" && (
                  <RSSFeedTest key="rss-test" user={user} apiFetch={apiFetch} />
                )}
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
