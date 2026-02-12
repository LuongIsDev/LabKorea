import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User, Mail, Lock, Building, ArrowRight, Scan, Loader2 } from 'lucide-react';

const Register = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const success = await register(
      form.email.trim(),
      form.name.trim(),
      form.password,
      'employee',
      form.department.trim()
    );

    setLoading(false);

    if (success) {
      navigate('/dashboard'); // hoặc '/login' nếu không auto login
    } else {
      setError('Đăng ký thất bại. Email có thể đã tồn tại hoặc lỗi hệ thống.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 glow-border mb-4">
            <Scan className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Đăng ký</h1>
          <p className="text-muted-foreground mt-2">Tạo tài khoản nhân viên mới</p>
        </div>

        <div className="glass-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { icon: User, label: 'Họ và tên', key: 'name', type: 'text', placeholder: 'Nguyễn Văn A' },
              { icon: Mail, label: 'Email', key: 'email', type: 'email', placeholder: 'email@company.com' },
              { icon: Lock, label: 'Mật khẩu', key: 'password', type: 'password', placeholder: '••••••••' },
              { icon: Building, label: 'Phòng ban', key: 'department', type: 'text', placeholder: 'Kỹ thuật' },
            ].map(({ icon: Icon, label, key, type, placeholder }) => (
              <div key={key} className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">{label}</label>
                <div className="relative">
                  <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full h-11 pl-10 pr-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    required={key !== 'department'}
                  />
                </div>
              </div>
            ))}

            {error && <p className="text-destructive text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Đang đăng ký...
                </>
              ) : (
                <>
                  Đăng ký <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Đã có tài khoản?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;