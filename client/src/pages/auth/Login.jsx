import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Mail, UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getRoleRedirect } from '../../utils/roleRedirect';
import Button from '../../components/ui/Button';

const FORM_SWAP = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.25, ease: 'easeOut' },
};

const MotionDiv = motion.div;
const MotionForm = motion.form;

const Login = () => {
  const [activeTab, setActiveTab] = useState('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rollNo, setRollNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);

  const { login, studentLogin } = useAuth();
  const navigate = useNavigate();

  const flashThenNavigate = async (path) => {
    setSuccessFlash(true);
    await new Promise((resolve) => setTimeout(resolve, 180));
    navigate(path, { replace: true });
  };

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    try {
      const response = await login({ email, password });
      const userData = response.data;

      if (userData.mustChangePassword) {
        await flashThenNavigate('/change-password');
        return;
      }

      await flashThenNavigate(getRoleRedirect(userData.role));
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
      setSuccessFlash(false);
    }
  };

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!rollNo) {
      setError('Roll number is required');
      return;
    }

    setLoading(true);
    try {
      await studentLogin(rollNo);
      await flashThenNavigate('/student');
    } catch {
      setError('Roll number not found');
    } finally {
      setLoading(false);
      setSuccessFlash(false);
    }
  };



  return (
    <div className="relative min-h-[100svh] bg-offwhite overflow-hidden flex items-start sm:items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
      <div className="absolute inset-0 pointer-events-none grid-overlay opacity-30" />
      <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-indigo-500/18 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-amber-400/22 blur-3xl" />

      <MotionDiv
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className={`relative z-10 w-full max-w-md min-h-[560px] sm:min-h-[590px] max-h-[calc(100svh-1.5rem)] overflow-y-auto bg-white rounded-2xl shadow-md border border-zinc-200 p-6 sm:p-8 transition-all duration-300 ${successFlash ? 'ring-4 ring-emerald-200 border-emerald-300 bg-emerald-50/30' : ''}`}
      >
        <div className="text-center mb-6 min-h-[98px]">
          <h1 className="text-4xl sm:text-5xl font-brand text-navy leading-none tracking-tight">
            No<span className="text-gold">Dues</span>
          </h1>
          <p className="text-[9px] uppercase tracking-[0.28em] font-black text-zinc-500 mt-4">Access Control</p>
        </div>

        <div className="relative grid grid-cols-2 bg-zinc-100 p-1 rounded-full mb-5 h-12">
          <button
            onClick={() => {
              setActiveTab('staff');
              setError('');
            }}
            className="relative z-10 flex items-center justify-center gap-2 rounded-full py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-200 text-zinc-500 hover:text-navy"
            type="button"
            disabled={loading}
          >
            {activeTab === 'staff' && (
              <motion.span
                layoutId="role-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-white border border-zinc-200 shadow-sm"
              />
            )}
            <span className={`relative z-10 inline-flex items-center gap-2 ${activeTab === 'staff' ? 'text-navy' : ''}`}>
            <Mail size={13} /> Staff
            </span>
          </button>
          <button
            onClick={() => {
              setActiveTab('student');
              setError('');
            }}
            className="relative z-10 flex items-center justify-center gap-2 rounded-full py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-200 text-zinc-500 hover:text-navy"
            type="button"
            disabled={loading}
          >
            {activeTab === 'student' && (
              <motion.span
                layoutId="role-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-white border border-zinc-200 shadow-sm"
              />
            )}
            <span className={`relative z-10 inline-flex items-center gap-2 ${activeTab === 'student' ? 'text-navy' : ''}`}>
            <UserIcon size={13} /> Student
            </span>
          </button>
        </div>

        <div className="mb-4 min-h-[42px]">
          <div className={`rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] transition-all duration-200 ${
            error ? 'border border-red-100 bg-red-50 text-red-700 opacity-100' : 'border border-transparent opacity-0'
          }`}>
            {error || 'placeholder'}
          </div>
        </div>

        <div className="relative h-[220px] overflow-hidden mb-4">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'staff' ? (
              <MotionForm
                key="staff-form"
                onSubmit={handleStaffLogin}
                initial={FORM_SWAP.initial}
                animate={FORM_SWAP.animate}
                exit={FORM_SWAP.exit}
                transition={FORM_SWAP.transition}
                className="absolute inset-0"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-[9px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Institutional Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@mits.ac.in"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)] transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Authentication Key</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="********"
                        className="w-full rounded-2xl border border-zinc-200 bg-white pl-4 pr-12 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)] transition-all duration-200"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-8 w-8 p-0 rounded-lg text-zinc-500 hover:text-navy hover:bg-indigo-50 leading-none transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full rounded-full py-3" loading={loading}>
                    Authorize Access
                  </Button>
                </div>
              </MotionForm>
            ) : (
              <MotionForm
                key="student-form"
                onSubmit={handleStudentLogin}
                initial={FORM_SWAP.initial}
                animate={FORM_SWAP.animate}
                exit={FORM_SWAP.exit}
                transition={FORM_SWAP.transition}
                className="absolute inset-0"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-[9px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Academic Roll Number</label>
                    <input
                      type="text"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value.toUpperCase())}
                      placeholder="21CSE001"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-mono tracking-wider font-black focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)] transition-all duration-200"
                    />
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-500">
                    No password required. Use your roll number.
                  </div>
                  <Button type="submit" className="w-full rounded-full py-3" loading={loading}>
                    Retrieve Status
                  </Button>
                </div>
              </MotionForm>
            )}
          </AnimatePresence>
        </div>


      </MotionDiv>
    </div>
  );
};

export default Login;
