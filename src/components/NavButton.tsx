import React from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isCollapsed?: boolean;
}

export function NavButton({ active, onClick, icon, label, isCollapsed }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full h-10 rounded-xl flex items-center gap-3 px-3 transition-all relative",
        active
          ? "bg-emerald-500/15 text-emerald-500"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800",
        isCollapsed ? "justify-center" : "justify-start"
      )}
      title={label}
    >
      {icon}
      {!isCollapsed && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="whitespace-nowrap text-sm font-medium"
        >
          {label}
        </motion.span>
      )}
      {active && !isCollapsed && (
        <motion.div
          layoutId="activeNav"
          className="absolute left-0 w-1 h-5 bg-emerald-500 rounded-r-full"
        />
      )}
    </button>
  );
}
