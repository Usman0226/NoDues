import React, { useState, useRef } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';


const FileDropzone = ({
  onFileSelect,
  onFileSelected,
  accept = '.csv,.xlsx',
  label = 'Upload File',
  title,
  subtitle,
  loading = false,
  isProcessing = false,
  file: controlledFile,
  icon: Icon = Upload,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [internalFile, setInternalFile] = useState(null);
  const inputRef = useRef(null);

  const file = controlledFile !== undefined ? controlledFile : internalFile;
  const isLoading = Boolean(loading || isProcessing);
  const mainLabel = title || label;

  const emitFile = (f) => {
    setInternalFile(f);
    onFileSelect?.(f);
    onFileSelected?.(f);
  };

  const handleDrag = (e) => {
    if (isLoading) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    if (isLoading) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      emitFile(dropped);
    }
  };

  const handleChange = (e) => {
    if (isLoading) return;
    const selected = e.target.files?.[0];
    if (selected) {
      emitFile(selected);
    }
  };

  const clearFile = () => {
    if (isLoading) return;
    if (inputRef.current) inputRef.current.value = '';
    emitFile(null);
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !file && !isLoading && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200
        ${dragActive ? 'border-indigo-500 bg-indigo-50/20 scale-[1.01]' : 'border-zinc-300 hover:border-indigo-400 hover:bg-zinc-50/50'}
        ${file || isLoading ? 'cursor-default' : ''}`}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
      {isLoading ? (
        <div className="flex flex-col items-center animate-in fade-in duration-300">
          <Loader2 size={32} className="text-indigo-600 animate-spin mb-3" />
          <p className="text-sm font-bold text-navy mb-1">Analyzing Document Structure...</p>
          <p className="text-xs text-zinc-500 font-medium">Extracting section pages, semester & course schedule</p>
        </div>
      ) : !file ? (
        <>
          <Icon size={32} className={`mx-auto mb-3 ${dragActive ? 'text-indigo-600' : 'text-zinc-400'}`} />
          <p className="text-sm font-bold text-navy mb-1">{mainLabel}</p>
          <p className="text-xs text-zinc-500">
            {subtitle || `Drag & drop or click to browse · ${accept}`}
          </p>
        </>
      ) : (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-100 border border-zinc-200">
            <FileText size={18} className="text-indigo-600 shrink-0" />
            <span className="text-xs font-bold text-navy truncate max-w-xs">{file.name}</span>
            <span className="text-[11px] text-zinc-500 tabular-nums">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
          <button
            type="button"
            aria-label="Remove uploaded file"
            onClick={(e) => {
              e.stopPropagation();
              clearFile();
            }}
            className="text-xs font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
          >
            <X size={14} />
            <span>Remove</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default FileDropzone;
