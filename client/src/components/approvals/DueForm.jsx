import React, { useState } from 'react';
import Button from '../ui/Button';

const DueForm = ({ onSubmit, onCancel }) => {
  const [dueType, setDueType] = useState('');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dueType) return;
    onSubmit?.({ dueType, remarks });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-status-due/5 rounded-xl border border-status-due/20">
      <div>
        <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">Due Type</label>
        <select value={dueType} onChange={(e) => setDueType(e.target.value)}
          className="w-full px-4 py-2.5 text-sm rounded-lg border border-muted bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy/30">
          <option value="">Select type</option>
          <option value="library">Library</option>
          <option value="lab">Lab Equipment</option>
          <option value="fee">Fee</option>
          <option value="assignment">Assignment</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">Remarks</label>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Describe the pending due..."
          className="w-full px-4 py-2.5 text-sm rounded-lg border border-muted bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy/30 resize-none" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="accent" size="sm" disabled={!dueType}>Mark Due</Button>
      </div>
    </form>
  );
};

export default DueForm;
