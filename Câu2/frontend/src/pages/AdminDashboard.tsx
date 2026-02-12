import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AttendanceRecord, dayNames, getWeekDates } from '@/data/mockData';
import {
  ArrowLeft, Users, CheckCircle2, XCircle, AlertTriangle, Coffee,
  TrendingUp, Search, ChevronRight, Check, X, Clock, Loader2,
  Calendar, Download, Filter, BarChart3, UserCheck, Edit2,
  Trash2, Eye, FileText, Settings, Plus, MapPin, Building2,
  Briefcase, Save, RefreshCw, LogOut
} from 'lucide-react';

interface EmployeeWithAttendance {
  user_id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  today_attendance?: {
    check_in?: string;
    check_out?: string;
    status: string;
    late_minutes: number;
  };
}

interface AttendanceDetail {
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  late_minutes: number;
  work_hours: number;
}

interface CompanySettings {
  work_start_time: string;
  work_end_time: string;
  office_location: {
    address: string;
    latitude: number;
    longitude: number;
    radius: number;
  };
  departments: string[];
  late_threshold: number;
  work_days: string[];
}

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'overview' | 'employees' | 'attendance' | 'reports' | 'settings'>('overview');
  const [stats, setStats] = useState({
    total_employees: 0,
    present: 0,
    late: 0,
    absent: 0,
    on_leave: 0,
    date: ''
  });
  const [employees, setEmployees] = useState<EmployeeWithAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeAttendance, setEmployeeAttendance] = useState<Record<string, AttendanceRecord[]>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<AttendanceDetail[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [filterDept, setFilterDept] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState<CompanySettings>({
    work_start_time: '08:00',
    work_end_time: '17:00',
    office_location: {
      address: 'Tòa nhà ABC, 123 Đường XYZ, Quận 1, TP.HCM',
      latitude: 10.7769,
      longitude: 106.7009,
      radius: 100
    },
    departments: ['IT', 'HR', 'Marketing', 'Sales', 'Finance'],
    late_threshold: 15,
    work_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  });
  const [newDepartment, setNewDepartment] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const statsRes = await fetch('http://localhost:8000/admin/stats');
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        const employeesRes = await fetch('http://localhost:8000/admin/employees');
        if (employeesRes.ok) {
          const employeesData = await employeesRes.json();
          setEmployees(employeesData.employees || []);
        }

        const settingsRes = await fetch('http://localhost:8000/admin/settings');
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setSettings(prev => ({ ...prev, ...settingsData }));
        }
      } catch (err) {
        console.error('Error loading admin data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const loadEmployeeAttendance = async () => {
      const weekDates = getWeekDates();
      const startDate = weekDates[0];
      const endDate = weekDates[6];
      
      const attendancePromises = employees.map(async (emp) => {
        try {
          const res = await fetch(`http://localhost:8000/attendance/${emp.user_id}?start_date=${startDate}&end_date=${endDate}`);
          if (res.ok) {
            const data: { records: any[] } = await res.json();
            const records = data.records || [];

            const recordsMap = new Map(records.map((r: any) => [r.date, r]));
            const weekly = weekDates.map(date => {
              const record = recordsMap.get(date);
              if (record) {
                return {
                  date,
                  checkIn: record.check_in || null,
                  checkOut: record.check_out || null,
                  status: record.status || 'absent',
                  lateMinutes: record.late_minutes || 0
                } as AttendanceRecord;
              }
              return {
                date,
                checkIn: null,
                checkOut: null,
                status: date > new Date().toISOString().split('T')[0] ? 'absent' : 'absent'
              } as AttendanceRecord;
            });
            return { userId: emp.user_id, weekly };
          }
        } catch (err) {
          console.error(`Error loading attendance for ${emp.user_id}:`, err);
        }
        return null;
      });

      const results = await Promise.all(attendancePromises);
      const attendanceMap: Record<string, AttendanceRecord[]> = {};
      results.forEach(result => {
        if (result) {
          attendanceMap[result.userId] = result.weekly;
        }
      });
      setEmployeeAttendance(attendanceMap);
    };

    if (employees.length > 0) {
      loadEmployeeAttendance();
    }
  }, [employees]);

  useEffect(() => {
    const loadEmployeeDetails = async () => {
      if (!selectedEmployee) return;
      
      const weekDates = getWeekDates();
      const startDate = dateRange.start || weekDates[0];
      const endDate = dateRange.end || weekDates[6];

      try {
        const res = await fetch(`http://localhost:8000/attendance/${selectedEmployee}?start_date=${startDate}&end_date=${endDate}`);
        if (res.ok) {
          const data: { records: any[] } = await res.json();
          const records = data.records || [];

          const details: AttendanceDetail[] = records.map((r: any) => ({
            date: r.date,
            check_in: r.check_in,
            check_out: r.check_out,
            status: r.status,
            late_minutes: r.late_minutes || 0,
            work_hours: r.work_hours || 0
          }));
          setEmployeeDetails(details);
        }
      } catch (err) {
        console.error('Error loading employee details:', err);
      }
    };

    loadEmployeeDetails();
  }, [selectedEmployee, dateRange]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('http://localhost:8000/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        alert('✅ Lưu cài đặt thành công!');
      } else {
        alert('❌ Lưu cài đặt thất bại!');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('❌ Lỗi khi lưu cài đặt!');
    } finally {
      setSaving(false);
    }
  };

  const addDepartment = () => {
    if (newDepartment.trim() && !settings.departments.includes(newDepartment.trim())) {
      setSettings(prev => ({
        ...prev,
        departments: [...prev.departments, newDepartment.trim()]
      }));
      setNewDepartment('');
    }
  };

  const removeDepartment = (dept: string) => {
    setSettings(prev => ({
      ...prev,
      departments: prev.departments.filter(d => d !== dept)
    }));
  };

  const presentPercent = stats.total_employees > 0 
    ? Math.round((stats.present / stats.total_employees) * 100) 
    : 0;

  const filteredEmployees = employees.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.department.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === 'all' || e.department === filterDept;
    return matchSearch && matchDept;
  });

  const departmentCounts: Record<string, number> = {};
  employees.forEach(emp => {
    departmentCounts[emp.department] = (departmentCounts[emp.department] || 0) + 1;
  });

  const departments = ['all', ...Object.keys(departmentCounts)];

  const statusIcon = (status: string) => {
    switch (status) {
      case 'present': return <Check className="w-3.5 h-3.5 text-success" />;
      case 'late': return <Clock className="w-3.5 h-3.5 text-warning" />;
      case 'absent': return <X className="w-3.5 h-3.5 text-gray-400" />;
      default: return <Coffee className="w-3.5 h-3.5 text-primary" />;
    }
  };

  const statusBadge = (status: string) => {
    const colors = {
      present: 'bg-success/10 text-success',
      late: 'bg-warning/10 text-warning',
      absent: 'bg-gray-100 text-gray-600',
      on_leave: 'bg-primary/10 text-primary'
    };
    return colors[status as keyof typeof colors] || 'bg-secondary text-foreground';
  };

  const formatTime = (time: string | null) => {
    if (!time) return '--:--';
    return time.substring(0, 5);
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-lg font-bold gradient-text">Bảng điều khiển quản trị</h1>
            <p className="text-xs text-muted-foreground">Quản lý hệ thống & nhân viên</p>
          </div>
          
          <button 
            onClick={() => setTab('settings')} 
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
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
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4 pb-8">
        <div className="flex gap-1 p-1 rounded-lg bg-secondary overflow-x-auto">
          {([
            { id: 'overview', label: 'Tổng quan', icon: BarChart3 },
            { id: 'employees', label: 'Nhân viên', icon: Users },
            { id: 'attendance', label: 'Điểm danh', icon: UserCheck },
            { id: 'reports', label: 'Báo cáo', icon: FileText },
            { id: 'settings', label: 'Cài đặt', icon: Settings }
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Tổng nhân viên', value: stats.total_employees, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Có mặt', value: stats.present, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
                { label: 'Đi muộn', value: stats.late, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
                { label: 'Vắng mặt', value: stats.absent, icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-100' },
              ].map(s => (
                <div key={s.label} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <div className={`p-1.5 rounded-lg ${s.bg}`}>
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Tỷ lệ điểm danh hôm nay</h3>
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="flex items-end gap-3 mb-3">
                <span className="text-5xl font-bold gradient-text">{presentPercent}%</span>
                <span className="text-sm text-muted-foreground mb-2">{stats.present}/{stats.total_employees} nhân viên</span>
              </div>
              <div className="h-3 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all" 
                     style={{ width: `${presentPercent}%` }} />
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="glass-card p-4">
                <h3 className="font-semibold mb-4">Theo phòng ban</h3>
                <div className="space-y-3">
                  {Object.entries(departmentCounts).map(([dept, count]) => {
                    const percent = Math.round((count / stats.total_employees) * 100);
                    return (
                      <div key={dept}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{dept}</span>
                          <span className="text-sm text-muted-foreground">{count} người ({percent}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="glass-card p-4">
                <h3 className="font-semibold mb-4">Trạng thái hôm nay</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
                    <div className="p-2 rounded-lg bg-success/10">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-success">{stats.present} Có mặt</p>
                      <p className="text-xs text-muted-foreground">Đã điểm danh đúng giờ</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <Clock className="w-5 h-5 text-warning" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-warning">{stats.late} Đi muộn</p>
                      <p className="text-xs text-muted-foreground">Check-in sau {settings.work_start_time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Coffee className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-primary">{stats.on_leave} Nghỉ phép</p>
                      <p className="text-xs text-muted-foreground">Đã đăng ký nghỉ</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'employees' && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm nhân viên..."
                  className="w-full h-10 pl-10 pr-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
              <select
                value={filterDept}
                onChange={e => setFilterDept(e.target.value)}
                className="h-10 px-4 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>
                    {dept === 'all' ? 'Tất cả phòng ban' : dept}
                  </option>
                ))}
              </select>
              <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                Thêm NV
              </button>
            </div>

            <div className="space-y-3">
              {filteredEmployees.map(emp => {
                const weekly = employeeAttendance[emp.user_id] || [];
                const today = new Date().toISOString().split('T')[0];
                const dates = getWeekDates();
                const todayAttendance = emp.today_attendance;
                
                return (
                  <div key={emp.user_id} className="glass-card p-4 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-lg font-bold text-white shadow-lg">
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold">{emp.name}</p>
                          <p className="text-sm text-muted-foreground">{emp.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {emp.department}
                            </span>
                            {todayAttendance && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(todayAttendance.status)}`}>
                                {todayAttendance.status === 'present' ? 'Có mặt' : 
                                 todayAttendance.status === 'late' ? 'Đi muộn' : 'Vắng'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedEmployee(emp.user_id)}
                          className="p-2 rounded-lg hover:bg-secondary transition-colors"
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>

                    {todayAttendance && (
                      <div className="grid grid-cols-2 gap-3 mb-3 p-3 rounded-lg bg-secondary/50">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Check-in</p>
                          <p className="font-mono font-semibold">
                            {formatTime(todayAttendance.check_in)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Check-out</p>
                          <p className="font-mono font-semibold">
                            {formatTime(todayAttendance.check_out)}
                          </p>
                        </div>
                        {todayAttendance.late_minutes > 0 && (
                          <div className="col-span-2">
                            <p className="text-xs text-warning">
                              ⚠️ Đi muộn {todayAttendance.late_minutes} phút
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Tuần này</p>
                      <div className="grid grid-cols-7 gap-1">
                        {dayNames.map((day, i) => {
                          const rec = weekly[i];
                          const date = dates[i];
                          const isToday = date === today;
                          
                          if (!rec || date > today) {
                            return (
                              <div key={day} className="text-center">
                                <div className="text-[10px] text-muted-foreground mb-1">{day}</div>
                                <div className={`h-8 rounded flex items-center justify-center ${
                                  isToday ? 'bg-primary/5 border border-primary/20' : 'bg-secondary/30'
                                }`}>
                                  <span className="text-xs text-muted-foreground/30">—</span>
                                </div>
                              </div>
                            );
                          }
                          
                          return (
                            <div key={day} className="text-center">
                              <div className="text-[10px] text-muted-foreground mb-1">{day}</div>
                              <div 
                                className={`h-8 rounded flex items-center justify-center ${
                                  isToday ? 'ring-2 ring-primary' : ''
                                }`}
                                title={`${day}: ${rec.status}`}
                              >
                                {statusIcon(rec.status)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'attendance' && (
          <div className="glass-card p-4">
            <h3 className="font-semibold mb-4">Chi tiết điểm danh</h3>
            
            {!selectedEmployee ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Chọn nhân viên từ tab "Nhân viên" để xem chi tiết điểm danh
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4 flex-wrap">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                  />
                  <span className="flex items-center text-muted-foreground">đến</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                  />
                  <button 
                    onClick={() => setDateRange({ start: '', end: '' })}
                    className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm"
                  >
                    Reset
                  </button>
                  <button className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm">
                    <Download className="w-4 h-4" />
                    Xuất Excel
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Ngày</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Check-in</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Check-out</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Giờ làm</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Trạng thái</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Muộn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeDetails.map(detail => (
                        <tr key={detail.date} className="border-b border-border/50 hover:bg-secondary/20">
                          <td className="py-3 px-2 text-sm">{formatDate(detail.date)}</td>
                          <td className="py-3 px-2 text-sm font-mono">{formatTime(detail.check_in)}</td>
                          <td className="py-3 px-2 text-sm font-mono">{formatTime(detail.check_out)}</td>
                          <td className="py-3 px-2 text-sm">{detail.work_hours.toFixed(1)}h</td>
                          <td className="py-3 px-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${statusBadge(detail.status)}`}>
                              {detail.status === 'present' ? 'Có mặt' : 
                               detail.status === 'late' ? 'Đi muộn' : 'Vắng'}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-sm text-warning">
                            {detail.late_minutes > 0 ? `${detail.late_minutes}p` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'reports' && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Báo cáo tổng hợp</h3>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Download className="w-4 h-4" />
                Xuất Excel
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-gradient-to-br from-success/10 to-success/5 border border-success/20">
                <p className="text-sm text-muted-foreground mb-2">Tỷ lệ có mặt trung bình</p>
                <p className="text-3xl font-bold text-success">{presentPercent}%</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20">
                <p className="text-sm text-muted-foreground mb-2">Số lần đi muộn (tháng)</p>
                <p className="text-3xl font-bold text-warning">{stats.late}</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <p className="text-sm text-muted-foreground mb-2">Giờ làm trung bình/ngày</p>
                <p className="text-3xl font-bold text-primary">8.2h</p>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="font-semibold mb-3">Hiệu suất theo phòng ban</h4>
              <div className="space-y-3">
                {Object.entries(departmentCounts).map(([dept, count]) => {
                  const deptPresent = employees.filter(
                    e => e.department === dept && e.today_attendance?.status === 'present'
                  ).length;
                  const deptPercent = Math.round((deptPresent / count) * 100);
                  
                  return (
                    <div key={dept} className="p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{dept}</span>
                        <span className="text-sm text-muted-foreground">
                          {deptPresent}/{count} ({deptPercent}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-background overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            deptPercent >= 90 ? 'bg-success' : 
                            deptPercent >= 70 ? 'bg-warning' : 'bg-gray-400'
                          }`}
                          style={{ width: `${deptPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Nhân viên xuất sắc (không đi muộn)</h4>
              <div className="space-y-2">
                {employees
                  .filter(e => {
                    const weekly = employeeAttendance[e.user_id] || [];
                    return weekly.filter(r => r.status === 'late').length === 0 &&
                           weekly.filter(r => r.status === 'present').length > 0;
                  })
                  .slice(0, 5)
                  .map(emp => (
                    <div key={emp.user_id} className="flex items-center gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-success to-success/50 flex items-center justify-center text-white font-bold">
                        {emp.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.department}</p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <>
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Giờ làm việc</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Giờ vào làm</label>
                    <input
                      type="time"
                      value={settings.work_start_time}
                      onChange={e => setSettings(prev => ({ ...prev, work_start_time: e.target.value }))}
                      className="w-full px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Giờ tan làm</label>
                    <input
                      type="time"
                      value={settings.work_end_time}
                      onChange={e => setSettings(prev => ({ ...prev, work_end_time: e.target.value }))}
                      className="w-full px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Ngưỡng đi muộn (phút)</label>
                    <input
                      type="number"
                      value={settings.late_threshold}
                      onChange={e => setSettings(prev => ({ ...prev, late_threshold: parseInt(e.target.value) }))}
                      className="w-full px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Check-in sau {settings.work_start_time} + {settings.late_threshold} phút sẽ tính là đi muộn
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Địa điểm văn phòng</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Địa chỉ</label>
                    <textarea
                      value={settings.office_location.address}
                      onChange={e => setSettings(prev => ({ 
                        ...prev, 
                        office_location: { ...prev.office_location, address: e.target.value }
                      }))}
                      rows={3}
                      className="w-full px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">Vĩ độ</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={settings.office_location.latitude}
                        onChange={e => setSettings(prev => ({ 
                          ...prev, 
                          office_location: { ...prev.office_location, latitude: parseFloat(e.target.value) }
                        }))}
                        className="w-full px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">Kinh độ</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={settings.office_location.longitude}
                        onChange={e => setSettings(prev => ({ 
                          ...prev, 
                          office_location: { ...prev.office_location, longitude: parseFloat(e.target.value) }
                        }))}
                        className="w-full px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Bán kính cho phép (mét)</label>
                    <input
                      type="number"
                      value={settings.office_location.radius}
                      onChange={e => setSettings(prev => ({ 
                        ...prev, 
                        office_location: { ...prev.office_location, radius: parseInt(e.target.value) }
                      }))}
                      className="w-full px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Nhân viên phải check-in trong bán kính {settings.office_location.radius}m
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Phòng ban</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDepartment}
                      onChange={e => setNewDepartment(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && addDepartment()}
                      placeholder="Tên phòng ban mới..."
                      className="flex-1 px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      onClick={addDepartment}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {settings.departments.map(dept => (
                      <div key={dept} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                        <span className="font-medium">{dept}</span>
                        <button
                          onClick={() => removeDepartment(dept)}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Ngày làm việc</h3>
                </div>
                <div className="space-y-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                    <label key={day} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={settings.work_days.includes(day)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSettings(prev => ({ ...prev, work_days: [...prev.work_days, day] }));
                          } else {
                            setSettings(prev => ({ ...prev, work_days: prev.work_days.filter(d => d !== day) }));
                          }
                        }}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="font-medium">
                        {day === 'Monday' ? 'Thứ 2' :
                         day === 'Tuesday' ? 'Thứ 3' :
                         day === 'Wednesday' ? 'Thứ 4' :
                         day === 'Thursday' ? 'Thứ 5' :
                         day === 'Friday' ? 'Thứ 6' :
                         day === 'Saturday' ? 'Thứ 7' : 'Chủ nhật'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-card p-4">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Lưu cài đặt
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;