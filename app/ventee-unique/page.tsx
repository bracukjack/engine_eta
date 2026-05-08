"use client";

import { Suspense, useTransition, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tag } from "lucide-react";
import { lazy } from "react";

const CampaignOffersTab = lazy(
  () => import("./_components/CampaignOffersTab")
);

const TABS = [
  { id: "campaign-offers", label: "Campaign Offers", icon: Tag },
  // Future tabs go here
] as const;

type TabId = (typeof TABS)[number]["id"];

function VenteeUniqueInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const activeTab = (searchParams.get("tab") ?? "campaign-offers") as TabId;

  const setTab = useCallback(
    (tab: TabId) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", tab);
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">
      {/* Page header */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3">
        <h1 className="text-sm font-semibold text-primary">Ventee Unique</h1>
        <p className="text-[11px] text-muted font-mono mt-0.5">
          Marketing tools for unique campaign management
        </p>
      </div>

      {/* Feature tabs */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 flex items-end gap-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium -mb-px transition-colors cursor-pointer",
              activeTab === id
                ? "text-accent border-b-2 border-accent"
                : "text-muted hover:text-primary border-b-2 border-transparent"
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className={cn(
          "flex-1 flex flex-col min-h-0 transition-opacity duration-300",
          isPending ? "opacity-50" : "opacity-100 animate-in fade-in slide-in-from-bottom-2 duration-500"
        )}
      >
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="text-[11px] text-muted font-mono animate-pulse">Loading…</div>
            </div>
          }
        >
          {activeTab === "campaign-offers" && <CampaignOffersTab />}
        </Suspense>
      </div>
    </div>
  );
}

export default function VenteeUniquePage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <VenteeUniqueInner />
    </Suspense>
  );
}
