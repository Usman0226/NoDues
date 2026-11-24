import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { changePassword } from '../../api/auth';
import { toast } from 'react-hot-toast';
import { ShieldAlert, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';

const ForcedChangePasswordModal = () => {
  const { user, refreshUser, updateUserData } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Only show if user is logged in and needs password change
  const isOpen = !!user && user.mustChangePassword;

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

    setLoading(true);
    try {
      const res = await changePassword({
        oldPassword: current,
        newPassword: newPwd,
        confirmPassword: confirm,
      });

      if (res?.token) {
        localStorage.setItem('nds_token', res.token);
      }

      // Clear sensitive inputs from memory
      setCurrent('');
      setNewPwd('');
      setConfirm('');

      // Immediately clear mustChangePassword in user state so modal closes seamlessly
      updateUserData?.({ mustChangePassword: false });
      if (refreshUser) {
        await refreshUser();
      }

      toast.success('Security credentials updated! Welcome to your dashboard.', {
        duration: 4000,
        icon: <ShieldCheck size={18} className="text-emerald-600" />
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Non-dismissible
      title="Security Update Required"
      size="md"
      preventClose={true}
    >
      <div className="space-y-6">
        {/* Header/Info Section */}
        <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-100/50 shadow-sm shadow-amber-900/5">
          <div className="flex-shrink-0 p-2.5 rounded-xl bg-white shadow-sm border border-amber-100">
            <ShieldAlert size={24} className="text-amber-600" />
          </div>
          <div>
            <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">First-Time Login Detected</h4>
            <p className="text-xs text-amber-800/80 leading-relaxed font-semibold mt-1">
              For security reasons, you must change your initial email-delivered credentials before accessing the dashboard.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Current Temporary Password</label>
              <div className="relative group">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="The password from your email"
                  className="w-full px-4 pr-11 py-3 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 font-semibold text-sm transition-all"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-navy transition-colors"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="h-px bg-zinc-100"></div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">New Password</label>
                <div className="relative group">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="8+ characters"
                    className="w-full px-4 pr-11 py-3 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 font-semibold text-sm transition-all"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-navy transition-colors"
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Confirm New Password</label>
                <div className="relative group">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-4 pr-11 py-3 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 font-semibold text-sm transition-all"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-navy transition-colors"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full h-14 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-900/10 group overflow-hidden relative"
              loading={loading}
              disabled={loading}
            >
              <div className="flex items-center justify-center gap-2">
                <span>Commit Security Updates</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </Button>
            
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/60">
                <ShieldCheck size={13} className="text-emerald-600" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-700">
                  Direct access to dashboard upon commit
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ForcedChangePasswordModal;
