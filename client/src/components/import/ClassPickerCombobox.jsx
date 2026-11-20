import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Sparkles, GraduationCap, Building2, X, Plus } from 'lucide-react';

/**
 * Industry-grade searchable, grouped Class Picker Combobox.
 * Prioritizes suggested section/cohort matches and groups by department and semester.
 */
const ClassPickerCombobox = ({
  value,
  onChange,
  classes = [],
  sheetName = '',
  sheetMeta = {},
  onQuickCreate,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  const handleClose = () => {
    setIsOpen(false);
    setSearch('');
  };

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        handleClose();
      }
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleDown);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleDown);
    };
  }, [isOpen]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filter out any Curriculum Master blueprints (Curriculum Masters must NEVER have student cohorts)
  const candidateClasses = useMemo(() => {
    return (classes || []).filter((c) => !c.isMaster);
  }, [classes]);

  // Current selected class object
  const selectedClass = useMemo(() => {
    return candidateClasses.find((c) => c._id === value) || null;
  }, [candidateClasses, value]);

  // Score and categorize classes
  const { suggestedClass, sameDeptClasses, otherClasses } = useMemo(() => {
    if (!candidateClasses.length) {
      return { suggestedClass: null, sameDeptClasses: [], otherClasses: [] };
    }

    const cleanSec = (sheetMeta.section || (sheetName.match(/[-_\s]([A-Z0-9])\s*$/i) || [])[1] || '').toUpperCase();
    const cleanDept = (sheetMeta.department || '').toUpperCase();
    const cleanSem = sheetMeta.semester;

    let bestClass = null;
    let highestScore = -1;

    // Filter by search query if any
    const query = search.trim().toLowerCase();
    const matchesQuery = (c) => {
      if (!query) return true;
      const cName = (c.name || '').toLowerCase();
      const cSem = String(c.semester || '');
      const dept = String(c.departmentId?.name || c.departmentId?.code || '').toLowerCase();
      return cName.includes(query) || cSem.includes(query) || dept.includes(query);
    };

    const matching = candidateClasses.filter(matchesQuery);

    matching.forEach((c) => {
      let score = 0;
      const cName = (c.name || '').toUpperCase();
      const cSec = (cName.match(/(?:^|[-_\s])([A-Z0-9])\s*$/i) || [])[1] || '';

      if (cleanSec && cSec === cleanSec) score += 50;
      if (cleanSem && Number(c.semester) === Number(cleanSem)) score += 40;
      if (cleanDept && (cName.includes(cleanDept) || c.departmentId?.code === cleanDept)) score += 30;

      if (score > highestScore && score >= 50) {
        highestScore = score;
        bestClass = c;
      }
    });

    const sameDept = [];
    const others = [];

    matching.forEach((c) => {
      const cName = (c.name || '').toUpperCase();
      const isDept = cleanDept && (cName.includes(cleanDept) || c.departmentId?.code === cleanDept);
      if (isDept) {
        sameDept.push(c);
      } else {
        others.push(c);
      }
    });

    // Sort by semester asc, then name asc
    const sortFn = (a, b) => {
      if ((a.semester || 0) !== (b.semester || 0)) {
        return (a.semester || 0) - (b.semester || 0);
      }
      return (a.name || '').localeCompare(b.name || '');
    };

    sameDept.sort(sortFn);
    others.sort(sortFn);

    return { suggestedClass: bestClass, sameDeptClasses: sameDept, otherClasses: others };
  }, [candidateClasses, sheetMeta, sheetName, search]);

  // Compute inline quick-create suggestion if cohort section is missing from database
  const suggestedCreation = useMemo(() => {
    if (!onQuickCreate) return null;
    const sec = (sheetMeta?.section || (sheetName.match(/[-_\s]([A-Z0-9])\s*$/i) || [])[1] || '').toUpperCase();
    const dept = (sheetMeta?.department || '').toUpperCase();
    const sem = sheetMeta?.semester;

    let targetName = '';
    if (search.trim()) {
      targetName = search.trim().toUpperCase();
    } else if (dept && sec) {
      targetName = `${dept}-${sec}`;
    } else if (sheetName) {
      targetName = sheetName.toUpperCase();
    }

    if (!targetName) return null;

    // Check if targetName already exists in candidateClasses
    const alreadyExists = candidateClasses.some(
      (c) => c.name?.toUpperCase() === targetName && (!sem || Number(c.semester) === Number(sem))
    );
    if (alreadyExists) return null;

    return {
      name: targetName,
      semester: sem || 1,
      departmentCode: dept,
    };
  }, [onQuickCreate, sheetMeta, sheetName, search, candidateClasses]);

  const handleSelect = (classId) => {
    onChange(classId);
    handleClose();
  };

  const handleQuickCreate = async () => {
    if (!suggestedCreation || !onQuickCreate || isCreating) return;
    setIsCreating(true);
    try {
      const newClassId = await onQuickCreate(suggestedCreation);
      if (newClassId) {
        handleSelect(newClassId);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-6.5 px-2 rounded-md text-[11px] font-semibold border transition-all flex items-center gap-1.5 cursor-pointer select-none ${
          selectedClass
            ? 'bg-white border-zinc-200 hover:border-zinc-300 text-zinc-900 shadow-2xs hover:bg-zinc-50/70'
            : 'bg-amber-50 border-amber-300 hover:border-amber-400 text-amber-900 shadow-2xs'
        }`}
        title={selectedClass ? `Target: ${selectedClass.name} (Semester ${selectedClass.semester})` : 'Select target class for this sheet'}
      >
        {selectedClass ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-bold text-navy">{selectedClass.name}</span>
            <span className="text-[10px] text-zinc-500 font-medium font-mono">Sem {selectedClass.semester}</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
            <span className="text-amber-800 font-medium">Select Class...</span>
          </>
        )}
        <ChevronDown size={11} className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Floating Searchable Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 rounded-xl bg-white border border-zinc-200/90 shadow-xl z-[1200] overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col text-left">
          {/* Popover Search Bar */}
          <div className="p-1.5 border-b border-zinc-100 bg-zinc-50/80 flex items-center gap-1.5 shrink-0">
            <Search size={12} className="text-zinc-400 shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search class or sem..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-0 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-0 p-0"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="p-0.5 text-zinc-400 hover:text-zinc-600 rounded cursor-pointer"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Popover Options List */}
          <div className="max-h-56 overflow-y-auto p-1.5 space-y-1.5 scrollbar-thin">
            {/* Inline Quick Create Button if cohort section is missing */}
            {suggestedCreation && (
              <div className="p-1.5 mb-1 bg-indigo-50/80 border border-indigo-200/90 rounded-lg">
                <div className="text-[10px] text-indigo-900 font-semibold mb-1 flex items-center gap-1">
                  <Sparkles size={11} className="text-indigo-600" />
                  Section not found in database
                </div>
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={handleQuickCreate}
                  className="w-full py-1.5 px-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                >
                  <Plus size={12} strokeWidth={2.5} />
                  {isCreating ? 'Creating Section...' : `+ Quick-Create "${suggestedCreation.name}" (Sem ${suggestedCreation.semester})`}
                </button>
              </div>
            )}

            {/* Suggested / Exact Match Highlight */}
            {suggestedClass && !search && (
              <div className="pb-1 mb-1 border-b border-indigo-100/70">
                <div className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                  <Sparkles size={10} className="text-indigo-500" />
                  Suggested Match
                </div>
                <button
                  type="button"
                  onClick={() => handleSelect(suggestedClass._id)}
                  className={`w-full px-2 py-1 rounded-md text-xs flex items-center justify-between text-left transition-colors cursor-pointer ${
                    value === suggestedClass._id
                      ? 'bg-indigo-50/90 text-indigo-950 font-bold'
                      : 'hover:bg-indigo-50/40 text-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="font-bold text-navy truncate">{suggestedClass.name}</span>
                    <span className="text-[10px] text-indigo-600 bg-indigo-100/70 px-1 py-0.2 rounded font-mono font-medium">
                      Sem {suggestedClass.semester}
                    </span>
                  </div>
                  {value === suggestedClass._id && <Check size={12} className="text-indigo-600 shrink-0" />}
                </button>
              </div>
            )}

            {/* Department Cohorts */}
            {sameDeptClasses.length > 0 && (
              <div>
                <div className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                  <Building2 size={10} />
                  Department Cohorts
                </div>
                {sameDeptClasses.map((c) => {
                  const isSelected = value === c._id;
                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => handleSelect(c._id)}
                      className={`w-full px-2 py-1 rounded-md text-xs flex items-center justify-between text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-950 font-bold'
                          : 'hover:bg-zinc-100 text-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold truncate">{c.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">Sem {c.semester}</span>
                      </div>
                      {isSelected && <Check size={12} className="text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Other Classes */}
            {otherClasses.length > 0 && (
              <div className={sameDeptClasses.length > 0 ? 'pt-1 border-t border-zinc-100' : ''}>
                <div className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                  <GraduationCap size={10} />
                  {sameDeptClasses.length > 0 ? 'Other Classes' : 'All Classes'}
                </div>
                {otherClasses.map((c) => {
                  const isSelected = value === c._id;
                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => handleSelect(c._id)}
                      className={`w-full px-2 py-1 rounded-md text-xs flex items-center justify-between text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-950 font-bold'
                          : 'hover:bg-zinc-100 text-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium truncate text-zinc-700">{c.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">Sem {c.semester}</span>
                      </div>
                      {isSelected && <Check size={12} className="text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {sameDeptClasses.length === 0 && otherClasses.length === 0 && (
              <div className="py-4 text-center text-xs text-zinc-400">
                No classes match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassPickerCombobox;
