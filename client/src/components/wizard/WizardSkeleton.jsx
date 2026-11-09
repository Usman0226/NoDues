import React from 'react';

export const WizardPageSkeleton = () => (
  <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8 animate-pulse" aria-label="Loading Setup Wizard">
    {/* Header Skeleton */}
    <div className="space-y-4">
      <div className="h-4 w-32 bg-zinc-200 rounded-md" />
      <div className="h-8 w-72 bg-zinc-200 rounded-lg" />
      <div className="h-4 w-96 bg-zinc-200 rounded-md" />
      {/* Stepper bar */}
      <div className="pt-4 flex items-center justify-between gap-2">
        <div className="h-2 flex-1 bg-zinc-200 rounded-full" />
        <div className="h-4 w-20 bg-zinc-200 rounded" />
      </div>
    </div>

    {/* Step Cards Skeleton */}
    <div className="space-y-4">
      <div className="h-28 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-3">
        <div className="h-5 w-48 bg-zinc-200 rounded" />
        <div className="h-4 w-3/4 bg-zinc-100 rounded" />
      </div>
      <div className="h-72 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="h-6 w-56 bg-zinc-200 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="h-10 bg-zinc-100 rounded-lg" />
          <div className="h-10 bg-zinc-100 rounded-lg" />
        </div>
        <div className="h-10 bg-zinc-100 rounded-lg" />
        <div className="flex justify-end pt-4">
          <div className="h-10 w-36 bg-zinc-200 rounded-full" />
        </div>
      </div>
      <div className="h-16 bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 flex items-center justify-between">
        <div className="h-4 w-40 bg-zinc-200 rounded" />
        <div className="h-4 w-16 bg-zinc-200 rounded" />
      </div>
    </div>
  </div>
);

export const StepTableSkeleton = ({ rows = 5 }) => (
  <div className="space-y-3 animate-pulse" aria-label="Loading table data">
    <div className="h-10 bg-zinc-100 rounded-lg w-full" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-12 bg-white border border-zinc-100 rounded-lg flex items-center justify-between px-4">
        <div className="h-4 w-24 bg-zinc-200 rounded" />
        <div className="h-4 w-48 bg-zinc-100 rounded" />
        <div className="h-4 w-32 bg-zinc-100 rounded" />
        <div className="h-6 w-20 bg-zinc-200 rounded-full" />
      </div>
    ))}
  </div>
);

export const PreflightCardSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="p-4 rounded-xl border border-zinc-200 bg-white space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-zinc-200 rounded" />
          <div className="h-5 w-5 bg-zinc-200 rounded-full" />
        </div>
        <div className="h-3 w-40 bg-zinc-100 rounded" />
      </div>
    ))}
  </div>
);

