import React from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

export function NavButton({ active, onClick, icon, label }: NavButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all relative group",
        active ? "bg-emerald-500/10 text-emerald-500" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
      )}
    >
      {icon}
      <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        {label}
      </span>
      {active && <motion.div layoutId="activeNav" className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full" />}
    </button>
  );
}
