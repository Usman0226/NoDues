import React, { useState, useRef } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';


const FileDropzone = ({ onFileSelect, accept = '.csv,.xlsx', label = 'Upload File', loading = false }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    if (loading) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    if (loading) return;
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) { setFile(dropped); onFileSelect?.(dropped); }
  };

  const handleChange = (e) => {
    if (loading) return;
    const selected = e.target.files?.[0];
    if (selected) { setFile(selected); onFileSelect?.(selected); }
  };

  const clearFile = () => { if (loading) return; setFile(null); onFileSelect?.(null); };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !file && !loading && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200
        ${dragActive ? 'border-gold bg-gold/5 scale-[1.01]' : 'border-muted hover:border-navy/30 hover:bg-navy/[0.02]'}
        ${file || loading ? 'cursor-default' : ''}`}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
      {loading ? (
        <div className="flex flex-col items-center animate-in fade-in duration-300">
          <Loader2 size={32} className="text-navy animate-spin mb-3" />
          <p className="text-sm font-bold text-navy mb-1">Analyzing File...</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Parsing academic records</p>
        </div>
      ) : !file ? (
        <>
          <Upload size={32} className={`mx-auto mb-3 ${dragActive ? 'text-gold' : 'text-muted-foreground'}`} />
          <p className="text-sm font-semibold text-navy mb-1">{label}</p>
          <p className="text-xs text-muted-foreground">Drag & drop or click to browse · {accept}</p>
        </>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <FileText size={20} className="text-navy" />
          <span className="text-sm font-medium text-navy">{file.name}</span>
          <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
          <button onClick={(e) => { e.stopPropagation(); clearFile(); }} className="p-1 rounded-full hover:bg-status-rejected/10 text-status-rejected">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default FileDropzone;
