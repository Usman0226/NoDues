const getApiUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  // If it's a relative URL like "/api", we need the full origin for EventSource in some contexts
  // or it might be proxied via Vercel (which buffers).
  return apiUrl;
};

// Use VITE_SSE_URL if you need to bypass a buffering proxy (like Vercel Rewrites)
// Example: VITE_SSE_URL=https://api.yourdomain.com/api
const SSE_BASE = import.meta.env.VITE_SSE_URL || getApiUrl();

export const getBatchSSEUrl = (batchId) => `${SSE_BASE}/sse/batch/${batchId}`;
export const getDepartmentSSEUrl = (deptId) => `${SSE_BASE}/sse/department/${deptId}`;
export const getSSEConnectUrl = () => `${SSE_BASE}/sse/connect`;