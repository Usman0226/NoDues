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

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-offwhite p-6">
          <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8 border border-status-rejected/20 text-center">
            <h2 className="text-3xl mb-4 text-navy">Something went wrong</h2>
            <p className="text-muted-foreground mb-6">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-navy text-white rounded-full hover:opacity-90 transition-all font-sans uppercase tracking-widest text-xs"
            >
              Refresh Application
            </button>
            
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
