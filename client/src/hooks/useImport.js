import { useState, useCallback } from 'react';

const MOCK_VALID = [
  { Name: 'Arun Kumar', 'Roll No': '21CSE001', Department: 'CSE' },
  { Name: 'Priya Sharma', 'Roll No': '21CSE002', Department: 'CSE' },
  { Name: 'Deepa Nair', 'Roll No': '21CSE004', Department: 'CSE' },
];

const MOCK_ERRORS = [
  { Name: '', 'Roll No': '21CSE005', Department: 'CSE', errors: ['Missing name'], errorFields: ['Name'] },
  { Name: 'Amit P.', 'Roll No': '21CSE002', Department: 'CSE', errors: ['Duplicate roll number'], errorFields: ['Roll No'] },
  { Name: 'Sneha R.', 'Roll No': '21XYZ007', Department: 'INVALID', errors: ['Invalid department', 'Unknown student'], errorFields: ['Department', 'Roll No'] },
];

const useImport = () => {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [validRows, setValidRows] = useState([]);
  const [errorRows, setErrorRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const uploadFile = useCallback((f) => {
    setFile(f);
    if (f) {
      setLoading(true);
      // Simulate parsing delay
      setTimeout(() => {
        setValidRows(MOCK_VALID);
        setErrorRows(MOCK_ERRORS);
        setLoading(false);
        setStep(1);
      }, 1200);
    }
  }, []);

  const confirm = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(2);
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    setStep(0); setFile(null); setValidRows([]); setErrorRows([]);
  }, []);

  return { step, file, validRows, errorRows, loading, uploadFile, confirm, reset };
};

export default useImport;
