import React from 'react';
import { CheckCircle, Clock, AlertTriangle, Shield } from 'lucide-react';
import { STATUSES } from '../../utils/constants';

const CHIPS_CONFIG = {
  [STATUSES.CLEARED]: { 
    label: 'Cleared', 
    icon: CheckCircle, 
    color: 'text-emerald-700', 
    bg: 'bg-emerald-50/60' 
  },
  [STATUSES.PENDING]: { 
    label: 'Pending', 
    icon: Clock, 
    color: 'text-amber-700', 
    bg: 'bg-amber-50/60' 
  },
  [STATUSES.HAS_DUES]: { 
    label: 'Has Dues', 
    icon: AlertTriangle, 
    color: 'text-red-700', 
    bg: 'bg-red-50/60' 
  },
  [STATUSES.HOD_OVERRIDE]: { 
    label: 'Overrides', 
    icon: Shield, 
    color: 'text-blue-700', 
    bg: 'bg-blue-50/60' 
  },
};

const BatchSummaryChips = ({ counts = {} }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {Object.entries(CHIPS_CONFIG).map(([key, config]) => {
        const Icon = config.icon;
        const count = counts[key] ?? 0;
        return (
          <div key={key} className={`${config.bg} rounded-xl p-6 border border-white/40 shadow-sm transition-academic hover:shadow-md`}>
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-lg ${config.bg.replace('/60', '')} flex items-center justify-center border border-current/10`}>
                <Icon size={20} className={config.color} />
              </div>
              <div>
                <p className={`text-2xl font-black ${config.color} tracking-tight leading-none mb-1`}>{count.toLocaleString()}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black opacity-80">{config.label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BatchSummaryChips;
