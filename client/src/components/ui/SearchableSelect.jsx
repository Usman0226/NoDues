import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * SearchableSelect - A premium reusable searchable dropdown
 * 
 * @param {Array} options - List of objects to choose from
 * @param {any} value - Currently selected value (matches option[idKey])
 * @param {Function} onChange - Callback when selection changes
 * @param {string} placeholder - Placeholder text
 * @param {string} labelKey - Key for primary display text (default: 'label')
 * @param {string} subLabelKey - Key for secondary display text (default: 'subLabel')
 * @param {string} idKey - Key for the value property (default: 'value')
 * @param {boolean} loading - Loading state
 * @param {boolean} disabled - Disabled state
 * @param {string} className - Additional CSS classes for the container
 */
const SearchableSelect = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select an option...',
  labelKey = 'label',
  subLabelKey = 'subLabel',
  idKey = 'value',
  loading = false,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = useMemo(() => 
    options.find(opt => opt[idKey] === value),
    [options, value, idKey]
  );

  const filteredOptions = useMemo(() => {
    if (!searchValue) return options;
    const q = searchValue.toLowerCase();
    return options.filter(opt => 
      String(opt[labelKey] || '').toLowerCase().includes(q) ||
      String(opt[subLabelKey] || '').toLowerCase().includes(q)
    );
  }, [options, searchValue, labelKey, subLabelKey]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-300
          ${disabled ? 'bg-zinc-50 border-zinc-200 opacity-60 cursor-not-allowed' : 'bg-white border-zinc-200 hover:border-indigo-300 focus:ring-4 focus:ring-indigo-100'}
          ${isOpen ? 'border-indigo-500 ring-4 ring-indigo-100' : ''}
        `}
      >
        <div className="flex flex-col items-start overflow-hidden">
          {selectedOption ? (
            <>
              <span className="text-sm font-bold text-zinc-900 truncate w-full">{selectedOption[labelKey]}</span>
              {selectedOption[subLabelKey] && (
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-0.5 truncate w-full">
                  {selectedOption[subLabelKey]}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-zinc-400 font-medium">{placeholder}</span>
          )}
        </div>
        
        <div className="flex items-center gap-2 ml-2">
          {loading && <Loader2 size={16} className="animate-spin text-indigo-500" />}
          {selectedOption && !disabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange?.(null);
                setSearchValue('');
              }}
              className="p-1 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={18} className={`text-zinc-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 5, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute z-50 left-0 right-0 bg-white rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden"
          >
            <div className="p-3 border-b border-zinc-100 bg-zinc-50/50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter lookup..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all font-semibold"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent">
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">No results found</span>
                </div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt[idKey]}
                    type="button"
                    onClick={() => {
                      onChange?.(opt[idKey]);
                      setIsOpen(false);
                      setSearchValue('');
                    }}
                    className={`
                      w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group
                      ${value === opt[idKey] ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-zinc-50 text-zinc-700'}
                    `}
                  >
                    <div className="flex flex-col items-start text-left overflow-hidden">
                      <span className={`text-[13px] font-bold truncate w-full ${value === opt[idKey] ? 'text-indigo-700' : 'text-zinc-900 group-hover:text-indigo-600'}`}>
                        {opt[labelKey]}
                      </span>
                      {opt[subLabelKey] && (
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-60 truncate w-full">
                          {opt[subLabelKey]}
                        </span>
                      )}
                    </div>
                    {value === opt[idKey] && <Check size={14} className="text-indigo-600 shrink-0" />}
                  </button>
                ))
              )}
            </div>
            
            <div className="p-2 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
               <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 px-2">
                 {filteredOptions.length} Results
               </span>
               <button 
                 type="button"
                 onClick={() => setIsOpen(false)}
                 className="text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 px-2 py-1"
               >
                 Close
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchableSelect;
