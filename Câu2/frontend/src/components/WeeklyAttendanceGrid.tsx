import { useState, useEffect } from 'react';
import { Check, X, Clock, Coffee } from 'lucide-react';

const API_URL = 'http://localhost:8000'; // Thay bằng URL API của bạn

interface AttendanceRecord {
  date: string;
  status: 'present' | 'absent' | 'late' | 'leave';
  check_in?: string;
  check_out?: string;
  late_minutes?: number;
}

interface Props {
  records?: AttendanceRecord[]; // Optional - nếu parent pass data
}

const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const statusConfig = {
  present: { icon: Check, class: 'status-present', label: 'Có mặt' },
  absent: { icon: X, class: 'status-absent', label: 'Vắng' },
  late: { icon: Clock, class: 'status-late', label: 'Muộn' },
  leave: { icon: Coffee, class: 'bg-primary/15 text-primary border border-primary/25', label: 'Nghỉ phép' },
};

// Lấy các ngày trong tuần này (T2 -> CN)
const getWeekDates = () => {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7
  const monday = new Date(today);
  
  // Tính ngày thứ 2 của tuần
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  monday.setDate(today.getDate() + diff);
  
  // Tạo mảng 7 ngày từ T2 -> CN
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
};

const WeeklyAttendanceGrid = ({ records: recordsFromProps }: Props) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(!recordsFromProps); // Nếu parent pass data thì không loading
  
  const today = new Date().toISOString().split('T')[0];
  const dates = getWeekDates();

  // Nếu parent pass records, dùng luôn. Không thì fetch từ API
  useEffect(() => {
    if (recordsFromProps) {
      console.log('📋 Using records from parent:', recordsFromProps);
      setRecords(recordsFromProps);
      setLoading(false);
      return;
    }

    // Fetch attendance từ API (fallback nếu không có prop)
    const fetchAttendance = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (!user.id) {
          setLoading(false);
          return;
        }

        const startDate = dates[0]; // Thứ 2
        const endDate = dates[6];   // Chủ nhật

        const response = await fetch(
          `${API_URL}/attendance/${user.id}?start_date=${startDate}&end_date=${endDate}`
        );
        
        if (response.ok) {
          const data = await response.json();
          
          // Chuyển đổi records từ API thành format phù hợp
          const recordsMap = new Map<string, AttendanceRecord>();
          data.records.forEach((record: any) => {
            recordsMap.set(record.date, {
              date: record.date,
              status: record.status || 'absent',
              check_in: record.check_in,
              check_out: record.check_out,
              late_minutes: record.late_minutes || 0,
            });
          });

          // Tạo mảng 7 ngày với dữ liệu từ API
          const weekRecords = dates.map(date => {
            if (recordsMap.has(date)) {
              return recordsMap.get(date)!;
            }
            // Nếu ngày trong tương lai hoặc chưa có dữ liệu
            return {
              date,
              status: 'absent' as const,
            };
          });

          setRecords(weekRecords);
        }
      } catch (error) {
        console.error('Error fetching attendance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [recordsFromProps, dates]);

  if (loading) {
    return (
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">ĐIỂM DANH TUẦN NÀY</h3>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">ĐIỂM DANH TUẦN NÀY</h3>
      <div className="grid grid-cols-7 gap-2">
        {dayNames.map((day, i) => (
          <div key={day} className="text-center">
            <span className="text-xs text-muted-foreground font-medium">{day}</span>
            <div className="mt-1.5">
              {(() => {
                const record = records[i];
                const date = dates[i];
                
                // Nếu là ngày tương lai
                if (date > today) {
                  return (
                    <div className="w-10 h-10 mx-auto rounded-lg bg-secondary/50 flex items-center justify-center">
                      <span className="text-muted-foreground/30 text-xs">—</span>
                    </div>
                  );
                }
                
                // Nếu không có record hoặc status là absent
                if (!record || !record.check_in) {
                  const cfg = statusConfig.absent;
                  const Icon = cfg.icon;
                  return (
                    <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center ${cfg.class}`} title={cfg.label}>
                      <Icon className="w-4 h-4" />
                    </div>
                  );
                }
                
                // Có record và có check_in
                const cfg = statusConfig[record.status];
                const Icon = cfg.icon;
                return (
                  <div 
                    className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center ${cfg.class}`} 
                    title={`${cfg.label}${record.check_in ? ` - ${record.check_in}` : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                );
              })()}
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 block">
              {new Date(dates[i]).getDate()}/{new Date(dates[i]).getMonth() + 1}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded flex items-center justify-center ${cfg.class}`}>
              <cfg.icon className="w-3 h-3" />
            </div>
            <span className="text-xs text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeeklyAttendanceGrid;