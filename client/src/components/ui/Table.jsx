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
    <div className="bg-white rounded-2xl border border-muted shadow-sm overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-muted">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy/30 transition-all" />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-offwhite/80 sticky top-0 z-10">
              {columns.map((col) => (
                <th key={col.key} onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`text-left px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground border-b border-muted
                    ${col.sortable !== false ? 'cursor-pointer hover:text-navy select-none' : ''}`}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="py-20"><Spinner size="md" /></td></tr>
            ) : processed.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-16 text-center">
                <Inbox size={32} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No data available</p>
              </td></tr>
            ) : (
              processed.map((row, i) => (
                <tr key={row.id || i} onClick={() => onRowClick?.(row)}
                  className={`border-b border-muted/50 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-navy/[0.02]' : ''}`}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-3.5 text-foreground">
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
