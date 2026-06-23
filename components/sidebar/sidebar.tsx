"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  ShoppingBag,
  GitBranch,
  PackageSearch,
  Truck,
  FileBarChart,
  Users2,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  Tag,
  Code2,
  Ruler,
} from "lucide-react";
const TOOLS = [
  {
    name: "Shopify Processor",
    href: "/shopify-processor",
    icon: ShoppingBag,
    active: true,
  },
  {
    name: "Association Rules",
    href: "/association-rules",
    icon: GitBranch,
    active: true,
  },
  {
    name: "Stock Analyzer",
    href: "/stock-analyzer",
    icon: PackageSearch,
    active: true,
  },
  {
    name: "Stock Update Analyzer",
    href: "/stock-update-analyzer",
    icon: Activity,
    active: true,
  },
  {
    name: "MDM Analyzer",
    href: "/mdm-analyzer",
    icon: Database,
    active: true,
  },
  {
    name: "RFM Analysis",
    href: "/rfm-analysis",
    icon: Users2,
    active: true,
  },
  {
    name: "PO Tracker",
    href: "/po-tracker",
    icon: Truck,
    active: true,
  },
  {
    name: "Ventee Unique",
    href: "/ventee-unique",
    icon: Tag,
    active: true,
  },
  {
    name: "HTML Cleaner",
    href: "/html-cleaner",
    icon: Code2,
    active: true,
  },
  {
    name: "Omtrek Calculator",
    href: "/omtrek-calculator",
    icon: Ruler,
    active: true,
  },
  {
    name: "Report Builder",
    href: "/report-builder",
    icon: FileBarChart,
    active: false,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen border-r border-edge bg-surface transition-all duration-200 ease-in-out shrink-0",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      {/* Brand */}
      <div className="flex items-center h-14 px-3 border-b border-edge gap-2">
        <div className="w-7 h-7 rounded bg-accent flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xs font-mono">BB</span>
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-primary truncate tracking-tight">
            BazarBizar Ops
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {TOOLS.map((tool) => {
          const isActive = pathname === tool.href;
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] transition-colors duration-150 group",
                isActive
                  ? "bg-accent/10 text-accent font-medium"
                  : tool.active
                    ? "text-muted hover:text-primary hover:bg-surface-hover"
                    : "text-muted/40 hover:text-muted/60 cursor-default"
              )}
            >
              <Icon
                size={16}
                className={cn(
                  "shrink-0 transition-colors duration-150",
                  isActive ? "text-accent" : "text-muted/70 group-hover:text-primary"
                )}
              />
              {!collapsed && (
                <span className="truncate flex-1">{tool.name}</span>
              )}
              {!collapsed && !tool.active && (
                <span className="text-[10px] text-muted/40 font-mono ml-auto">soon</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-edge p-2">
        <button
          onClick={toggle}
          className="flex items-center justify-center w-full h-8 rounded-md text-muted hover:text-primary hover:bg-surface-hover transition-colors duration-150"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </aside>
  );
}
