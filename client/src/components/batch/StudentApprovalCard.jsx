import React from 'react';
import Badge from '../ui/Badge';
import { User, FileText, Shield } from 'lucide-react';

const StudentApprovalCard = ({ student = {}, approvals = [] }) => {
  return (
    <div className="bg-white rounded-xl border border-muted shadow-sm p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="h-12 w-12 rounded-full bg-navy/10 flex items-center justify-center">
          <User size={20} className="text-navy" />
        </div>
        <div>
          <h3 className="font-serif text-lg text-navy">{student.name}</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{student.rollNo} · {student.department}</p>
        </div>
      </div>
      <div className="space-y-3">
        {approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No approval records</p>
        ) : (
          approvals.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-offwhite/60 border border-muted/50">
              <div className="flex items-center gap-3">
                <FileText size={14} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-navy">{item.subject}</p>
                  <p className="text-[10px] text-muted-foreground">{item.faculty}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={item.status} />
                {item.status === 'override' && <Shield size={12} className="text-status-override" />}
              </div>
            </div>
          ))
        )}
      </div>
      {student.dueRemarks && (
        <div className="mt-4 p-3 rounded-xl bg-status-due/5 border border-status-due/20">
          <p className="text-xs font-semibold text-status-due uppercase tracking-wider mb-1">Due Remarks</p>
          <p className="text-sm text-foreground">{student.dueRemarks}</p>
        </div>
      )}
    </div>
  );
};

export default StudentApprovalCard;
