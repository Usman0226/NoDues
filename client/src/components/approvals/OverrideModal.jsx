import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Shield } from 'lucide-react';

const OverrideModal = ({ isOpen, onClose, student = {}, onConfirm }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Override Confirmation" size="sm">
      <div className="text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-status-override/10 flex items-center justify-center mx-auto">
          <Shield size={28} className="text-status-override" />
        </div>
        <div>
          <h4 className="font-serif text-lg text-navy mb-1">Override Due Status</h4>
          <p className="text-sm text-muted-foreground">
            You are about to override the due status for <strong className="text-navy">{student.name}</strong>.
            This action will be logged and cannot be undone.
          </p>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="accent" size="sm" onClick={onConfirm}>Confirm Override</Button>
        </div>
      </div>
    </Modal>
  );
};

export default OverrideModal;
