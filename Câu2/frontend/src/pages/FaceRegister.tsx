import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Trash2,
  UserCircle,
  Scan,
  Loader2,
  AlertCircle,
} from "lucide-react";

const FaceRegister = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasRegistered, setHasRegistered] = useState(false);
  const [registeredImageUrl, setRegisteredImageUrl] = useState<string | null>(
    null
  );
  const [success, setSuccess] = useState(false);

  // Redirect nếu chưa login
  useEffect(() => {
    if (!user) {
      setError("Vui lòng đăng nhập trước khi đăng ký khuôn mặt");
      setTimeout(() => navigate("/login"), 1500);
    }
  }, [user, navigate]);

  // Start camera
  useEffect(() => {
    if (!cameraActive) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setCameraReady(true);
          };
        }
      } catch (err) {
        console.error(err);
        setCameraError("Không thể truy cập camera. Kiểm tra quyền trình duyệt.");
        setCameraActive(false);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [cameraActive]);

  const startCameraHandler = () => {
    setError(null);
    setCameraError(null);
    setCameraActive(true);
  };

  const stopCamera = () => {
    setCameraActive(false);
  };

  const capture = async (): Promise<File | null> => {
    if (!videoRef.current) return null;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        resolve(new File([blob], "face_register.jpg", { type: "image/jpeg" }));
      }, "image/jpeg");
    });
  };

  const handleCaptureAndRegister = async () => {
    if (!cameraReady) return;
    if (!user?.id) {
      setError("Không tìm thấy user_id. Vui lòng đăng nhập lại.");
      return;
    }

    setCapturing(true);
    setLoading(true);
    setError(null);

    const file = await capture();
    if (!file) {
      setError("Không thể chụp ảnh");
      setCapturing(false);
      setLoading(false);
      return;
    }

    setRegisteredImageUrl(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("user_id", user.id); // 🔥 QUAN TRỌNG

      const res = await fetch("http://localhost:8000/register-face", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Đăng ký thất bại");
      }

      const data = await res.json();
      
      // Cập nhật user data nếu API trả về
      if (data.user) {
        // Cập nhật user trong context với face_registered = true
        updateUser(data.user);
      }

      setHasRegistered(true);
      setSuccess(true);
      stopCamera();

      setTimeout(() => navigate("/dashboard"), 1800);
    } catch (err: any) {
      setError(err.message || "Lỗi đăng ký khuôn mặt");
    } finally {
      setCapturing(false);
      setLoading(false);
    }
  };

  const handleDelete = () => {
    setHasRegistered(false);
    setRegisteredImageUrl(null);
    setSuccess(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => {
              stopCamera();
              navigate("/dashboard");
            }}
            className="p-2 rounded-lg hover:bg-secondary"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Đăng ký khuôn mặt</h1>
            <p className="text-xs text-muted-foreground">
              {user?.name || "Người dùng"}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-6 pb-12">
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-lg text-center">
            {error}
          </div>
        )}

        {!hasRegistered && !cameraActive && !success && (
          <div className="p-8 text-center border rounded-lg">
            <UserCircle className="w-20 h-20 mx-auto mb-4" />
            <button
              onClick={startCameraHandler}
              className="h-11 px-10 bg-primary text-white rounded-lg"
            >
              Bắt đầu đăng ký
            </button>
          </div>
        )}

        {cameraActive && (
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Scan className="w-5 h-5" /> Chụp ảnh khuôn mặt
            </h3>

            <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleCaptureAndRegister}
                disabled={loading || capturing || !cameraReady}
                className="flex-1 h-12 bg-primary text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Camera />
                )}
                {loading ? "Đang xử lý..." : "Chụp & Đăng ký"}
              </button>

              <button
                onClick={stopCamera}
                className="h-12 px-6 border rounded-xl"
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default FaceRegister;
