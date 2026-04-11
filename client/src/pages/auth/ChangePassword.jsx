import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Button from '../../components/ui/Button';
import { useApi } from '../../hooks/useApi';
import { changePassword } from '../../api/auth';
import { toast } from 'react-hot-toast';
import { ShieldCheck, Loader2 } from 'lucide-react';

const ChangePassword = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const { loading, request } = useApi(changePassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!current || !newPwd || !confirm) {
      return toast.error('All fields are required');
    }

    if (newPwd !== confirm) {
      return toast.error('New passwords do not match');
    }

    if (newPwd.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }

    try {
      await request({ oldPassword: current, newPassword: newPwd });
      toast.success('Password updated successfully. Please login again.');
      localStorage.removeItem('token');
      navigate('/login');
    } catch (err) {
      toast.error(err?.message || 'Failed to update password');
    }
  };

  return (
    <PageWrapper title="Security Settings" subtitle="Update your institutional credentials">
      <div className="max-w-md">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-muted shadow-sm p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
             <ShieldCheck size={80} strokeWidth={1} />
          </div>

          <div className="space-y-5 relative z-10">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Current Authentication State</label>
              <input 
                type="password" 
                value={current} 
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 focus:outline-none focus:ring-2 focus:ring-navy/5 text-sm font-medium transition-all" 
              />
            </div>

            <div className="h-px bg-muted/30"></div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">New Security Credential</label>
              <input 
                type="password" 
                value={newPwd} 
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 focus:outline-none focus:ring-2 focus:ring-navy/5 text-sm font-medium transition-all" 
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Verify New Credential</label>
              <input 
                type="password" 
                value={confirm} 
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 focus:outline-none focus:ring-2 focus:ring-navy/5 text-sm font-medium transition-all" 
              />
            </div>
          </div>

          <div className="pt-4 relative z-10">
            <Button type="submit" className="w-full h-12 text-xs font-black uppercase tracking-widest shadow-lg shadow-navy/10" loading={loading}>
              Commit Changes
            </Button>
            <p className="text-[9px] text-center text-muted-foreground/50 mt-4 uppercase font-black tracking-widest">
              Updating your password will invalidate current sessions
            </p>
          </div>
        </form>
      </div>
    </PageWrapper>
  );
};

export default ChangePassword;
