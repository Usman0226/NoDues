import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, Inbox } from 'lucide-react';
import Spinner from './Spinner';

const Table = ({ columns, data, loading = false, searchable = false, searchPlaceholder = 'Search...', onRowClick }) => {
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
    if (filter) {
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
  }, [data, filter, sortKey, sortDir, columns]);

  return (
    <div className="surface-panel overflow-hidden fade-up">
      {searchable && (
        <div className="p-4 sm:p-5 border-b border-muted bg-gradient-to-r from-white to-indigo-50/30">
          <div className="relative w-full sm:max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
            <input 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)} 
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all font-semibold" 
            />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 sticky top-0 z-10 border-b border-zinc-200">
              {columns.map((col) => (
                <th key={col.key} onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`text-left px-4 sm:px-6 py-4 sm:py-5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500
                    ${col.sortable !== false ? 'cursor-pointer hover:text-indigo-700 select-none' : ''}`}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr><td colSpan={columns.length} className="py-20"><Spinner size="md" /></td></tr>
            ) : processed.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-20 text-center">
                <Inbox size={32} className="mx-auto text-zinc-300 mb-3" />
                <p className="text-sm text-zinc-500 font-semibold italic">No records found</p>
              </td></tr>
            ) : (
              processed.map((row, i) => (
                <tr 
                  key={row.id || i} 
                  onClick={() => onRowClick?.(row)}
                  className={`
                    transition-colors duration-200 group
                    ${onRowClick ? 'cursor-pointer hover:bg-indigo-50/55' : 'hover:bg-zinc-50/60'}
                    ${i % 2 === 1 ? 'bg-zinc-50/30' : 'bg-white'}
                  `}
                >
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
    </div>
  );
};

export default Table;
