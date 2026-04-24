import { useState, useCallback } from 'react';

export const useFeedback = () => {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const openFeedback = useCallback(() => setIsFeedbackOpen(true), []);
  const closeFeedback = useCallback(() => setIsFeedbackOpen(false), []);
  const toggleFeedback = useCallback(() => setIsFeedbackOpen(prev => !prev), []);

  return {
    isFeedbackOpen,
    openFeedback,
    closeFeedback,
    toggleFeedback
  };
};
