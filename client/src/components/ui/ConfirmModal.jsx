import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { AlertCircle } from 'lucide-react';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, description, confirmText = 'Confirm', isDestructive = false, loading = false }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="flex flex-col items-center text-center px-4 pb-4">
        <div className={`p-4 rounded-full mb-6 ${isDestructive ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
          <AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-black text-zinc-900 tracking-tight mb-2">{title}</h3>
        <p className="text-sm text-zinc-500 font-semibold mb-8 max-w-sm leading-relaxed">{description}</p>
        
        <div className="flex justify-center w-full gap-3 pt-4 border-t border-zinc-100">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button 
            variant={isDestructive ? 'danger' : 'primary'} 
            onClick={onConfirm} 
            loading={loading}
            className="flex-1"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
