import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Button from '../../components/ui/Button';
import { useApi } from '../../hooks/useApi';
import { changePassword } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { updateUserData, refreshUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { loading, request } = useApi(changePassword, { immediate: false });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    
    if (!current || !newPwd || !confirm) {
      return toast.error('All fields are required');
    }

    if (newPwd !== confirm) {
      return toast.error('New passwords do not match');
    }

    if (newPwd.length < 8) {
      return toast.error('Password must be at least 8 characters');
    }

    if (newPwd === current) {
      return toast.error('New password must differ from current password');
    }

    try {
      const res = await request({ 
        oldPassword: current, 
        newPassword: newPwd,
        confirmPassword: confirm
      });

      if (res?.token) {
        localStorage.setItem('nds_token', res.token);
      }

      // Clear sensitive inputs from memory
      setCurrent('');
      setNewPwd('');
      setConfirm('');

      updateUserData?.({ mustChangePassword: false });
      if (refreshUser) {
        await refreshUser();
      }

      toast.success('Password updated successfully!');
      navigate(-1);
    } catch (err) {
      toast.error(err?.message || 'Failed to update password');
    }
  };

  return (
    <PageWrapper title="Security Settings" subtitle="Update your institutional credentials">
      <div className="max-w-md">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-muted shadow-sm p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
             <ShieldCheck size={80} strokeWidth={1} />
          </div>

          <div className="space-y-5 relative z-10">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Current Authentication State</label>
              <div className="relative group">
                <input 
                  type={showCurrent ? 'text' : 'password'} 
                  value={current} 
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-4 pr-11 py-3 rounded-xl border border-muted bg-offwhite/50 focus:outline-none focus:ring-2 focus:ring-navy/5 text-sm font-medium transition-all" 
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-navy transition-colors"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="h-px bg-muted/30"></div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">New Security Credential</label>
              <div className="relative group">
                <input 
                  type={showNew ? 'text' : 'password'} 
                  value={newPwd} 
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 pr-11 py-3 rounded-xl border border-muted bg-offwhite/50 focus:outline-none focus:ring-2 focus:ring-navy/5 text-sm font-medium transition-all" 
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-navy transition-colors"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Verify New Credential</label>
              <div className="relative group">
                <input 
                  type={showConfirm ? 'text' : 'password'} 
                  value={confirm} 
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-4 pr-11 py-3 rounded-xl border border-muted bg-offwhite/50 focus:outline-none focus:ring-2 focus:ring-navy/5 text-sm font-medium transition-all" 
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-navy transition-colors"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 relative z-10">
            <Button type="submit" className="w-full h-12 text-xs font-black uppercase tracking-widest shadow-lg shadow-navy/10" loading={loading} disabled={loading}>
              Commit Changes
            </Button>
            <p className="text-[9px] text-center text-muted-foreground/60 mt-4 uppercase font-black tracking-widest">
              Your institutional credentials will be updated immediately
            </p>
          </div>
        </form>
      </div>
    </PageWrapper>
  );
};

export default ChangePassword;
