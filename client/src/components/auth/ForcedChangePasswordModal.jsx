import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { changePassword } from '../../api/auth';
import { toast } from 'react-hot-toast';
import { ShieldAlert, KeyRound, LogOut, ArrowRight } from 'lucide-react';

const ForcedChangePasswordModal = () => {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  // Only show if user is logged in and needs password change
  const isOpen = !!user && user.mustChangePassword;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!current || !newPwd || !confirm) {
      return toast.error('All fields are required');
    }

    if (newPwd !== confirm) {
      return toast.error('New passwords do not match');
    }

    if (newPwd.length < 8) {
      return toast.error('Password must be at least 8 characters');
    }

    setLoading(true);
    try {
      await changePassword({
        oldPassword: current,
        newPassword: newPwd,
        confirmPassword: confirm,
      });

      toast.success('Security credentials updated. Logging out for security.', {
        duration: 5000,
        icon: '🔒'
      });
      
      // Delay logout slightly so user sees the success message
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (err) {
      toast.error(err?.message || 'Failed to update password');
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
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="The password from your email"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 font-semibold text-sm transition-all"
                  required
                />
              </div>
            </div>

            <div className="h-px bg-zinc-100"></div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">New Password</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="8+ characters"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 font-semibold text-sm transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 font-semibold text-sm transition-all"
                  required
                />
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
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 border border-zinc-200/60">
                <LogOut size={12} className="text-zinc-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-400">
                  Automatic Logout and Refresh after commit
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
