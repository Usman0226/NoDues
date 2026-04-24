import React from 'react';
import Modal from '../ui/Modal';
import FeedbackForm from './FeedbackForm';

const FeedbackModal = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share your thoughts"
      size="md"
    >
      <FeedbackForm onSuccess={onClose} onCancel={onClose} />
    </Modal>
  );
};

export default FeedbackModal;