import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

// Route chỉ cho admin
export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  
  return <>{children}</>;
};

// Route chỉ cho employee
export const EmployeeRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  
  return <>{children}</>;
};

// Route yêu cầu đăng nhập (dùng chung)
export const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
};