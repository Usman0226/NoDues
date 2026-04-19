const SSE_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const getBatchSSEUrl = (batchId) => `${SSE_BASE}/sse/batch/${batchId}`;
export const getDepartmentSSEUrl = (deptId) => `${SSE_BASE}/sse/department/${deptId}`;
export const getSSEConnectUrl = () => `${SSE_BASE}/sse/connect`;