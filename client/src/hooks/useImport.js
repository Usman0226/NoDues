/**
 * useImport — thin orchestrator for the multi-step import flow.
 * State is managed here; actual API calls are performed by ImportStepper
 * (which is self-contained). This hook is exported for potential reuse
 * in other import entry points.
 *
 * @deprecated Prefer using <ImportStepper type="…" classId="…" onComplete={…} />
 * directly instead of consuming this hook, unless you need programmatic control.
 */
import { useState, useCallback } from 'react';
import { previewImport, commitImport } from '../api/import';
import { toast } from 'react-hot-toast';

const useImport = (type = 'students', classId = null) => {
  const [step, setStep]       = useState(0); // 0: upload, 1: preview, 2: confirm
  const [file, setFile]       = useState(null);
  const [validRows, setValidRows]   = useState([]);
  const [errorRows, setErrorRows]   = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(false);

  /**
   * Upload and parse the file — calls backend /preview endpoint.
   */
  const uploadFile = useCallback(async (uploadedFile) => {
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setLoading(true);
    setValidRows([]);
    setErrorRows([]);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const params   = type === 'students' && classId ? { classId } : {};
      const response = await previewImport(type, formData, params);
      const data     = response?.data || response;

      setValidRows(data?.valid   || []);
      setErrorRows(data?.errors  || []);
      setSummary(data?.summary   || null);
      setStep(1);
    } catch (err) {
      toast.error(err?.message || 'Failed to parse file. Please use the provided template.');
    } finally {
      setLoading(false);
    }
  }, [type, classId]);

  /**
   * Commit valid rows to the database.
   */
  const confirm = useCallback(async (onComplete) => {
    setLoading(true);
    try {
      const payload = type === 'students'
        ? { students: validRows, classId }
        : { [type]: validRows };

      await commitImport(type, payload);
      toast.success(`${validRows.length} records committed successfully`);
      setStep(2);
      onComplete?.();
    } catch (err) {
      toast.error(err?.message || 'Commit failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [type, classId, validRows]);

  /**
   * Reset all state back to upload step.
   */
  const reset = useCallback(() => {
    setStep(0);
    setFile(null);
    setValidRows([]);
    setErrorRows([]);
    setSummary(null);
  }, []);

  return { step, file, validRows, errorRows, summary, loading, uploadFile, confirm, reset };
};

export default useImport;
