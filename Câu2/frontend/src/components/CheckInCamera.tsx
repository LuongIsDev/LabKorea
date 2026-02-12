import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, CheckCircle2, MapPin, Scan, Shield } from 'lucide-react';
import { checkGPSLocation, ICTU_LOCATION } from '@/lib/gps';

const API_URL = 'http://localhost:8000'; // Thay bằng URL API của bạn

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

type Step = 'gps' | 'face' | 'verifying' | 'success' | 'fail_gps' | 'fail_face';

const CheckInCamera = ({ onSuccess, onCancel }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<Step>('gps');
  const [gpsInfo, setGpsInfo] = useState<{ distance: number; coords: { latitude: number; longitude: number } } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setErrorMsg('Không thể truy cập camera');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Step 1: Check GPS
  useEffect(() => {
    if (step !== 'gps') return;
    checkGPSLocation()
      .then(result => {
        setGpsInfo({ 
          distance: result.distance,
          coords: result.coords
        });
        if (result.ok) {
          setStep('face');
          startCamera();
        } else {
          setErrorMsg(`Bạn cách trường ${result.distance}m (tối đa ${ICTU_LOCATION.radiusMeters}m)`);
          setStep('fail_gps');
        }
      })
      .catch(() => {
        setErrorMsg('Không thể xác định vị trí GPS. Vui lòng bật GPS.');
        setStep('fail_gps');
      });
  }, [step, startCamera]);

  // Capture face and verify
  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);
    
    // Chuyển canvas thành blob để upload
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8);
    });

    setStep('verifying');

    try {
      // Lấy user_id từ localStorage
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = currentUser.id;

      if (!userId) {
        setErrorMsg('Không tìm thấy user_id. Vui lòng đăng nhập lại.');
        setStep('fail_face');
        return;
      }

      console.log('🔍 Verifying face for user:', userId);

      // 🚀 Gọi API /check-in-face-verify (so khớp trực tiếp, không search DB)
      const formData = new FormData();
      formData.append('file', blob, 'face.jpg');
      formData.append('user_id', userId);

      const response = await fetch(`${API_URL}/check-in-face-verify`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('✅ Face verified! Khuôn mặt khớp với user:', userId);
        // Gọi API check-in với GPS
        await handleCheckIn(userId);
      } else {
        console.log('❌ Face verification failed:', data);
        setErrorMsg(data.detail || 'Khuôn mặt không khớp!');
        setStep('fail_face');
      }
    } catch (error) {
      console.error('Error verifying face:', error);
      setErrorMsg('Lỗi kết nối đến server!');
      setStep('fail_face');
    }
  };

  // Check-in với GPS
  const handleCheckIn = async (userId: string) => {
    try {
      const response = await fetch(`${API_URL}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          latitude: gpsInfo?.coords.latitude,
          longitude: gpsInfo?.coords.longitude,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStep('success');
        stopCamera();
        // Không cần setTimeout nữa vì user sẽ click nút
      } else {
        setErrorMsg(data.detail || 'Lỗi khi check-in!');
        setStep('fail_face');
      }
    } catch (error) {
      console.error('Error checking in:', error);
      setErrorMsg('Lỗi kết nối đến server!');
      setStep('fail_face');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-bold text-lg">Điểm danh</h2>
        <button onClick={() => { stopCamera(); onCancel(); }} className="p-2 rounded-lg hover:bg-secondary">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6 w-full">
          {[
            { label: 'GPS', icon: MapPin, done: step !== 'gps' && step !== 'fail_gps' },
            { label: 'Khuôn mặt', icon: Camera, done: step === 'success' || step === 'verifying' },
            { label: 'Xác nhận', icon: CheckCircle2, done: step === 'success' },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s.done ? 'bg-success text-success-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
                <s.icon className="w-4 h-4" />
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">{s.label}</span>
              {i < 2 && <div className={`flex-1 h-0.5 rounded ${s.done ? 'bg-success' : 'bg-secondary'}`} />}
            </div>
          ))}
        </div>

        {/* GPS checking */}
        {step === 'gps' && (
          <div className="text-center space-y-4 animate-fade-in">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="w-10 h-10 text-primary animate-pulse" />
            </div>
            <p className="font-semibold">Đang kiểm tra vị trí GPS...</p>
            <p className="text-sm text-muted-foreground">Xác minh bạn đang ở {ICTU_LOCATION.name}</p>
          </div>
        )}

        {/* GPS fail */}
        {step === 'fail_gps' && (
          <div className="text-center space-y-4 animate-fade-in">
            <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
              <MapPin className="w-10 h-10 text-destructive" />
            </div>
            <p className="font-semibold text-destructive">Không đúng vị trí!</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <p className="text-xs text-muted-foreground">Yêu cầu: {ICTU_LOCATION.name}</p>
            <div className="flex gap-3">
              <button onClick={() => setStep('gps')} className="flex-1 h-10 rounded-lg bg-secondary text-foreground font-medium hover:bg-secondary/80">
                Thử lại
              </button>
              <button onClick={() => { stopCamera(); onCancel(); }} className="flex-1 h-10 rounded-lg border border-border text-muted-foreground font-medium hover:bg-secondary">
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* Face scanning */}
        {(step === 'face' || step === 'verifying') && (
          <div className="w-full space-y-4 animate-fade-in">
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-secondary">
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
              
              {/* Face frame */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-44 h-56 rounded-[50%] border-2 transition-all duration-500 ${
                  step === 'verifying' ? 'border-primary animate-pulse shadow-[0_0_25px_hsl(185_80%_45%/0.4)]' : 'border-muted-foreground/40'
                }`} />
              </div>

              {/* GPS badge */}
              {gpsInfo && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/20 text-success text-xs font-medium">
                  <MapPin className="w-3 h-3" /> GPS OK ({gpsInfo.distance}m)
                </div>
              )}

              {step === 'verifying' && (
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <span className="px-3 py-1.5 rounded-full bg-primary/20 text-primary text-sm font-medium">
                    <Scan className="w-3.5 h-3.5 inline mr-1 animate-spin" /> Đang xác minh...
                  </span>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {step === 'face' && (
              <button onClick={handleCapture} className="w-full h-12 rounded-xl check-in-btn flex items-center justify-center gap-2">
                <Camera className="w-5 h-5" /> Chụp & Xác minh khuôn mặt
              </button>
            )}
          </div>
        )}

        {/* Face fail */}
        {step === 'fail_face' && (
          <div className="text-center space-y-4 animate-fade-in">
            <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-destructive" />
            </div>
            <p className="font-semibold text-destructive">Xác minh thất bại!</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="flex gap-3">
              <button onClick={() => { setStep('face'); startCamera(); }} className="flex-1 h-10 rounded-lg bg-secondary text-foreground font-medium hover:bg-secondary/80">
                Thử lại
              </button>
              <button onClick={() => { stopCamera(); onCancel(); }} className="flex-1 h-10 rounded-lg border border-border text-muted-foreground font-medium hover:bg-secondary">
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="text-center space-y-4 animate-scale-in">
            <div className="w-24 h-24 mx-auto rounded-full bg-success/10 flex items-center justify-center glow-border" style={{ borderColor: 'hsl(var(--success) / 0.4)', boxShadow: '0 0 30px hsl(152 70% 45% / 0.3)' }}>
              <CheckCircle2 className="w-12 h-12 text-success" />
            </div>
            <p className="text-xl font-bold text-success">Điểm danh thành công!</p>
            <p className="text-sm text-muted-foreground">GPS ✓ | Khuôn mặt ✓</p>
            
            <button 
              onClick={() => onSuccess()}
              className="w-full mt-6 h-12 rounded-xl bg-success text-success-foreground font-medium hover:bg-success/90 transition-all"
            >
              Quay lại trang chủ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckInCamera;