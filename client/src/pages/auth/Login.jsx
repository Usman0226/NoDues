import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRoleRedirect } from '../../utils/roleRedirect';
import Button from '../../components/ui/Button';
import { Mail, UserIcon } from 'lucide-react';

const Login = () => {
  const [activeTab, setActiveTab] = useState('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('All fields are required'); return; }
    setLoading(true);

    try {
      const response = await login({ email, password });
      const userData = response.data;
      if (userData.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(getRoleRedirect(userData.role), { replace: true });
      }
    } catch (err) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!rollNo) { setError('Roll number is required'); return; }
    setLoading(true);
    try {
      await studentLogin(rollNo);
      navigate('/student', { replace: true });
    } catch (err) {
      setError('Roll number not found');
    } finally {
      setLoading(false);
    }
  };
  const fillDemo = (type) => {
    setActiveTab(type === 'student' ? 'student' : 'staff');
    if (type === 'admin') { setEmail('admin@mits.ac.in'); setPassword('admin123'); }
    if (type === 'hod') { setEmail('hod_cse@mits.ac.in'); setPassword('hod123'); }
    if (type === 'faculty') { setEmail('faculty@mits.ac.in'); setPassword('faculty123'); }
    if (type === 'student') { setRollNo('21CSE001'); }
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-offwhite p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-4xl sm:text-5xl font-brand text-navy mb-2">No<span className="text-gold">Dues</span></h1>
          <p className="tagline text-muted-foreground uppercase tracking-[0.2em] font-bold text-[9px] sm:text-[10px]">MITS Academic Clearance Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-muted overflow-hidden transition-all duration-300">
          {/* Tab Switcher */}
          <div className="flex border-b border-muted">
            <button
              onClick={() => { setActiveTab('staff'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] transition-all
                ${activeTab === 'staff'
                  ? 'text-navy border-b-2 border-navy bg-white'
                  : 'text-muted-foreground hover:text-navy bg-offwhite/50'}`}
            >
              <Mail size={14} /> Staff
            </button>
            <button
              onClick={() => { setActiveTab('student'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] transition-all
                ${activeTab === 'student'
                  ? 'text-navy border-b-2 border-navy bg-white'
                  : 'text-muted-foreground hover:text-navy bg-offwhite/50'}`}
            >
              <UserIcon size={14} /> Student
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest border border-red-100 animate-in slide-in-from-top-2 duration-300">{error}</div>
            )}

            {/* Staff Login Form */}
            {activeTab === 'staff' && (
              <form onSubmit={handleStaffLogin} className="space-y-4">
                <div>
                  <label className="block text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground mb-2">Institutional Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/5 focus:border-navy/20 text-sm font-medium transition-all"
                    placeholder="you@mits.ac.in" />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground mb-2">Authentication Key</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/5 focus:border-navy/20 text-sm font-medium transition-all"
                    placeholder="••••••••" />
                </div>
                <div className="pt-2">
                  <Button type="submit" className="w-full h-11 sm:h-12 text-[10px] font-black uppercase tracking-[0.2em]" loading={loading}>Authorize Access</Button>
                </div>
              </form>
            )}

            {/* Student Login Form */}
            {activeTab === 'student' && (
              <form onSubmit={handleStudentLogin} className="space-y-5">
                <div>
                  <label className="block text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground mb-2">Academic Roll Number</label>
                  <input type="text" value={rollNo} onChange={(e) => setRollNo(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/5 focus:border-navy/20 text-sm transition-all font-mono tracking-wider font-bold"
                    placeholder="21CSE001" />
                </div>
                <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic opacity-80">
                  Secure access via roll number validation. No password required for student status views.
                </p>
                <div className="pt-2">
                  <Button type="submit" className="w-full h-11 sm:h-12 text-[10px] font-black uppercase tracking-[0.2em]" loading={loading}>Retrieve Status</Button>
                </div>
              </form>
            )}

            {/* Quick Demo Fill - Institutional Access */}
            <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-muted/50">
              <label className="block text-[8px] uppercase tracking-[0.3em] font-black text-muted-foreground/40 mb-4 text-center">Fast-Track Demo Access</label>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => fillDemo('admin')} className="px-3 py-1.5 rounded-lg bg-navy/5 text-navy text-[9px] font-black uppercase tracking-widest hover:bg-navy hover:text-white transition-all border border-navy/10 active:scale-95">Admin</button>
                <button onClick={() => fillDemo('hod')} className="px-3 py-1.5 rounded-lg bg-navy/5 text-navy text-[9px] font-black uppercase tracking-widest hover:bg-navy hover:text-white transition-all border border-navy/10 active:scale-95">HOD</button>
                <button onClick={() => fillDemo('faculty')} className="px-3 py-1.5 rounded-lg bg-navy/5 text-navy text-[9px] font-black uppercase tracking-widest hover:bg-navy hover:text-white transition-all border border-navy/10 active:scale-95">Faculty</button>
                <button onClick={() => fillDemo('student')} className="px-3 py-1.5 rounded-lg bg-navy/5 text-navy text-[9px] font-black uppercase tracking-widest hover:bg-navy hover:text-white transition-all border border-navy/10 active:scale-95">Student</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
