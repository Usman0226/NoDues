import React from 'react';
import ErrorRow from './ErrorRow';
import { CheckCircle, AlertCircle } from 'lucide-react';

const PreviewTable = ({ validRows = [], errorRows = [], columns = [] }) => {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-status-approved/10 text-status-approved text-sm font-semibold">
          <CheckCircle size={16} /> {validRows.length} Valid
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-status-rejected/10 text-status-rejected text-sm font-semibold">
          <AlertCircle size={16} /> {errorRows.length} Errors
        </div>
      </div>

      {/* Valid Rows */}
      {validRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-muted shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-status-approved/5 border-b border-muted">
            <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-status-approved">Valid Entries</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-offwhite/50">
                  {columns.map((col) => (
                    <th key={col} className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground border-b border-muted">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validRows.map((row, i) => (
                  <tr key={i} className="border-b border-muted/30">
                    {columns.map((col) => (
                      <td key={col} className="px-5 py-2.5 text-foreground">{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error Rows */}
      {errorRows.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-status-rejected px-1">Errors</h4>
          {errorRows.map((row, i) => (
            <ErrorRow key={i} row={row} columns={columns} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PreviewTable;
