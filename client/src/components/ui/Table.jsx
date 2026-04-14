import React, { useState, useMemo, useEffect } from 'react';
import { ChevronUp, ChevronDown, Search, Inbox, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SKELETON_DEFAULT_ROWS = 8;

const TableSkeletonRows = ({ columns, rowCount, selectable }) => (
  <>
    {Array.from({ length: rowCount }).map((_, ri) => (
      <tr key={`sk-${ri}`} className={ri % 2 === 1 ? 'bg-zinc-50/30' : 'bg-white'}>
        {selectable && (
          <td className="px-4 sm:px-6 py-4">
             <div className="w-5 h-5 rounded bg-zinc-200 animate-pulse" />
          </td>
        )}
        {columns.map((col, ci) => (
          <td key={col.key} className="px-4 sm:px-6 py-4 sm:py-5">
            <div
              className={`h-4 rounded-md bg-zinc-200/60 animate-pulse ${ci % 3 === 0 ? 'w-3/4' : ci % 3 === 1 ? 'w-1/2' : 'w-5/6'}`}
              aria-hidden
            />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const Checkbox = ({ checked, indeterminate, onChange, disabled }) => {
  const ref = React.useRef();

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <div className="relative flex items-center h-5">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-5 h-5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed appearance-none border flex items-center justify-center checked:bg-indigo-600 checked:border-indigo-600"
      />
      {checked && !indeterminate && (
        <Check size={12} className="absolute inset-0 m-auto text-white pointer-events-none" />
      )}
      {indeterminate && (
        <div className="absolute inset-0 m-auto w-2.5 h-0.5 bg-white pointer-events-none rounded" />
      )}
    </div>
  );
};

const PaginationNav = ({ pagination, loading, canPrev, canNext, totalPages, compact = false }) => {
  if (!pagination || pagination.total === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${compact ? 'scale-90 origin-right' : ''}`}>
      <button
        onClick={() => pagination.onPageChange?.(pagination.page - 1)}
        disabled={!canPrev || loading}
        className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-30 disabled:hover:bg-white transition-all text-navy"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex items-center gap-1 px-2">
         <span className="text-xs font-black text-navy">{pagination.page}</span>
         <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mx-1">/</span>
         <span className="text-xs font-bold text-zinc-400">{totalPages}</span>
      </div>
      <button
        onClick={() => pagination.onPageChange?.(pagination.page + 1)}
        disabled={!canNext || loading}
        className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-30 disabled:hover:bg-white transition-all text-navy"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

const Table = ({
  columns,
  data,
  loading = false,
  skeletonRows = SKELETON_DEFAULT_ROWS,
  searchable = false,
  searchPlaceholder = 'Search...',
  onRowClick,
  // Selection Props
  selectable = false,
  selection = [],
  onSelectionChange,
  primaryKey = '_id',
  selectionActions = null, 
  bulkActions = [], // New reusable actions array: [{ label, icon, onClick, variant }]
  showCount = true,
  // Pagination Props
  // Pagination Props
  pagination = null, // { total, page, limit, onPageChange, onLimitChange }
  // Controlled Search Props
  searchValue = '',
  onSearchChange = null,
}) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filter, setFilter] = useState('');

  const handleSort = (key) => {
    if (!key) return;
    setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
  };

  const processed = useMemo(() => {
    let rows = [...(data || [])];
    if (filter && !onSearchChange) {
      const q = filter.toLowerCase();
      rows = rows.filter((row) =>
        columns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      rows.sort((a, b) => {
        const va = a[sortKey] ?? '';
        const vb = b[sortKey] ?? '';
        const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, filter, sortKey, sortDir, columns, onSearchChange]);

  // Selection Logic
  const processedIds = useMemo(() => processed.map(r => r[primaryKey]), [processed, primaryKey]);
  const isAllSelected = processedIds.length > 0 && processedIds.every(id => selection.includes(id));
  const isSomeSelected = processedIds.some(id => selection.includes(id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const newSelection = selection.filter(id => !processedIds.includes(id));
      onSelectionChange?.(newSelection);
    } else {
      const newSelection = Array.from(new Set([...selection, ...processedIds]));
      onSelectionChange?.(newSelection);
    }
  };

  const toggleRow = (id, e) => {
    e.stopPropagation();
    if (selection.includes(id)) {
      onSelectionChange?.(selection.filter(i => i !== id));
    } else {
      onSelectionChange?.([...selection, id]);
    }
  };

  // Pagination Logic
  const canPrev = pagination ? (pagination.page > 1) : false;
  const canNext = pagination ? (pagination.page * pagination.limit < pagination.total) : false;
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 0;

  return (
    <div className="surface-panel overflow-hidden fade-up relative flex flex-col">
      {(searchable || showCount) && (
        <div className="p-4 sm:p-5 border-b border-muted bg-gradient-to-r from-white to-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {searchable && (
            <div className="relative w-full sm:max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
              <input
                value={onSearchChange ? searchValue : filter}
                onChange={(e) => onSearchChange ? onSearchChange(e.target.value) : setFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-full border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all font-semibold" 
              />
            </div>
          )}
          
          {showCount && !loading && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-400">
                {(filter || (onSearchChange && searchValue)) ? (
                  <>
                    <span className="text-zinc-600">Showing {processed.length}</span>
                    <span className="opacity-50">of</span>
                    <span>{pagination ? pagination.total : data?.length || 0} Records</span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-600">{pagination ? pagination.total : data?.length || 0} Total Records</span>
                  </>
                )}
              </div>
              {pagination && (
                <>
                  <div className="h-4 w-px bg-zinc-200" />
                  <PaginationNav 
                    pagination={pagination} 
                    loading={loading} 
                    canPrev={canPrev} 
                    canNext={canNext} 
                    totalPages={totalPages} 
                    compact 
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reusable Premium Bulk Action Bar */}
      <AnimatePresence>
        {selectable && selection.length > 0 && (
          <motion.div
            initial={{ y: 100, x: '-50%', opacity: 0 }}
            animate={{ y: 0, x: '-50%', opacity: 1 }}
            exit={{ y: 100, x: '-50%', opacity: 0 }}
            className="fixed bottom-10 left-1/2 z-[100] flex items-center gap-1.5 p-1.5 bg-white/95 backdrop-blur-xl rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-zinc-200 border border-white select-none"
          >
            {/* Selection Info */}
            <div className="flex items-center gap-2.5 px-4 h-10 bg-zinc-50 border border-zinc-100 rounded-full mr-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white shadow-sm ring-2 ring-indigo-100">
                {selection.length}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 whitespace-nowrap">
                Selected
              </span>
            </div>
            
            {/* Actions Area */}
            <div className="flex items-center gap-1">
              {/* Legacy fallback */}
              {selectionActions}

              {/* Standard reusable actions */}
              {bulkActions.map((action, idx) => {
                const ActionIcon = action.icon;
                const isDanger = action.variant === 'danger';
                return (
                  <button
                    key={idx}
                    onClick={() => action.onClick?.()}
                    className={`
                      flex items-center gap-2 px-4 h-10 rounded-full transition-all text-[10px] font-black uppercase tracking-[0.10em] whitespace-nowrap
                      ${isDanger 
                        ? 'text-red-500 hover:bg-red-50' 
                        : 'text-zinc-600 hover:text-indigo-600 hover:bg-zinc-50'}
                    `}
                  >
                    {ActionIcon && <ActionIcon size={14} className={isDanger ? 'text-red-500' : 'text-zinc-400'} />}
                    {action.label}
                  </button>
                );
              })}
            </div>

            {/* Close/Clear Button */}
            <div className="w-[1px] h-6 bg-zinc-200 mx-1" />
            <button
              onClick={() => onSelectionChange?.([])}
              className="p-2.5 hover:bg-zinc-50 rounded-full transition-all text-zinc-400 hover:text-zinc-900 group"
              title="Clear selection"
            >
              <X size={16} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-x-auto" aria-busy={loading}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 sticky top-0 z-10 border-b border-zinc-200">
              {selectable && (
                <th className="w-12 px-4 sm:px-6 py-4">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={isSomeSelected}
                    onChange={toggleSelectAll}
                    disabled={loading || processed.length === 0}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => !loading && col.sortable !== false && handleSort(col.key)}
                  className={`text-left px-4 sm:px-6 py-4 sm:py-5 text-xs sm:text-sm font-semibold text-zinc-600 tracking-tight
                    ${col.sortable !== false && !loading ? 'cursor-pointer hover:text-indigo-700 select-none' : ''}
                    ${loading ? 'cursor-default' : ''}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {!loading && sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <TableSkeletonRows columns={columns} rowCount={skeletonRows} selectable={selectable} />
            ) : processed.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-20 text-center">
                  <Inbox size={32} className="mx-auto text-zinc-300 mb-3" />
                  <p className="text-sm text-zinc-500 font-semibold italic">No records found</p>
                </td>
              </tr>
            ) : (
              processed.map((row, i) => (
                <tr
                  key={row[primaryKey] || i}
                  onClick={() => onRowClick?.(row)}
                  className={`
                    transition-colors duration-200 group
                    ${onRowClick ? 'cursor-pointer hover:bg-indigo-50/55' : 'hover:bg-zinc-50/60'}
                    ${selection.includes(row[primaryKey]) ? 'bg-indigo-50/40' : i % 2 === 1 ? 'bg-zinc-50/30' : 'bg-white'}
                  `}
                >
                  {selectable && (
                    <td className="px-4 sm:px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selection.includes(row[primaryKey])}
                        onChange={(e) => toggleRow(row[primaryKey], e)}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 sm:px-6 py-4 sm:py-5 text-[11px] sm:text-sm text-zinc-700 font-semibold">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && pagination.total > 0 && (
        <div className="p-4 sm:p-5 border-t border-muted bg-zinc-50/30 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-0 z-20 backdrop-blur-sm">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1.5">
               <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">View</span>
               <select 
                 value={pagination.limit}
                 onChange={(e) => pagination.onLimitChange?.(Number(e.target.value))}
                 className="bg-transparent border-none text-xs font-bold text-navy focus:ring-0 cursor-pointer"
               >
                 {[20, 50, 100].map(val => <option key={val} value={val}>{val}</option>)}
               </select>
             </div>
             <div className="h-4 w-px bg-zinc-200" />
             <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
               Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} - {Math.min(pagination.page * pagination.limit, pagination.total)} <span className="mx-1 opacity-40">of</span> {pagination.total}
             </p>
          </div>

          <PaginationNav 
            pagination={pagination} 
            loading={loading} 
            canPrev={canPrev} 
            canNext={canNext} 
            totalPages={totalPages} 
          />
        </div>
      )}
    </div>
  );
};

export default Table;
