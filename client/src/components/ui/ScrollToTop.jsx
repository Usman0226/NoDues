import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop - Automatically scrolls the window to top on route change.
 * This ensures that navigating to a new page doesn't inherit the scroll position of the previous one.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top of the scrollable container or window
    // In our AppLayout, we have overflow-y-auto on a div, but for many setups window scroll works too.
    // Let's target both just in case.
    window.scrollTo(0, 0);
    
    // Target the main scrollable container defined in AppLayout if it exists
    const mainContent = document.querySelector('.overflow-y-auto');
    if (mainContent) {
      mainContent.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
};

export default ScrollToTop;
