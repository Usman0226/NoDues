import React from 'react';
import { AlertTriangle } from 'lucide-react';

const ErrorRow = ({ row, columns = [] }) => {
  return (
    <div className="bg-status-rejected/5 border border-status-rejected/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-status-rejected mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-4 mb-2">
            {columns.map((col) => (
              <div key={col}>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{col}: </span>
                <span className={`text-sm ${row.errorFields?.includes(col) ? 'text-status-rejected font-semibold' : 'text-foreground'}`}>
                  {row[col] || '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(row.errors || []).map((err, i) => (
              <span key={i} className="text-[11px] bg-status-rejected/10 text-status-rejected px-2.5 py-1 rounded-full font-medium">
                {err}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorRow;
