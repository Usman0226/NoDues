import React from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { User, Check, X, AlertTriangle } from 'lucide-react';

const ApprovalCard = ({ student = {}, status = 'pending', onApprove, onReject, onMarkDue }) => {
  return (
    <div className="bg-white rounded-2xl border border-muted shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-navy/10 flex items-center justify-center">
            <User size={18} className="text-navy" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-navy">{student.name}</h4>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{student.rollNo}</p>
          </div>
        </div>
        <Badge status={status} />
      </div>
      {student.subject && (
        <p className="text-xs text-muted-foreground mb-4">Subject: <span className="font-medium text-foreground">{student.subject}</span></p>
      )}
      {status === 'pending' && (
        <div className="flex gap-2 pt-2 border-t border-muted">
          <Button variant="primary" size="sm" onClick={onApprove}><Check size={14} /> Approve</Button>
          <Button variant="danger" size="sm" onClick={onReject}><X size={14} /> Reject</Button>
          <Button variant="ghost" size="sm" onClick={onMarkDue}><AlertTriangle size={14} /> Due</Button>
        </div>
      )}
    </div>
  );
};

export default ApprovalCard;
