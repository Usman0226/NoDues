import React from 'react';

export const WizardPageSkeleton = () => (
  <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:px-8 space-y-3 animate-pulse" aria-label="Loading Setup Wizard">
    {/* Slim Top Bar Skeleton */}
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="h-6 w-52 bg-zinc-200 rounded-lg" />
        <div className="h-8 w-36 bg-zinc-200 rounded-full" />
      </div>
      <div className="h-0.5 w-full bg-zinc-200 rounded-full" />
    </div>

    {/* Unified Studio Shell Skeleton (Left Step Rail + Main Canvas) */}
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-[520px]">
      <div className="lg:w-[252px] xl:w-[268px] shrink-0 bg-zinc-50/60 border-b lg:border-b-0 lg:border-r border-zinc-100 p-4 space-y-2.5">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-11 bg-zinc-200/60 rounded-xl" />
        ))}
      </div>
      <div className="flex-1 p-6 space-y-5">
        <div className="h-5 w-48 bg-zinc-200 rounded" />
        <div className="h-3.5 w-72 bg-zinc-100 rounded" />
        <div className="h-56 bg-zinc-100/70 rounded-2xl border-2 border-dashed border-zinc-200" />
      </div>
    </div>
  </div>
);

export const StepTableSkeleton = ({ rows = 5 }) => (
  <div className="space-y-2.5 animate-pulse p-4" aria-label="Loading table data">
    <div className="h-9 bg-zinc-100 rounded-xl w-full" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-11 bg-white border border-zinc-100 rounded-xl flex items-center justify-between px-4">
        <div className="h-3.5 w-24 bg-zinc-200 rounded" />
        <div className="h-3.5 w-48 bg-zinc-100 rounded" />
        <div className="h-3.5 w-32 bg-zinc-100 rounded" />
        <div className="h-5 w-20 bg-zinc-200 rounded-full" />
      </div>
    ))}
  </div>
);

export const PreflightCardSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 animate-pulse">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="p-4 rounded-xl border border-zinc-200 bg-white space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-zinc-200 rounded" />
          <div className="h-5 w-16 bg-zinc-200 rounded-full" />
        </div>
        <div className="h-3 w-40 bg-zinc-100 rounded" />
      </div>
    ))}
  </div>
);
