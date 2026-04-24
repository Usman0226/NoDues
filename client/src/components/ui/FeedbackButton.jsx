import React, { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { motion } from 'framer-motion';
import FeedbackModal from '../Feedback/FeedbackModal';

const FeedbackButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-4 ring-white transition-all hover:bg-indigo-700 md:bottom-8 md:right-8"
        aria-label="Submit Feedback"
      >
        <MessageSquarePlus size={24} />
      </motion.button>

      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export default FeedbackButton;
