import React, { useState } from 'react';
import { Star, Bug, Lightbulb, Zap, MessageSquare, Send, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { useApi } from '../../hooks/useApi';
import { submitFeedback } from '../../api/feedback';
import Button from '../ui/Button';
import { toast } from 'react-hot-toast';

const categories = [
  { id: 'general', label: 'General', icon: MessageSquare, color: 'text-slate-500' },
  { id: 'ui', label: 'UI/UX', icon: Zap, color: 'text-indigo-500' },
  { id: 'bugs', label: 'Bugs', icon: Bug, color: 'text-rose-500' },
  { id: 'speed', label: 'Speed', icon: Zap, color: 'text-amber-500' },
  { id: 'feature_request', label: 'Feature', icon: Lightbulb, color: 'text-emerald-500' },
];

const FeedbackForm = ({ onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('general');
  const [description, setDescription] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const { loading, request } = useApi(submitFeedback, {
    immediate: false,
    onSuccess: () => {
      setIsSuccess(true);
      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rating === 0) return toast.error('Please select a rating');
    if (!description.trim()) return toast.error('Please provide some details');

    request({
      rating,
      category,
      description,
      page: window.location.pathname,
      userAgent: navigator.userAgent
    });
  };

  const getRoleMessage = () => {
    if (user?.role === 'student') {
      return "Help us improve your clearance experience.";
    }
    return "Help us optimize the platform to provide you an better experience.";
  }; 

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-2xl font-bold text-slate-900">Thank You!</h3>
        <p className="mt-2 text-slate-500 max-w-xs">
          Your feedback has been recorded. We're working hard to make NoDues better for you.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center">
        <p className="text-slate-500 text-sm font-medium">{getRoleMessage()}</p>
      </div>

      {/* Star Rating */}
      <div className="flex flex-col items-center gap-2">
        <label className="text-sm font-semibold text-slate-700">Overall Rating</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <motion.button
              key={star}
              type="button"
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="focus:outline-none"
            >
              <Star
                size={32}
                className={`transition-colors ${
                  star <= (hoverRating || rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-200'
                }`}
              />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-semibold text-slate-700">
          Tell us more
        </label>
        <textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What can we do better?"
          className="w-full rounded-xl border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none resize-none"
          disabled={loading}
        />
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          loading={loading}
          icon={<Send size={16} />}
        >
          Submit
        </Button>
      </div>
    </form>
  );
};

export default FeedbackForm;
