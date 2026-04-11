import React from 'react';
import Badge from '../ui/Badge';

const STATUS_BG = {
  approved: 'bg-status-approved',
  rejected: 'bg-status-rejected',
  pending: 'bg-status-pending',
  due: 'bg-status-due',
  override: 'bg-status-override',
};

const BatchStatusGrid = ({ students = [], subjects = [], statusMap = {}, onCellClick }) => {
  return (
    <div className="bg-white rounded-xl border border-muted shadow-sm overflow-hidden">
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-navy">
              <th className="sticky left-0 z-30 bg-navy px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-white/80 min-w-[200px]">
                Student
              </th>
              {subjects.map((subj) => (
                <th key={subj.id} className="px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/80 min-w-[120px] whitespace-nowrap">
                  {subj.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={subjects.length + 1} className="py-16 text-center text-muted-foreground text-sm">
                  No batch data available
                </td>
              </tr>
            ) : (
              students.map((student, i) => (
                <tr key={student.id} className={`border-b border-muted/50 ${i % 2 === 0 ? 'bg-white' : 'bg-offwhite/40'}`}>
                  <td className="sticky left-0 z-10 bg-inherit px-5 py-3 font-medium text-navy whitespace-nowrap border-r border-muted/30">
                    <div>
                      <p className="text-sm font-semibold">{student.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{student.rollNo}</p>
                    </div>
                  </td>
                  {subjects.map((subj) => {
                    const status = statusMap[`${student.id}-${subj.id}`] || 'pending';
                    return (
                      <td key={subj.id} className="px-4 py-3 text-center">
                        <button
                          onClick={() => onCellClick?.(student, subj, status)}
                          className="group relative"
                          title={`${student.name} — ${subj.name}: ${status}`}
                        >
                          <span className={`inline-block w-8 h-8 rounded-lg ${STATUS_BG[status]}/20 border border-${STATUS_BG[status]?.replace('bg-', '')}/30 transition-transform group-hover:scale-110`}>
                            <span className={`block w-3 h-3 rounded-full ${STATUS_BG[status]} mx-auto mt-2.5`}></span>
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BatchStatusGrid;
