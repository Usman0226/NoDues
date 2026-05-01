import React, { useState, useEffect, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { 
  Star, 
  MessageSquare, 
  Trash2, 
  CheckCircle2, 
  Clock,
  Filter,
  User,
  Monitor,
  AlertCircle,
  Inbox
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getFeedback, updateFeedback, deleteFeedback } from '../../api/feedback';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { ROLES } from '../../utils/constants';

const FeedbackReview = () => {
  const { user } = useAuth();
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [rating, setRating] = useState('');
  
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const queryParams = useMemo(() => ({
    page,
    limit,
    rating
  }), [page, limit, rating]);

  const { data: response, loading, error, request: fetchFeedback } = useApi(getFeedback, {
    queryOptions: { enabled: !!user && user.role === ROLES.ADMIN }
  });
  
  useEffect(() => {
    if (response) {
      console.log('Feedback API Response:', response);
    }
  }, [response]);

  // Ensure we handle both { data: [...] } and directly returning [...]
  const feedbackList = useMemo(() => {
    if (Array.isArray(response)) return response;
    if (response?.data && Array.isArray(response.data)) return response.data;
    return [];
  }, [response]);

  const total = useMemo(() => {
    if (Array.isArray(response)) return response.length;
    return response?.pagination?.total || 0;
  }, [response]);

  useEffect(() => {
    if (user?.role === ROLES.ADMIN) {
      fetchFeedback(queryParams);
    }
  }, [fetchFeedback, queryParams, user?.role]);

  // Strict restriction to Admin only - move after hooks
  if (!user || user.role !== ROLES.ADMIN) {
    return <Navigate to="/unauthorized" replace />;
  }

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      await updateFeedback(id, { status: newStatus });
      toast.success(`Feedback marked as ${newStatus}`);
      fetchFeedback(queryParams);
    } catch (err) {
      toast.error(err?.message || 'Failed to update feedback');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedFeedback) return;
    setSubmitting(true);
    try {
      await deleteFeedback(selectedFeedback._id);
      toast.success('Feedback deleted');
      setShowDelete(false);
      fetchFeedback(queryParams);
    } catch (err) {
      toast.error(err?.message || 'Failed to delete feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'rating',
      label: 'Rating',
      width: '120px',
      render: (v) => (
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star 
              key={star} 
              size={12} 
              className={star <= v ? 'fill-gold text-gold' : 'text-slate-200'} 
            />
          ))}
        </div>
      )
    },
    {
      key: 'description',
      label: 'Feedback',
      render: (v, row) => (
        <div className="max-w-md">
          <p className="text-xs font-medium text-navy leading-relaxed">{v}</p>
          <div className="flex items-center gap-3 mt-1 opacity-50">
             <span className="text-[9px] font-medium">{row.page}</span>
          </div>
        </div>
      )
    },
    {
      key: 'submittedBy',
      label: 'User',
      width: '200px',
      render: (v) => (
        <div className="flex flex-col">
          <span className="text-[11px] font-bold text-navy">{v?.name || 'Unknown User'}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-tight">
            {v?.role || 'N/A'} · {v?.identifier || 'N/A'}
          </span>
        </div>
      )
    },
    {
      key: 'createdAt',
      label: 'Date',
      width: '120px',
      render: (v) => {
        if (!v) return '-';
        try {
          return <span className="text-[10px] font-medium text-slate-500">{new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(v))}</span>;
        } catch {
          return '-';
        }
      }
    },
    {
      key: 'status',
      label: 'Status',
      width: '100px',
      render: (v) => <Badge status={v === 'closed' ? 'cleared' : v === 'in-review' ? 'pending' : 'default'}>{(v || 'open').toUpperCase()}</Badge>
    },
    {
      key: 'actions',
      label: '',
      width: '140px',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          {row.status !== 'closed' && (
            <button
              onClick={() => handleStatusUpdate(row._id, 'closed')}
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
              title="Mark as Resolved"
            >
              <CheckCircle2 size={16} />
            </button>
          )}
          {row.status === 'open' && (
             <button
                onClick={() => handleStatusUpdate(row._id, 'in-review')}
                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                title="Mark as In Review"
             >
                <Clock size={16} />
             </button>
          )}
          <button
            onClick={() => {
              setSelectedFeedback(row);
              setShowDelete(true);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ];

  return (
    <PageWrapper title="User Feedback" subtitle="Review system ratings and user suggestions">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">

           <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-muted shadow-sm">
              <Star size={14} className="text-slate-400" />
              <select 
                value={rating} 
                onChange={(e) => setRating(e.target.value)}
                className="text-[10px] font-black uppercase tracking-widest text-navy bg-transparent outline-none cursor-pointer"
              >
                <option value="">All Ratings</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
           </div>
        </div>

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => fetchFeedback(queryParams)}
          className="text-navy"
        >
          Refresh Feed
        </Button>
      </div>

      {error ? (
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium">{error}</p>
        </div>
      ) : feedbackList.length === 0 && !loading ? (
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
           <Inbox className="mx-auto text-slate-300 mb-4" size={48} />
           <p className="text-muted-foreground font-medium">No feedback found matching your criteria</p>
           <pre className="mt-4 text-[10px] text-left mx-auto max-w-xs bg-slate-50 p-4 rounded overflow-auto">
             {JSON.stringify(response, null, 2)}
           </pre>
        </div>
      ) : (
        <Table 
          columns={columns}
          data={feedbackList}
          loading={loading}
          pagination={{
            total,
            page,
            limit,
            onPageChange: (p) => setPage(p),
            onLimitChange: (l) => { setLimit(l); setPage(1); }
          }}
        />
      )}

      <ConfirmModal 
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Feedback"
        description="Are you sure you want to delete this feedback? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        loading={submitting}
      />
    </PageWrapper>
  );
};

export default FeedbackReview;
