import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Button from '../../components/ui/Button';

const ChangePassword = () => {
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Implement password change via API
  };

  return (
    <PageWrapper title="Change Password" subtitle="Update your account credentials">
      <div className="max-w-md">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-muted shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">Current Password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/10 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">New Password</label>
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/10 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">Confirm Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/10 text-sm" />
          </div>
          <Button type="submit" className="w-full">Update Password</Button>
        </form>
      </div>
    </PageWrapper>
  );
};

export default ChangePassword;
