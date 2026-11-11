import React from 'react';

const variants = {
  primary: 'bg-navy text-white border-transparent hover:bg-navy/90 shadow-lg shadow-indigo-500/20',
  secondary: 'bg-white text-navy border-zinc-200 hover:bg-zinc-50 hover:border-indigo-300',
  accent: 'bg-gold text-zinc-900 border-transparent hover:bg-gold/90 shadow-lg shadow-amber-500/20',
  danger: 'bg-status-due-marked text-white border-transparent hover:bg-status-due-marked/90 shadow-lg shadow-red-500/20',
  ghost: 'bg-transparent text-navy border-transparent hover:bg-indigo-50 hover:text-indigo-700',
};

const sizes = {
  xs: 'h-8 px-3.5 text-[10px]',
  sm: 'h-9 px-4 text-[10px]',
  md: 'h-10 px-6 text-xs',
  lg: 'h-11 px-7 text-sm',
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
        inline-flex items-center justify-center gap-2 rounded-full font-sans font-extrabold
        uppercase tracking-[0.18em] leading-none whitespace-nowrap shrink-0
        transition-all duration-300 ease-out border
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98] cursor-pointer hover-lift
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
