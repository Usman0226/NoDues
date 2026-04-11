import React from 'react';

const variants = {
  primary: 'bg-navy text-white hover:bg-navy/90 shadow-lg shadow-navy/20',
  secondary: 'bg-white text-navy border border-muted hover:border-navy/30 hover:shadow-md',
  accent: 'bg-gold text-white hover:bg-gold/90 shadow-lg shadow-gold/20',
  danger: 'bg-status-rejected text-white hover:bg-status-rejected/90',
  ghost: 'bg-transparent text-navy hover:bg-navy/5',
};

const sizes = {
  sm: 'px-4 py-1.5 text-xs',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-8 py-3 text-base',
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
        inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium
        uppercase tracking-widest transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.97] cursor-pointer
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {loading && (
        <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
      )}
      {children}
    </button>
  );
};

export default Button;
