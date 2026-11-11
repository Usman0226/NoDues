import React from 'react';

export const WizardPageSkeleton = () => (
  <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:px-8 space-y-4 animate-pulse" aria-label="Loading Setup Wizard">
    {/* Header & Stepper Skeleton */}
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-60 bg-zinc-200 rounded-lg" />
          <div className="h-3.5 w-44 bg-zinc-100 rounded-md" />
        </div>
        <div className="h-9 w-40 bg-zinc-200 rounded-full" />
      </div>
      <div className="h-1 w-full bg-zinc-200 rounded-full" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-9 bg-zinc-200/80 rounded-xl" />
        ))}
      </div>
    </div>

    {/* Single Workspace Panel Skeleton */}
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-5 min-h-[420px]">
      <div className="h-5 w-52 bg-zinc-200 rounded" />
      <div className="h-3.5 w-80 bg-zinc-100 rounded" />
      <div className="h-48 bg-zinc-100/80 rounded-2xl border-2 border-dashed border-zinc-200" />
      <div className="flex justify-end pt-3 border-t border-zinc-100">
        <div className="h-10 w-44 bg-zinc-200 rounded-full" />
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
