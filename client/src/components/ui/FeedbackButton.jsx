import React, { useState } from 'react';
import { MessageSquarePlus, Bug, Lightbulb, HelpCircle, Send, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './Modal';
import Button from './Button';
import { useApi } from '../../hooks/useApi';
import { submitFeedback } from '../../api/feedback';
import { toast } from 'react-hot-toast';

const FeedbackButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    type: 'suggestion',
    description: ''
  });

  const { loading, request } = useApi(submitFeedback, {
    silent: true,
    onSuccess: () => {
      setIsSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsSuccess(false);
        setFormData({ type: 'suggestion', description: '' });
      }, 2000);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to submit feedback');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      toast.error('Please describe your issue or suggestion');
      return;
    }

    request({
      ...formData,
      page: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent
    });
  };

  const types = [
    { id: 'bug', label: 'Bug', icon: Bug, color: 'text-rose-500', bg: 'bg-rose-50' },
    { id: 'suggestion', label: 'Suggestion', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'other', label: 'Other', icon: HelpCircle, color: 'text-blue-500', bg: 'bg-blue-50' }
  ];

  return (
    <>
      {/* Floating Button */}
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

      <Modal
        isOpen={isOpen}
        onClose={() => !loading && setIsOpen(false)}
        title="Share your feedback"
        size="sm"
      >
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Thank You!</h3>
              <p className="mt-2 text-slate-500">Your feedback helps us make NoDues better.</p>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <div>
                <label className="mb-3 block text-sm font-semibold text-slate-700">What type of issue?</label>
                <div className="grid grid-cols-3 gap-3">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: t.id })}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 p-3 transition-all ${
                        formData.type === t.id
                          ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <t.icon size={20} className={`mb-1 ${t.color}`} />
                      <span className={`text-xs font-bold ${formData.type === t.id ? 'text-indigo-700' : 'text-slate-500'}`}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="description" className="mb-2 block text-sm font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Tell us what's on your mind..."
                  className="w-full rounded-xl border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                  disabled={loading}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setIsOpen(false)}
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
            </motion.form>
          )}
        </AnimatePresence>
      </Modal>
    </>
  );
};

export default FeedbackButton;
