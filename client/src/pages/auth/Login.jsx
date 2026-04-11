import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRoleRedirect } from '../../utils/roleRedirect';
import Button from '../../components/ui/Button';
import { Mail, Hash } from 'lucide-react';

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
      const user = await login({ email, password });
      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(getRoleRedirect(user.role), { replace: true });
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
      const user = await login({ rollNo });
      navigate('/student', { replace: true });
    } catch (err) {
      setError('Roll number not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-offwhite p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-serif text-navy mb-2">No<span className="text-gold">Dues</span></h1>
          <p className="tagline text-muted-foreground">MITS Academic Clearance Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-muted overflow-hidden">
          {/* Tab Switcher */}
          <div className="flex border-b border-muted">
            <button
              onClick={() => { setActiveTab('staff'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-[0.15em] transition-all
                ${activeTab === 'staff'
                  ? 'text-navy border-b-2 border-navy bg-white'
                  : 'text-muted-foreground hover:text-navy bg-offwhite/50'}`}
            >
              <Mail size={14} /> Staff Login
            </button>
            <button
              onClick={() => { setActiveTab('student'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-[0.15em] transition-all
                ${activeTab === 'student'
                  ? 'text-navy border-b-2 border-navy bg-white'
                  : 'text-muted-foreground hover:text-navy bg-offwhite/50'}`}
            >
              <Hash size={14} /> Student Login
            </button>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{error}</div>
            )}

            {/* Staff Login Form */}
            {activeTab === 'staff' && (
              <form onSubmit={handleStaffLogin} className="space-y-5">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy/30 text-sm transition-all"
                    placeholder="you@mits.ac.in" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy/30 text-sm transition-all"
                    placeholder="••••••••" />
                </div>
                <Button type="submit" className="w-full" loading={loading}>Sign In</Button>
              </form>
            )}

            {/* Student Login Form */}
            {activeTab === 'student' && (
              <form onSubmit={handleStudentLogin} className="space-y-5">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1.5">Roll Number</label>
                  <input type="text" value={rollNo} onChange={(e) => setRollNo(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy/30 text-sm transition-all font-mono tracking-wider"
                    placeholder="21CSE001" />
                </div>
                <p className="text-xs text-muted-foreground">No password required. Enter your roll number to view your clearance status.</p>
                <Button type="submit" className="w-full" loading={loading}>View Status</Button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          {activeTab === 'staff'
            ? 'Use admin@, hod@, or faculty@ to test roles'
            : 'Enter any roll number (e.g. 21CSE001)'}
        </p>
      </div>
    </div>
  );
};

export default Login;
