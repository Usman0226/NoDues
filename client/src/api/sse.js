/**
 * SSE endpoint generators for real-time updates.
 * §9 Real-time awareness: dashboard metrics and dues flags.
 */
const SSE_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const getBatchSSEUrl = (batchId) => `${SSE_BASE}/sse/batch/${batchId}`;
export const getDepartmentSSEUrl = (deptId) => `${SSE_BASE}/sse/department/${deptId}`;

// Standard global connection
export const getSSEConnectUrl = () => `${SSE_BASE}/sse/connect`;
