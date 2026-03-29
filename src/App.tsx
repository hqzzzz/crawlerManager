import React, { useState } from "react";
import { Rss, Code, LogOut, Terminal, FileText, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "./lib/utils";

// Components
import { Login } from "./components/Login";
import { ScriptsView } from "./components/ScriptsView";
import { ResultsView } from "./components/ResultsView";
import { RSSView } from "./components/RSSView";
import { RSSFeedTest } from "./components/RSSFeedTest";
import { ImportModal } from "./components/ImportModal";

const SIDEBAR_WIDTH_OPEN = 240;

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [hasCheckedImport, setHasCheckedImport] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("token");
  };

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      handleLogout();
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

  // 切换页面时自动关闭侧边栏
  const handleTabChange = (tab: "scripts" | "results" | "rss") => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
    if (tab === "rss") {
      setRssSubTab("keys");
    }
  };

  if (!token) {
    return (
      <Login onLogin={(t) => {
        setToken(t);
        localStorage.setItem("token", t);
      }} />
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

      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-800 z-50 flex items-center justify-between px-4">
        {/* Left: Logo and Brand */}
        <div className="flex items-center gap-4">
          <motion.button
            initial={false}
            animate={{ x: isSidebarOpen ? -(8) : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 z-50 hover:bg-emerald-400 transition-colors"
          >
            <Terminal className="w-6 h-6 text-zinc-950" />
          </motion.button>
          <h1 className="text-xl font-bold text-white">Crawler Manager</h1>
        </div>

        {/* Right: User Info */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500 hidden md:block">{user.email}</span>
          <img src={user.photoURL || ""} alt="" className="w-10 h-10 rounded-full border border-zinc-700" />
        </div>
      </header>

      {/* Sidebar - 从顶部向左横向展开 */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -(SIDEBAR_WIDTH_OPEN + 16), opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -(SIDEBAR_WIDTH_OPEN + 16), opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-16 left-4 w-[240px] bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col py-4 z-40 shadow-2xl"
          >
            {/* Navigation Items */}
            <nav className="flex-1 flex flex-col gap-1 px-3">
              <NavButton
                active={activeTab === "scripts"}
                onClick={() => handleTabChange("scripts")}
                icon={<Code className="w-5 h-5" />}
                label="Scripts"
              />
              <NavButton
                active={activeTab === "results"}
                onClick={() => handleTabChange("results")}
                icon={<FileText className="w-5 h-5" />}
                label="Results"
              />
              <NavButton
                active={activeTab === "rss"}
                onClick={() => handleTabChange("rss")}
                icon={<Rss className="w-5 h-5" />}
                label="RSS"
              />
            </nav>

            {/* Footer / Logout */}
            <div className="px-3 pt-3 mt-3 border-t border-zinc-800">
              <button
                onClick={handleLogout}
                className="w-full h-10 rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-red-400"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="absolute -right-8 top-1/2 -translate-y-1/2 w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center hover:bg-zinc-700 transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <motion.div
        initial={false}
        animate={{
          paddingTop: 64,
          paddingLeft: isSidebarOpen ? SIDEBAR_WIDTH_OPEN + 20 : 0
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="min-h-screen"
      >
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
      </motion.div>
    </div>
  );
}

// NavButton 组件
function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full h-11 rounded-xl flex items-center gap-3 px-3 transition-all",
        active
          ? "bg-emerald-500/15 text-emerald-500"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
      )}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
