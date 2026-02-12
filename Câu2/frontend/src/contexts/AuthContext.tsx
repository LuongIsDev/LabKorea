import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Employee } from '@/data/mockData';

interface AuthContextType {
  user: Employee | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    name: string,
    password: string,
    role?: string,
    department?: string
  ) => Promise<boolean>;
  loginWithFace: (file: File) => Promise<boolean>;
  reloadUser: () => Promise<void>;
  updateUser: (userData: any) => void;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<Employee | null>(null);

  // 🔥 Load user từ localStorage khi app start
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const saveUser = (userData: any) => {
    const formattedUser: Employee = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      department: userData.department || 'Chung',
      avatar: '',
      role: userData.role || 'employee',
      face_registered: userData.face_registered ?? false,
    };

    setUser(formattedUser);
    localStorage.setItem('user', JSON.stringify(formattedUser));
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('http://localhost:8000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Email hoặc mật khẩu không đúng');
      }

      const data = await res.json();
      saveUser(data.user);
      return true;
    } catch (err) {
      console.error('Login error:', err);
      return false;
    }
  };

  const register = async (
    email: string,
    name: string,
    password: string,
    role: string = 'employee',
    department: string = 'Chung'
  ): Promise<boolean> => {
    try {
      const res = await fetch('http://localhost:8000/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, role, department }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Đăng ký thất bại');
      }

      const data = await res.json();
      saveUser(data.user);
      return true;
    } catch (err) {
      console.error('Register error:', err);
      return false;
    }
  };

  const loginWithFace = async (file: File): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('http://localhost:8000/login-face', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Đăng nhập khuôn mặt thất bại');
      }

      const data = await res.json();
      saveUser(data.user);
      return true;
    } catch (err) {
      console.error('Face login error:', err);
      return false;
    }
  };

  const reloadUser = async (): Promise<void> => {
    if (!user?.id) return;
    
    try {
      // Gọi API để lấy user data mới nhất
      const res = await fetch(`http://localhost:8000/check-face/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        // Cập nhật face_registered trong user hiện tại
        if (user) {
          const updatedUser = {
            ...user,
            face_registered: data.face_registered
          };
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      }
    } catch (err) {
      console.error('Error reloading user:', err);
    }
  };

  const updateUser = (userData: any) => {
    // Cập nhật user data từ bất kỳ nguồn nào
    saveUser(userData);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        loginWithFace,
        reloadUser,
        updateUser,
        logout,
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
