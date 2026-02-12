import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import WeeklyAttendanceGrid from '@/components/WeeklyAttendanceGrid';
import CheckInCamera from '@/components/CheckInCamera';
import { generateWeeklyAttendance } from '@/data/mockData';
import {
  MapPin, LogOut, Clock, CalendarDays,
  CheckCircle2, XCircle, AlertTriangle, LayoutDashboard, UserCircle, Camera
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface TodayAttendance {
  check_in?: string;
  check_out?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
}

const EmployeeDashboard = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkInLocation, setCheckInLocation] = useState<string>('Phòng Hải, Quảng Yên');
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weeklyRecords] = useState(() => generateWeeklyAttendance());
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(true);

  // ✅ CHECK DỰA VÀO DATABASE
  const hasFace = user?.face_registered === true;

  // Lấy ngày hôm nay theo định dạng YYYY-MM-DD (local time)
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Load dữ liệu attendance từ API
  useEffect(() => {
    console.log('🚀 Component mounted');
    console.log('🔧 API_URL:', API_URL);
    console.log('👤 User:', user);
    
    if (!user) {
      console.log('❌ No user found, redirecting to login');
      navigate('/login');
      return;
    }

    fetchTodayAttendance();

    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, [user, navigate]);

  // Fetch attendance hôm nay từ database
  const fetchTodayAttendance = async () => {
    if (!user?.id) {
      console.log('❌ No user ID, skipping fetch');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const today = getTodayDate();
      const url = `${API_URL}/attendance/${user.id}?start_date=${today}&end_date=${today}`;
      console.log('🔍 Fetching attendance from:', url);
      
      const response = await fetch(url);
      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📦 Received data:', data);
        
        if (data.records && data.records.length > 0) {
          const todayRecord = data.records[0];
          console.log('📋 Today record:', todayRecord);
          
          if (todayRecord.check_in) {
            console.log('✅ Found check-in:', todayRecord.check_in);
            setCheckInTime(todayRecord.check_in);
            setCheckedIn(true);
            
            // Tạo tên địa điểm từ GPS nếu có
            if (todayRecord.latitude && todayRecord.longitude) {
              const location = `Phòng Hải (${todayRecord.latitude.toFixed(4)}, ${todayRecord.longitude.toFixed(4)})`;
              console.log('📍 Setting location:', location);
              setCheckInLocation(location);
            }
          }
          
          if (todayRecord.check_out) {
            console.log('✅ Found check-out:', todayRecord.check_out);
            setCheckOutTime(todayRecord.check_out);
          }
        } else {
          console.log('ℹ️ No attendance records found for today');
        }
      } else {
        const errorData = await response.json();
        console.error('❌ API error:', errorData);
      }
    } catch (error) {
      console.error('❌ Error fetching attendance:', error);
    } finally {
      setLoading(false);
      console.log('✓ Loading finished');
    }
  };

  // ✅ SỬED: Chỉ reload dữ liệu, không gọi /check-in lại
  const handleCheckInSuccess = async (locationData?: { name: string; latitude?: number; longitude?: number }) => {
    if (!user?.id) {
      console.log('❌ No user ID for check-in');
      return;
    }
    
    try {
      console.log('✅ Check-in successful from camera');
      console.log('🔄 Reloading attendance data from server...');
      
      // CheckInCamera đã gọi /check-in API xong
      // Chỉ cần reload dữ liệu từ server để update UI
      setShowCamera(false);
      
      // Wait 500ms để server cập nhật dữ liệu
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload attendance để đồng bộ UI với database
      await fetchTodayAttendance();
      
      console.log('✅ UI updated with latest data from server');
    } catch (error) {
      console.error('❌ Error updating UI:', error);
    }
  };

  const handleCheckOut = async () => {
    if (!user?.id) return;
    
    try {
      const response = await fetch(`${API_URL}/check-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCheckOutTime(data.check_out);
      } else {
        const error = await response.json();
        alert(error.detail || 'Lỗi khi check-out');
      }
    } catch (error) {
      console.error('Error during check-out:', error);
      alert('Không thể kết nối với server');
    }
  };

  if (!user) return null;

  const stats = {
    present: weeklyRecords.filter((r) => r.status === 'present').length,
    late: weeklyRecords.filter((r) => r.status === 'late').length,
    absent: weeklyRecords.filter((r) => r.status === 'absent').length,
  };

  const totalLateMinutes = weeklyRecords.reduce(
    (sum, r) => sum + (r.lateMinutes || 0),
    0
  );

  return (
    <div className="min-h-screen bg-background">
      {showCamera && (
        <CheckInCamera
          onSuccess={handleCheckInSuccess}
          onCancel={() => setShowCamera(false)}
        />
      )}

      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold gradient-text">AttendAI</h1>
            <p className="text-xs text-muted-foreground">
              {user.department}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
                title="Admin"
              >
                <LayoutDashboard className="w-5 h-5 text-primary" />
              </button>
            )}

            <button
              onClick={() => navigate('/face-register')}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              title="Đăng ký khuôn mặt"
            >
              <UserCircle className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4 pb-8">
        {/* Greeting + Clock */}
        <div className="glass-card p-5">
          <p className="text-muted-foreground text-sm">Xin chào,</p>
          <h2 className="text-xl font-bold">{user.name}</h2>

          <div className="mt-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <span className="font-mono text-2xl font-bold gradient-text">
              {currentTime.toLocaleTimeString('vi-VN')}
            </span>
          </div>

          <p className="text-xs text-muted-foreground mt-1">
            <CalendarDays className="w-3 h-3 inline mr-1" />
            {currentTime.toLocaleDateString('vi-VN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* ✅ CHỈ HIỆN KHI CHƯA CÓ FACE TRONG DATABASE */}
        {!hasFace && (
          <button
            onClick={() => navigate('/face-register')}
            className="w-full glass-card p-4 flex items-center gap-3 border-warning/30 hover:bg-warning/5 transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-warning/10">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                Chưa đăng ký khuôn mặt
              </p>
              <p className="text-xs text-muted-foreground">
                Nhấn để đăng ký ngay để sử dụng điểm danh
              </p>
            </div>
          </button>
        )}

        {/* Check In/Out */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" /> Điểm danh
            </h3>
            {!checkedIn && (
              <div className="flex items-center gap-1.5 text-xs">
                <MapPin className="w-3 h-3" />
                <span className="text-muted-foreground">Phòng Hải</span>
              </div>
            )}
          </div>

          {/* ✅ Hiển thị location đầy đủ sau khi check-in */}
          {checkedIn && (
            <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Địa điểm check-in</p>
                  <p className="text-sm font-medium text-primary">{checkInLocation}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                Check-in
              </p>
              <p className="font-mono font-bold text-lg">
                {checkInTime || '--:--'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                Check-out
              </p>
              <p className="font-mono font-bold text-lg">
                {checkOutTime || '--:--'}
              </p>
            </div>
          </div>

          {!checkedIn && (
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Yêu cầu: GPS tại Phòng Hải + Nhận diện khuôn mặt
            </p>
          )}

          {loading && !checkedIn && (
            <div className="w-full h-12 rounded-xl bg-secondary/50 flex items-center justify-center gap-2 text-muted-foreground mb-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
              <span className="text-sm">Đang tải dữ liệu...</span>
            </div>
          )}

          {!checkedIn ? (
            <button
              onClick={() => setShowCamera(true)}
              disabled={loading}
              className="w-full h-12 rounded-xl check-in-btn flex items-center justify-center gap-2 text-base disabled:opacity-50"
            >
              <Camera className="w-5 h-5" /> 
              {loading ? 'Đang tải...' : 'Check-in (Camera + GPS)'}
            </button>
          ) : !checkOutTime ? (
            <button
              onClick={handleCheckOut}
              className="w-full h-12 rounded-xl check-out-btn flex items-center justify-center gap-2 text-base"
            >
              <XCircle className="w-5 h-5" /> Check-out
            </button>
          ) : (
            <div className="w-full h-12 rounded-xl bg-success/10 flex items-center justify-center gap-2 text-success font-semibold">
              <CheckCircle2 className="w-5 h-5" /> Đã hoàn tất điểm danh hôm nay
            </div>
          )}
        </div>

        <WeeklyAttendanceGrid records={weeklyRecords} />
      </main>
    </div>
  );
};

export default EmployeeDashboard;