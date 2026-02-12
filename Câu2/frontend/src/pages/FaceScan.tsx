import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Camera, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

const FaceScan = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { loginWithFace } = useAuth();
  const navigate = useNavigate();

  // Khởi động camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('Không thể truy cập camera');
      }
    };

    startCamera();

    return () => {
      // Cleanup: tắt camera khi unmount
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Capture ảnh từ video
  const captureImage = async (): Promise<File | null> => {
    if (!videoRef.current) return null;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });
        resolve(file);
      }, 'image/jpeg', 0.95);
    });
  };

  // Xử lý quét mặt
  const handleScan = async () => {
    setScanning(true);
    setError(null);

    const file = await captureImage();
    if (!file) {
      setError('Không thể chụp ảnh từ camera');
      setScanning(false);
      return;
    }

    try {
      // Lấy user_id từ localStorage
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.id;

      if (!userId) {
        // Nếu chưa login, dùng endpoint login-face (search toàn bộ DB)
        console.log('📍 Chế độ: LOGIN - Search toàn bộ DB');
        const success = await loginWithFace(file);
        if (success) {
          setSuccess(true);
          setTimeout(() => {
            navigate('/dashboard');
          }, 1500);
        } else {
          setError('Khuôn mặt không khớp hoặc lỗi hệ thống');
        }
      } else {
        // Nếu đã login, dùng endpoint check-in-face-verify (so khớp trực tiếp với user này)
        console.log('📍 Chế độ: CHECK-IN - So khớp trực tiếp với user:', userId);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', userId);

        const response = await fetch('http://localhost:8000/check-in-face-verify', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (response.ok && data.success) {
          console.log('✅ Xác nhận face thành công!', data);
          setSuccess(true);
          setTimeout(() => {
            navigate('/dashboard');
          }, 1500);
        } else {
          console.log('❌ Xác nhận face thất bại:', data);
          setError(data.detail || 'Khuôn mặt không khớp');
        }
      }
    } catch (err: any) {
      console.error('❌ Lỗi:', err);
      setError(err.message || 'Lỗi khi nhận diện khuôn mặt');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-slide-up">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </button>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold gradient-text">Nhận diện khuôn mặt</h1>
          <p className="text-muted-foreground mt-1">Đưa khuôn mặt vào khung hình để điểm danh / đăng nhập</p>
        </div>

        <div className="glass-card p-4 space-y-4">
          <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-secondary border-2 border-border">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            />

            <div
              className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-500 ${
                success
                  ? 'border-success shadow-[0_0_30px_hsl(152_70%_45%/0.5)]'
                  : scanning
                  ? 'border-primary animate-pulse shadow-[0_0_20px_hsl(185_80%_45%/0.4)]'
                  : 'border-muted-foreground/50'
              }`}
            >
              <div className="w-56 h-72 rounded-[50%] border-4 border-dashed" />
            </div>

            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
              </div>
            )}

            {success && (
              <div className="absolute inset-0 flex items-center justify-center bg-success/20 animate-fade-in pointer-events-none">
                <CheckCircle2 className="w-24 h-24 text-success" />
              </div>
            )}

            <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
              <span
                className={`text-sm font-medium px-5 py-2 rounded-full ${
                  success
                    ? 'bg-success/30 text-success'
                    : scanning
                    ? 'bg-primary/30 text-primary animate-pulse'
                    : error
                    ? 'bg-destructive/30 text-destructive'
                    : 'bg-secondary/80 text-muted-foreground'
                }`}
              >
                {success
                  ? '✓ Nhận diện thành công!'
                  : scanning
                  ? 'Đang nhận diện...'
                  : error
                  ? error
                  : 'Sẵn sàng quét khuôn mặt'}
              </span>
            </div>
          </div>

          <button
            onClick={handleScan}
            disabled={scanning || success}
            className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Đang xử lý...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-5 h-5" /> Đã xác nhận
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" /> Bắt đầu quét
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaceScan;