import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Mail, UserIcon, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getRoleRedirect } from '../../utils/roleRedirect';
import Button from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const FORM_SWAP = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 }
};

const MotionDiv = motion.div;

const Login = () => {
  const [activeTab, setActiveTab] = useState('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rollNo, setRollNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [view, setView] = useState('login'); // 'login' | 'forgot'
  const [forgotSent, setForgotSent] = useState(false);

  const { login, studentLogin, handlePassChange } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const flashThenNavigate = async (path) => {
    setSuccessFlash(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
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
      await flashThenNavigate(getRoleRedirect(userData.role));
    } catch (err) {
      setError(err.message || 'Invalid credentials');
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
    } catch (err) {
      setError(err.message || 'Roll number not found');
    } finally {
      setLoading(false);
      setSuccessFlash(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      await handlePassChange(email);
      setForgotSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {isInitialLoading ? (
        <PageSpinner key="initial-loader" message="Preparing NDS Portal..." />
      ) : (
        <motion.div 
          key="login-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="relative min-h-[100svh] bg-[#fcfcfd] overflow-hidden flex items-center justify-center p-4"
        >
          {/* Premium Background Layer */}
          <div className="absolute inset-0 pointer-events-none">
            <div 
              className="absolute inset-0 opacity-[0.04] mix-blend-multiply" 
              style={{ 
                backgroundImage: `url('/assets/images/login-bg.png')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }} 
            />
            <div className="absolute inset-0 noise-bg opacity-[0.4]" />
            <div className="absolute -bottom-10 -right-10 sm:-bottom-24 sm:-right-24 select-none pointer-events-none">
              <h2 className="text-[45vw] sm:text-[24vw] font-black text-navy/[0.025] leading-none tracking-[-0.08em] uppercase">
                ARC
              </h2>
            </div>
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/[0.03] blur-[120px]" />
            <div className="absolute bottom-[10%] right-[10%] w-[35%] h-[35%] rounded-full bg-amber-400/[0.03] blur-[100px]" />
            <div className="absolute inset-0 grid-overlay opacity-[0.08]" />
          </div>

          <MotionDiv
            layout
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: successFlash ? 1.02 : 1, 
              y: 0,
              boxShadow: successFlash 
                ? '0 0 0 12px rgba(16, 185, 129, 0.15), 0 64px 128px -32px rgba(0,0,0,0.15)' 
                : '0 48px 96px -24px rgba(0,0,0,0.12)',
              borderColor: successFlash ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.8)'
            }}
            transition={{ 
              duration: 1.2, 
              ease: [0.16, 1, 0.3, 1],
              layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
              scale: { type: 'spring', stiffness: 100, damping: 25 }
            }}
            className="relative z-10 w-full max-w-md bg-white/80 backdrop-blur-3xl rounded-[2.5rem] border p-6 sm:p-10"
          >
            <div className="text-center mb-6 min-h-[62px]">
              <h1 className="text-4xl sm:text-5xl font-brand text-navy leading-none tracking-tight">
                No<span className="text-gold">Dues</span>
              </h1>
            </div>

            <AnimatePresence mode="wait">
              {view === 'login' ? (
                <motion.div
                  key="login-view"
                  {...FORM_SWAP}
                  className="w-full"
                >
                  <div className="relative grid grid-cols-2 bg-zinc-100 p-1 rounded-full mb-5 h-12">
                    <button
                      onClick={() => { setActiveTab('staff'); setError(''); }}
                      className="relative z-10 flex items-center justify-center gap-2 rounded-full py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-200 text-zinc-500 hover:text-navy"
                      type="button"
                      disabled={loading}
                    >
                      {activeTab === 'staff' && (
                        <motion.span
                          layoutId="role-pill"
                          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                          className="absolute inset-0 rounded-full bg-white border border-zinc-200 shadow-sm"
                        />
                      )}
                      <span className={`relative z-10 inline-flex items-center gap-2 ${activeTab === 'staff' ? 'text-navy' : ''}`}>
                        <Mail size={13} /> Staff
                      </span>
                    </button>
                    <button
                      onClick={() => { setActiveTab('student'); setError(''); }}
                      className="relative z-10 flex items-center justify-center gap-2 rounded-full py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-200 text-zinc-500 hover:text-navy"
                      type="button"
                      disabled={loading}
                    >
                      {activeTab === 'student' && (
                        <motion.span
                          layoutId="role-pill"
                          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                          className="absolute inset-0 rounded-full bg-white border border-zinc-200 shadow-sm"
                        />
                      )}
                      <span className={`relative z-10 inline-flex items-center gap-2 ${activeTab === 'student' ? 'text-navy' : ''}`}>
                        <UserIcon size={13} /> Student
                      </span>
                    </button>
                  </div>

                  <div className="mb-4 min-h-[42px]">
                    <AnimatePresence>
                      {error && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] border border-red-100 bg-red-50 text-red-700 overflow-hidden"
                        >
                          {error}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {activeTab === 'staff' ? (
                    <form onSubmit={handleStaffLogin} className="space-y-4">
                      <div>
                        <label className="block text-[9px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Email Address</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="youremail@mits.ac.in"
                          className="w-full rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Password</label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="********"
                            className="w-full rounded-full border border-zinc-200 bg-white pl-4 pr-12 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full text-zinc-400 hover:text-navy transition-colors"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <div className='flex justify-end mt-2'>
                          <button 
                            type="button"
                            onClick={() => { setView('forgot'); setError(''); }} 
                            className='text-indigo-600 text-[10px] font-black hover:text-navy transition-colors'
                          >
                            Forgot Password ?
                          </button>
                        </div>
                      </div>
                      <Button type="submit" className="w-full rounded-full py-3" loading={loading}>
                        Sign In
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleStudentLogin} className="space-y-4">
                      <div>
                        <label className="block text-[9px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">Roll Number</label>
                        <input
                          type="text"
                          value={rollNo}
                          onChange={(e) => setRollNo(e.target.value.toUpperCase())}
                          placeholder="24691A32XX"
                          className="w-full rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-mono tracking-wider font-black focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                        />
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-500">
                        Don't include @mits.ac.in. Just your Roll Number
                      </div>
                      <Button type="submit" className="w-full rounded-full py-3" loading={loading}>
                        Check Status
                      </Button>
                    </form>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="forgot-view"
                  {...FORM_SWAP}
                  className="w-full"
                >
                  <button 
                    onClick={() => { setView('login'); setForgotSent(false); setError(''); }}
                    className="flex items-center gap-2 text-zinc-400 hover:text-navy transition-colors mb-6 text-[10px] font-black uppercase tracking-widest"
                  >
                    <ArrowLeft size={14} /> Back to login
                  </button>

                  <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mx-auto mb-4">
                      <Mail size={28} />
                    </div>
                    <h2 className="text-2xl font-bold text-navy mb-1">Recover Password</h2>
                    <p className="text-sm text-zinc-500 font-medium px-4">
                      {forgotSent 
                        ? "Check your college inbox for the temporary login credentials."
                        : "Enter your college email address and we'll send you a temporary password."}
                    </p>
                  </div>

                  {forgotSent ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-emerald-800 text-xs font-semibold leading-relaxed text-center">
                        If the email exists, you should have received a temporary password.
                      </div>
                      <Button 
                        onClick={() => { setView('login'); setForgotSent(false); }}
                        className="w-full rounded-full py-3"
                      >
                        Return to Sign In
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotSubmit} className="space-y-6">
                      <div className="mb-4 min-h-[42px]">
                        <AnimatePresence>
                          {error && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] border border-red-100 bg-red-50 text-red-700 overflow-hidden"
                            >
                              {error}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase tracking-[0.24em] font-black text-zinc-500 mb-2">College Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="yourname@mits.ac.in"
                          className="w-full rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                        />
                      </div>
                      <Button type="submit" className="w-full rounded-full py-3" loading={loading}>
                        Send
                      </Button>
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-8 pt-6 border-t border-zinc-100/50 text-center">
              <div className="flex flex-col items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity duration-500">
                <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.3em] font-black text-zinc-400">
                  Designed & Developed by
                </p>
                <p className="text-[10px] sm:text-[12px] font-brand text-navy tracking-tight">
                  ARC <span className="text-gold">CLUB</span> <span className="text-zinc-300 mx-1">/</span> MITS
                </p>
              </div>
            </div>
          </MotionDiv>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Login;