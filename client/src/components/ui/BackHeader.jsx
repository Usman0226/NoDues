import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Reusable Back Header component for detail/drill-down pages.
 * @param {string} title - The text label for the back button (e.g. "Return to Directory")
 * @param {string} fallback - The route to navigate to if history stack is empty.
 */
const BackHeader = ({ title, fallback }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    // Check if there's history to go back to avoiding landing on an external site or empty page
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <button 
      onClick={handleBack}
      className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-navy mb-4 transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500/20 rounded-lg"
    >
      <div className="p-1.5 rounded-lg bg-white border border-slate-200 group-hover:bg-slate-50 group-hover:border-slate-300 text-slate-500 group-hover:text-navy transition-colors shadow-xs">
        <ArrowLeft size={13} strokeWidth={2.5} />
      </div>
      <span className="translate-y-[0.5px]">{title}</span>
    </button>
  );
};

export default BackHeader;
