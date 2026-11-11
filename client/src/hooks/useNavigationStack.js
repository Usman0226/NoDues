import { useContext } from 'react';
import { NavigationStackContext } from '../context/NavigationStackContext';

export const useNavigationStack = () => {
  const context = useContext(NavigationStackContext);
  if (!context) {
    throw new Error('useNavigationStack must be used within a NavigationStackProvider');
  }
  return context;
};

export default useNavigationStack;
