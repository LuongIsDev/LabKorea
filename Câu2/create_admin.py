"""
Script để tạo tài khoản admin
Chạy: python create_admin.py
"""
import requests
import sys

API_URL = "http://localhost:8000/admin/create-admin"

def create_admin():
    print("=" * 50)
    print("TẠO TÀI KHOẢN ADMIN")
    print("=" * 50)
    
    email = input("Email: ").strip()
    name = input("Tên: ").strip()
    password = input("Mật khẩu: ").strip()
    department = input("Phòng ban (mặc định: Chung): ").strip() or "Chung"
    
    if not email or not name or not password:
        print("❌ Vui lòng nhập đầy đủ thông tin!")
        return
    
    try:
        form_data = {
            "email": email,
            "name": name,
            "password": password,
            "department": department
        }
        
        response = requests.post(API_URL, data=form_data)
        
        if response.status_code == 200:
            data = response.json()
            print("\n✅ Tạo tài khoản admin thành công!")
            print(f"   Email: {data['user']['email']}")
            print(f"   Tên: {data['user']['name']}")
            print(f"   Role: {data['user']['role']}")
            print(f"   Phòng ban: {data['user']['department']}")
            print("\nBạn có thể đăng nhập với email và mật khẩu vừa tạo.")
        else:
            error = response.json()
            print(f"\n❌ Lỗi: {error.get('detail', 'Unknown error')}")
    except requests.exceptions.ConnectionError:
        print("\n❌ Không thể kết nối đến server. Đảm bảo server đang chạy tại http://localhost:8000")
    except Exception as e:
        print(f"\n❌ Lỗi: {str(e)}")

if __name__ == "__main__":
    try:
        create_admin()
    except KeyboardInterrupt:
        print("\n\nĐã hủy.")
        sys.exit(0)
