export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  avatar: string;
  role: 'employee' | 'admin';
  face_registered?: boolean;
}

export interface AttendanceRecord {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'present' | 'absent' | 'late' | 'leave';
  lateMinutes?: number;
}

export interface DailyStats {
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
}

export const mockEmployees: Employee[] = [
  { id: '1', name: 'Nguyễn Văn An', email: 'an.nguyen@company.com', department: 'Kỹ thuật', avatar: '', role: 'employee' },
  { id: '2', name: 'Trần Thị Bình', email: 'binh.tran@company.com', department: 'Marketing', avatar: '', role: 'employee' },
  { id: '3', name: 'Lê Hoàng Cường', email: 'cuong.le@company.com', department: 'Kỹ thuật', avatar: '', role: 'employee' },
  { id: '4', name: 'Phạm Minh Dũng', email: 'dung.pham@company.com', department: 'Nhân sự', avatar: '', role: 'employee' },
  { id: '5', name: 'Hoàng Thị Lan', email: 'lan.hoang@company.com', department: 'Kế toán', avatar: '', role: 'employee' },
  { id: '6', name: 'Vũ Đức Mạnh', email: 'manh.vu@company.com', department: 'Kỹ thuật', avatar: '', role: 'employee' },
  { id: '7', name: 'Đỗ Thị Ngọc', email: 'ngoc.do@company.com', department: 'Marketing', avatar: '', role: 'employee' },
  { id: '8', name: 'Bùi Quang Phúc', email: 'phuc.bui@company.com', department: 'Kỹ thuật', avatar: '', role: 'admin' },
];

export const getWeekDates = (): string[] => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};

export const generateWeeklyAttendance = (): AttendanceRecord[] => {
  const dates = getWeekDates();
  const today = new Date().toISOString().split('T')[0];
  
  return dates.map(date => {
    if (date > today) {
      return { date, checkIn: null, checkOut: null, status: 'absent' as const };
    }
    const rand = Math.random();
    if (rand < 0.65) {
      return { date, checkIn: '08:00', checkOut: '17:30', status: 'present' as const };
    } else if (rand < 0.85) {
      const lateMin = Math.floor(Math.random() * 45) + 5;
      const h = 8 + Math.floor(lateMin / 60);
      const m = lateMin % 60;
      return { date, checkIn: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, checkOut: '17:30', status: 'late' as const, lateMinutes: lateMin };
    } else if (rand < 0.93) {
      return { date, checkIn: null, checkOut: null, status: 'leave' as const };
    } else {
      return { date, checkIn: null, checkOut: null, status: 'absent' as const };
    }
  });
};

export const mockDailyStats: DailyStats = {
  totalEmployees: 8,
  present: 5,
  absent: 1,
  late: 1,
  onLeave: 1,
};

export const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
