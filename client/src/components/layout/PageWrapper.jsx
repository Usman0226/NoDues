import React from 'react';

const PageWrapper = ({ children, title, subtitle }) => {
  return (
    <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-black text-navy tracking-tight mb-1">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">
              {subtitle}
            </p>
          )}
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};

export default PageWrapper;
