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
      className="inline-flex items-center gap-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-navy mb-8 -mt-6 transition-all duration-300 group focus:outline-none"
    >
      <div className="p-1.5 sm:p-2 rounded-full bg-white border border-muted group-hover:bg-navy group-hover:text-white group-hover:border-navy transition-all duration-300 shadow-sm">
        <ArrowLeft size={12} sm:size={14} strokeWidth={3} />
      </div>
      <span className="translate-y-[0.5px]">{title}</span>
    </button>
  );
};

export default BackHeader;
