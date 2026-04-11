import { useState, useCallback } from 'react';

const useBatchStatus = (initialStudents = [], initialSubjects = [], initialMap = {}) => {
  const [students] = useState(initialStudents);
  const [subjects] = useState(initialSubjects);
  const [statusMap, setStatusMap] = useState(initialMap);
  const [loading, setLoading] = useState(false);

  const updateStatus = useCallback((studentId, subjectId, newStatus) => {
    setStatusMap((prev) => ({ ...prev, [`${studentId}-${subjectId}`]: newStatus }));
  }, []);

  const getCounts = useCallback(() => {
    const values = Object.values(statusMap);
    return {
      cleared: values.filter((v) => v === 'approved').length,
      pending: values.filter((v) => v === 'pending').length,
      dues: values.filter((v) => v === 'due' || v === 'rejected').length,
      overrides: values.filter((v) => v === 'override').length,
    };
  }, [statusMap]);

  return { students, subjects, statusMap, loading, updateStatus, getCounts };
};

export default useBatchStatus;
