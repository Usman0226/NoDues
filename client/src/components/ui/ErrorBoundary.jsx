import React from 'react';
import Button from "./Button"

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-offwhite p-6 relative overflow-hidden">
          {/* Branded Ambient Elements */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 blur-[120px] rounded-full animate-pulse" />
          
          <div className="max-w-md w-full relative z-10 text-center space-y-8">
            <div className="space-y-2">
              <h1 className="text-8xl font-brand text-navy tracking-tighter opacity-10">NoDues</h1>
              <div className="h-0.5 w-12 bg-indigo-600 mx-auto" />
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-black text-indigo-950 uppercase tracking-tight">System Encountered a Deviation</h2>
              <p className="text-sm text-indigo-900/60 leading-relaxed font-medium">
                An unexpected runtime interruption occurred. Your session state might be out of sync.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <button
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto px-8 py-3 bg-indigo-950 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full hover:bg-indigo-900 transition-all shadow-lg hover:shadow-indigo-950/20 active:scale-95"
              >
                Refresh View
              </button>
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto px-8 py-3 bg-white border border-indigo-100 text-indigo-950 text-[10px] font-black uppercase tracking-[0.2em] rounded-full hover:bg-slate-50 transition-all active:scale-95"
              >
                Reset Session
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <div className="mt-12 p-4 bg-red-50 rounded-lg border border-red-100 text-left">
                <p className="text-[10px] font-black text-red-900 uppercase tracking-widest mb-2">Debug Context</p>
                <code className="text-[10px] text-red-800 break-all leading-tight block font-mono">
                  {this.state.error?.toString()}
                </code>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
