import React from 'react';

const variants = {
  primary: 'bg-navy text-white hover:bg-navy/95 shadow-sm',
  secondary: 'bg-white text-navy border border-muted hover:bg-offwhite hover:border-navy/20',
  accent: 'bg-gold text-white hover:bg-gold/95 shadow-sm',
  danger: 'bg-status-due-marked text-white hover:bg-status-due-marked/95 shadow-sm',
  ghost: 'bg-transparent text-navy hover:bg-navy/5',
};

const sizes = {
  sm: 'px-4 py-1.5 text-[10px]',
  md: 'px-6 py-2.5 text-xs',
  lg: 'px-8 py-3 text-sm',
};

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  ...props
}) => {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-full font-sans font-bold
        uppercase tracking-[0.1em] transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98] cursor-pointer
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {loading && (
        <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
      )}
      {children}
    </button>
  );
};

export default Button;
