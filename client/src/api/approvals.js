import api from './axiosInstance';

export const getPendingApprovals = (params) => api.get('/approvals/pending', { params });
export const getApprovalHistory = (params) => api.get('/approvals/history', { params });
export const approveRecord = (approvalId) => api.post('/approvals/approve', { approvalId });
export const bulkApproveRecords = (approvalIds) => api.post('/approvals/bulk-approve', { approvalIds });
export const markDueRecord = (data) => api.post('/approvals/mark-due', data);
export const updateApproval = (id, data) => api.patch(`/approvals/${id}`, data);