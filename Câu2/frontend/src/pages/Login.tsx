import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, Scan, ArrowRight, Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(email.trim(), password);

    setLoading(false);

    if (success) {
      navigate('/dashboard');
    } else {
      setError('Email hoặc mật khẩu không đúng');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 glow-border mb-4">
            <Scan className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">AttendAI</h1>
          <p className="text-muted-foreground mt-2">Hệ thống điểm danh thông minh</p>
        </div>

        {/* Form */}
        <div className="glass-card p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@company.com"
                  className="w-full h-11 pl-10 pr-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-10 pr-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && <p className="text-destructive text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Đang đăng nhập...
                </>
              ) : (
                <>
                  Đăng nhập <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">hoặc</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/face-scan')}
            disabled={loading}
            className="w-full h-11 rounded-lg border border-primary/30 text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/10 transition-all disabled:opacity-50"
          >
            <Scan className="w-4 h-4" /> Đăng nhập bằng khuôn mặt
          </button>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Đăng ký
            </Link>
          </p>
        </div>

        {/* Hint cập nhật */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Sử dụng email và mật khẩu đã đăng ký. Admin: phuc.bui@company.com (nếu có trong DB)
        </p>
      </div>
    </div>
  );
};

export default Login;