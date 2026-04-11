import React from 'react';
import { CheckCircle, Clock, AlertTriangle, Shield } from 'lucide-react';
import { STATUSES } from '../../utils/constants';

const CHIPS_CONFIG = {
  [STATUSES.CLEARED]: { 
    label: 'Cleared', 
    icon: CheckCircle, 
    color: 'text-status-cleared', 
    bg: 'bg-status-cleared/10' 
  },
  [STATUSES.PENDING]: { 
    label: 'Pending', 
    icon: Clock, 
    color: 'text-status-pending', 
    bg: 'bg-status-pending/10' 
  },
  [STATUSES.HAS_DUES]: { 
    label: 'Has Dues', 
    icon: AlertTriangle, 
    color: 'text-status-has-dues', 
    bg: 'bg-status-has-dues/10' 
  },
  [STATUSES.HOD_OVERRIDE]: { 
    label: 'Overrides', 
    icon: Shield, 
    color: 'text-status-hod-override', 
    bg: 'bg-status-hod-override/10' 
  },
};

const BatchSummaryChips = ({ counts = {} }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Object.entries(CHIPS_CONFIG).map(([key, config]) => {
        const Icon = config.icon;
        const count = counts[key] ?? 0;
        return (
          <div key={key} className={`${config.bg} rounded-2xl p-5 border border-transparent hover:border-current/10 transition-all shadow-sm`}>
            <div className="flex items-center gap-4">
              <div className={`h-10 w-10 rounded-xl ${config.bg.replace('/10', '/20')} flex items-center justify-center`}>
                <Icon size={20} className={config.color} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${config.color}`}>{count.toLocaleString()}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">{config.label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BatchSummaryChips;
