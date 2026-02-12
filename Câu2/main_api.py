from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, PayloadSchemaType
import numpy as np
from deepface import DeepFace
import cv2
import uuid
from dotenv import load_dotenv
import os
from passlib.context import CryptContext
from datetime import datetime, date
from typing import Optional, List
import json
import base64

load_dotenv()

app = FastAPI(title="AttendAI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====================== QDRANT ======================

client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY")
)

# Collections
FACE_COLLECTION = os.getenv("FACE_COLLECTION", "accounts")
USERS_COLLECTION = os.getenv("USERS_COLLECTION", "users")
ATTENDANCE_COLLECTION = os.getenv("ATTENDANCE_COLLECTION", "attendance")

# ====================== FACE RECOGNITION CONFIG ======================
# Sử dụng config tối ưu cho tốc độ và độ chính xác
FACE_MODEL = "Facenet512"  # Thay ArcFace bằng Facenet512 - nhanh hơn, chính xác hơn
FACE_DETECTOR = "opencv"   # Thay retinaface bằng opencv - nhanh hơn nhiều
SIMILARITY_THRESHOLD = 0.40  # Giảm threshold để dễ match hơn (Facenet512 distance metric khác ArcFace)


@app.post("/check-in-face-verify")
async def check_in_face_verify(
    file: UploadFile = File(...),
    user_id: str = Form(...)
):
    """Verify face khi check-in (so khớp với embedding của user cụ thể)"""
    
    print(f"🔍 Starting face verification for user_id: {user_id}")
    
    # ✅ FIX: Thêm with_vectors=True để lấy vector
    try:
        result = client.scroll(
            collection_name=FACE_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
            ),
            limit=1,
            with_vectors=True  # ← THÊM DÒNG NÀY
        )
    except Exception as e:
        print(f"❌ Error querying Qdrant: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối database: {str(e)}")
    
    if not result[0]:
        print(f"❌ No face embedding found for user_id: {user_id}")
        raise HTTPException(status_code=404, detail="User chưa đăng ký face")
    
    # ✅ KIỂM TRA: Vector có tồn tại không
    point = result[0][0]
    vector_data = point.vector
    
    print(f"📊 Vector data type: {type(vector_data)}")
    print(f"📊 Vector data: {vector_data if vector_data is None else f'List with {len(vector_data)} elements'}")
    
    if vector_data is None:
        print(f"❌ Vector is None for user_id: {user_id}")
        raise HTTPException(
            status_code=500, 
            detail="Lỗi: Embedding của user không hợp lệ. Vui lòng đăng ký lại face."
        )
    
    # ✅ KIỂM TRA: Vector có phải list/array không
    if not isinstance(vector_data, (list, np.ndarray)):
        print(f"❌ Vector is not a list/array: {type(vector_data)}")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi: Vector type không hợp lệ ({type(vector_data)}). Vui lòng đăng ký lại face."
        )
    
    # ✅ Chuyển sang numpy array
    try:
        registered_embedding = np.array(vector_data, dtype=np.float64)
    except Exception as e:
        print(f"❌ Error converting to numpy array: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi: Không thể chuyển đổi embedding. Vui lòng đăng ký lại face."
        )
    
    # ✅ KIỂM TRA: Vector có chứa None hoặc NaN không
    if registered_embedding.size == 0:
        print(f"❌ Registered embedding is empty")
        raise HTTPException(
            status_code=500,
            detail="Lỗi: Embedding rỗng. Vui lòng đăng ký lại face."
        )
    
    if np.any(np.isnan(registered_embedding)) or np.any(np.isinf(registered_embedding)):
        print(f"❌ Registered embedding contains NaN or Inf")
        raise HTTPException(
            status_code=500,
            detail="Lỗi: Embedding không hợp lệ (chứa NaN/Inf). Vui lòng đăng ký lại face."
        )
    
    print(f"✓ Registered embedding shape: {registered_embedding.shape}")
    
    # Extract embedding từ ảnh hiện tại
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh")
        
        img = preprocess_image(img)
        
        print(f"🔍 Extracting embedding from uploaded image...")
        embedding_obj = DeepFace.represent(
            img_path=img,
            model_name=FACE_MODEL,
            enforce_detection=True,
            detector_backend=FACE_DETECTOR
        )
        current_embedding = np.array(embedding_obj[0]["embedding"], dtype=np.float64)
        print(f"✓ Current embedding shape: {current_embedding.shape}")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error extracting current embedding: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Không phát hiện khuôn mặt: {str(e)}"
        )
    
    # ✅ KIỂM TRA: Current embedding hợp lệ không
    if current_embedding.size == 0 or np.any(np.isnan(current_embedding)):
        raise HTTPException(
            status_code=400,
            detail="Lỗi: Không trích xuất được embedding từ ảnh"
        )
    
    # ✅ KIỂM TRA: Kích thước khớp nhau không
    if current_embedding.shape != registered_embedding.shape:
        print(f"❌ Shape mismatch: {current_embedding.shape} vs {registered_embedding.shape}")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi: Kích thước embedding không khớp. Vui lòng đăng ký lại face."
        )
    
    # So sánh bằng cosine similarity
    try:
        dot_product = np.dot(current_embedding, registered_embedding)
        norm_current = np.linalg.norm(current_embedding)
        norm_registered = np.linalg.norm(registered_embedding)
        
        print(f"📊 Dot product: {dot_product}")
        print(f"📊 Norm current: {norm_current}")
        print(f"📊 Norm registered: {norm_registered}")
        
        if norm_current == 0 or norm_registered == 0:
            similarity = 0.0
        else:
            similarity = dot_product / (norm_current * norm_registered)
        
        print(f"🔍 Face comparison for user {user_id}: similarity = {similarity:.4f}")
        
        if similarity >= SIMILARITY_THRESHOLD:
            print(f"✅ Face verified! Similarity {similarity:.4f} >= threshold {SIMILARITY_THRESHOLD}")
            return {
                "success": True,
                "user_id": user_id,
                "similarity": float(similarity),
                "match": "✓"
            }
        else:
            print(f"❌ Face not matching. Similarity {similarity:.4f} < threshold {SIMILARITY_THRESHOLD}")
            raise HTTPException(
                status_code=401, 
                detail=f"Face không khớp (similarity: {similarity:.4f})"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error during similarity calculation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi so sánh face: {str(e)}"
        )



# ====================== INITIALIZE COLLECTIONS ======================

def init_collections():
    """Khởi tạo tất cả collections cần thiết"""
    # Face collection - tăng kích thước vector lên 512 cho Facenet512
    if not client.collection_exists(FACE_COLLECTION):
        try:
            client.create_collection(
                collection_name=FACE_COLLECTION,
                vectors_config=VectorParams(size=512, distance=Distance.COSINE),
            )
            print(f"✓ Created collection: {FACE_COLLECTION}")
        except Exception as e:
            print(f"Error creating {FACE_COLLECTION}: {e}")

    # Users collection - không cần vector, chỉ lưu metadata
    if not client.collection_exists(USERS_COLLECTION):
        try:
            client.create_collection(
                collection_name=USERS_COLLECTION,
                vectors_config=VectorParams(size=1, distance=Distance.COSINE),
            )
            print(f"✓ Created collection: {USERS_COLLECTION}")
        except Exception as e:
            print(f"Error creating {USERS_COLLECTION}: {e}")
            raise

    # Attendance collection - không cần vector, chỉ lưu metadata
    if not client.collection_exists(ATTENDANCE_COLLECTION):
        try:
            client.create_collection(
                collection_name=ATTENDANCE_COLLECTION,
                vectors_config=VectorParams(size=1, distance=Distance.COSINE),
            )
            print(f"✓ Created collection: {ATTENDANCE_COLLECTION}")
        except Exception as e:
            print(f"Error creating {ATTENDANCE_COLLECTION}: {e}")
            raise

# Khởi tạo collections
init_collections()

def ensure_indexes():
    """Tạo index cho collections nếu chưa có"""
    
    # ✅ FACE_COLLECTION indexes (THÊM INDEX user_id)
    if client.collection_exists(FACE_COLLECTION):
        try:
            client.create_payload_index(
                collection_name=FACE_COLLECTION,
                field_name="user_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print(f"✓ Created index: {FACE_COLLECTION}.user_id")
        except Exception as e:
            if "already exists" not in str(e).lower() and "already exist" not in str(e).lower():
                print(f"Note creating index {FACE_COLLECTION}.user_id: {e}")
    
    if client.collection_exists(USERS_COLLECTION):
        try:
            client.create_payload_index(
                collection_name=USERS_COLLECTION,
                field_name="email",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print(f"✓ Created index: {USERS_COLLECTION}.email")
        except Exception as e:
            if "already exists" not in str(e).lower() and "already exist" not in str(e).lower():
                print(f"Note creating index {USERS_COLLECTION}.email: {e}")
        
        try:
            client.create_payload_index(
                collection_name=USERS_COLLECTION,
                field_name="user_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print(f"✓ Created index: {USERS_COLLECTION}.user_id")
        except Exception as e:
            if "already exists" not in str(e).lower() and "already exist" not in str(e).lower():
                print(f"Note creating index {USERS_COLLECTION}.user_id: {e}")
    
    if client.collection_exists(ATTENDANCE_COLLECTION):
        try:
            client.create_payload_index(
                collection_name=ATTENDANCE_COLLECTION,
                field_name="user_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print(f"✓ Created index: {ATTENDANCE_COLLECTION}.user_id")
        except Exception as e:
            if "already exists" not in str(e).lower() and "already exist" not in str(e).lower():
                print(f"Note creating index {ATTENDANCE_COLLECTION}.user_id: {e}")
        
        try:
            client.create_payload_index(
                collection_name=ATTENDANCE_COLLECTION,
                field_name="date",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print(f"✓ Created index: {ATTENDANCE_COLLECTION}.date")
        except Exception as e:
            if "already exists" not in str(e).lower() and "already exist" not in str(e).lower():
                print(f"Note creating index {ATTENDANCE_COLLECTION}.date: {e}")

ensure_indexes()

# ====================== HELPERS ======================

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def ensure_collection_exists(collection_name: str, vector_size: int = 1):
    """Đảm bảo collection tồn tại, nếu không thì tạo mới"""
    if not client.collection_exists(collection_name):
        try:
            client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            print(f"✓ Created collection: {collection_name}")
            return True
        except Exception as e:
            print(f"✗ Error creating collection {collection_name}: {e}")
            raise
    return False

def get_user_by_id(user_id: str) -> Optional[dict]:
    """Lấy user từ Qdrant bằng user_id"""
    result = client.scroll(
        collection_name=USERS_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="user_id", match=MatchValue(value=user_id))
            ]
        ),
        limit=1
    )
    if result[0]:
        point = result[0][0]
        return point.payload
    return None

def get_user_by_email(email: str) -> Optional[dict]:
    """Lấy user từ Qdrant bằng email"""
    result = client.scroll(
        collection_name=USERS_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="email", match=MatchValue(value=email))
            ]
        ),
        limit=1
    )
    if result[0]:
        point = result[0][0]
        return point.payload
    return None

def get_all_users() -> List[dict]:
    """Lấy tất cả users"""
    result = client.scroll(
        collection_name=USERS_COLLECTION,
        limit=1000
    )
    users = []
    if result[0]:
        for point in result[0]:
            user_data = point.payload.copy()
            if "password" in user_data:
                del user_data["password"]
            users.append(user_data)
    return users

def get_attendance_by_user(user_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[dict]:
    """Lấy attendance records của user"""
    filters = [FieldCondition(key="user_id", match=MatchValue(value=user_id))]
    
    result = client.scroll(
        collection_name=ATTENDANCE_COLLECTION,
        scroll_filter=Filter(must=filters) if filters else None,
        limit=1000
    )
    
    records = []
    if result[0]:
        for point in result[0]:
            record = point.payload
            record_date = record.get("date", "")
            
            if start_date and record_date < start_date:
                continue
            if end_date and record_date > end_date:
                continue
            
            records.append(record)
    
    records.sort(key=lambda x: x.get("date", ""))
    return records

def get_today_attendance(user_id: str) -> Optional[dict]:
    """Lấy attendance record hôm nay của user"""
    today = date.today().isoformat()
    result = client.scroll(
        collection_name=ATTENDANCE_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                FieldCondition(key="date", match=MatchValue(value=today))
            ]
        ),
        limit=1
    )
    if result[0]:
        return result[0][0].payload
    return None

# ====================== HELPER: PREPROCESS IMAGE ======================
def preprocess_image(img):
    """Tiền xử lý ảnh để tăng độ chính xác"""
    # Resize ảnh về kích thước lớn hơn nếu quá nhỏ
    h, w = img.shape[:2]
    if w < 640 or h < 480:
        scale = max(640/w, 480/h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    
    # Cân bằng histogram để cải thiện độ sáng
    if len(img.shape) == 2:  # Grayscale
        img = cv2.equalizeHist(img)
    else:  # Color
        img_yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV)
        img_yuv[:,:,0] = cv2.equalizeHist(img_yuv[:,:,0])
        img = cv2.cvtColor(img_yuv, cv2.COLOR_YUV2BGR)
    
    # Giảm nhiễu
    img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
    
    return img

# ====================== MODELS ======================

class UserRegister(BaseModel):
    email: str
    name: str
    password: str
    role: str = "employee"
    department: str = "Chung"

class UserLogin(BaseModel):
    email: str
    password: str

class CheckInRequest(BaseModel):
    user_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class CheckOutRequest(BaseModel):
    user_id: str

class UpdateUserRoleRequest(BaseModel):
    user_id: str
    role: str

# ====================== REGISTER ACCOUNT ======================

@app.post("/register")
async def register(user: UserRegister):
    try:
        ensure_collection_exists(USERS_COLLECTION, vector_size=1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    existing = get_user_by_email(user.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email đã tồn tại")

    hashed_password = pwd_context.hash(user.password)
    user_id = str(uuid.uuid4())
    created_at = datetime.now().isoformat()

    point = PointStruct(
        id=str(uuid.uuid4()),
        vector=[0.0],
        payload={
            "user_id": user_id,
            "email": user.email,
            "name": user.name,
            "password": hashed_password,
            "role": user.role,
            "department": user.department,
            "face_registered": False,
            "created_at": created_at
        }
    )

    client.upsert(collection_name=USERS_COLLECTION, points=[point])

    return {
        "message": "Đăng ký thành công",
        "user": {
            "id": user_id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "department": user.department,
            "face_registered": False
        }
    }

# ====================== LOGIN ACCOUNT ======================

@app.post("/login")
async def login(user: UserLogin):
    user_data = get_user_by_email(user.email)
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Sai email hoặc mật khẩu")

    if not pwd_context.verify(user.password, user_data["password"]):
        raise HTTPException(status_code=401, detail="Sai email hoặc mật khẩu")

    return {
        "success": True,
        "user": {
            "id": user_data["user_id"],
            "email": user_data["email"],
            "name": user_data["name"],
            "role": user_data["role"],
            "department": user_data["department"],
            "face_registered": user_data.get("face_registered", False)
        }
    }

# ====================== CHECK FACE STATUS ======================

@app.get("/check-face/{user_id}")
async def check_face(user_id: str):
    user_data = get_user_by_id(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User không tồn tại")

    return {
        "face_registered": user_data.get("face_registered", False)
    }

# ====================== REGISTER FACE ======================

@app.post("/register-face")
async def register_face(
    file: UploadFile = File(...),
    user_id: str = Form(...)
):
    user_data = get_user_by_id(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User không tồn tại")

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Tiền xử lý ảnh
    img = preprocess_image(img)

    # Lưu ảnh gốc dưới dạng base64
    _, buffer = cv2.imencode('.jpg', img)
    image_base64 = base64.b64encode(buffer).decode('utf-8')

    try:
        print(f"🔍 Extracting face embedding for registration using {FACE_MODEL} with {FACE_DETECTOR}...")
        embedding_obj = DeepFace.represent(
            img_path=img,
            model_name=FACE_MODEL,
            enforce_detection=True,
            detector_backend=FACE_DETECTOR
        )
        embedding = embedding_obj[0]["embedding"]
        print(f"✓ Face embedding extracted, size: {len(embedding)}")
    except Exception as e:
        print(f"✗ Error extracting face embedding: {e}")
        raise HTTPException(status_code=400, detail=f"Không phát hiện khuôn mặt rõ ràng. Vui lòng chụp lại với ánh sáng tốt hơn. Chi tiết: {str(e)}")

    # Lưu face embedding vào FACE_COLLECTION
    point = PointStruct(
        id=user_id,
        vector=embedding,
        payload={
            "user_id": user_id,
            "email": user_data["email"],
            "name": user_data["name"],
            "role": user_data["role"],
            "image_base64": image_base64,
            "registered_at": datetime.now().isoformat()
        }
    )

    try:
        client.upsert(collection_name=FACE_COLLECTION, points=[point])
        print(f"✓ Face embedding saved for user_id: {user_id}")
    except Exception as e:
        print(f"✗ Error saving face embedding: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lưu embedding: {str(e)}")

    # Cập nhật face_registered trong USERS_COLLECTION
    result = client.scroll(
        collection_name=USERS_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="user_id", match=MatchValue(value=user_id))
            ]
        ),
        limit=1
    )
    
    if result[0]:
        point_id = result[0][0].id
        user_payload = result[0][0].payload.copy()
        user_payload["face_registered"] = True
        
        update_point = PointStruct(
            id=point_id,
            vector=[0.0],
            payload=user_payload
        )
        client.upsert(collection_name=USERS_COLLECTION, points=[update_point])
        
        updated_user_data = get_user_by_id(user_id)
        
        return {
            "message": "Đăng ký khuôn mặt thành công",
            "user_id": user_id,
            "user": {
                "id": updated_user_data["user_id"],
                "email": updated_user_data["email"],
                "name": updated_user_data["name"],
                "role": updated_user_data["role"],
                "department": updated_user_data["department"],
                "face_registered": updated_user_data.get("face_registered", True)
            }
        }
    
    return {
        "message": "Đăng ký khuôn mặt thành công",
        "user_id": user_id
    }

# ====================== LOGIN FACE ======================

@app.post("/login-face")
async def login_face(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Tiền xử lý ảnh
    img = preprocess_image(img)

    try:
        print(f"🔍 Extracting face embedding for verification using {FACE_MODEL} with {FACE_DETECTOR}...")
        embedding_obj = DeepFace.represent(
            img_path=img,
            model_name=FACE_MODEL,
            enforce_detection=True,
            detector_backend=FACE_DETECTOR
        )
        embedding = embedding_obj[0]["embedding"]
        print(f"✓ Face embedding extracted, size: {len(embedding)}")
    except Exception as e:
        print(f"✗ Error extracting face embedding: {e}")
        raise HTTPException(status_code=400, detail=f"Không phát hiện khuôn mặt rõ ràng. Vui lòng chụp lại với ánh sáng tốt hơn.")

    # Kiểm tra số lượng points trong collection
    try:
        collection_info = client.get_collection(FACE_COLLECTION)
        total_points = collection_info.points_count
        print(f"📊 Total face embeddings in database: {total_points}")
    except Exception as e:
        print(f"✗ Error getting collection info: {e}")
        total_points = 0

    if total_points == 0:
        raise HTTPException(status_code=404, detail="Chưa có khuôn mặt nào được đăng ký trong hệ thống!")

    # Tìm kiếm với threshold đã giảm
    print(f"🔍 Searching for matching face (threshold: {SIMILARITY_THRESHOLD})...")
    search_result = client.query_points(
        collection_name=FACE_COLLECTION,
        query=embedding,
        limit=5,
        score_threshold=SIMILARITY_THRESHOLD
    )

    print(f"📊 Search results: {len(search_result.points)} matches found")
    if search_result.points:
        for i, point in enumerate(search_result.points):
            print(f"  Match {i+1}: user_id={point.payload.get('user_id')}, name={point.payload.get('name')}, score={point.score:.4f}")

    if not search_result.points:
        raise HTTPException(
            status_code=401, 
            detail=f"Không tìm thấy khuôn mặt khớp! Hệ thống có {total_points} khuôn mặt đã đăng ký. Vui lòng thử lại với ánh sáng tốt hơn hoặc đăng ký lại khuôn mặt."
        )

    match = search_result.points[0]
    user_id = match.payload["user_id"]
    print(f"✅ Face matched! user_id={user_id}, score={match.score:.4f}")

    user_data = get_user_by_id(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User không tồn tại")

    return {
        "success": True,
        "user": {
            "id": user_id,
            "email": user_data["email"],
            "name": user_data["name"],
            "role": user_data["role"],
            "department": user_data["department"],
            "face_registered": user_data.get("face_registered", False)
        },
        "similarity_score": match.score,
        "match_confidence": f"{match.score * 100:.1f}%"
    }

# ====================== GET EMPLOYEES ======================

@app.get("/employees")
async def get_employees():
    """Lấy danh sách tất cả nhân viên"""
    users = get_all_users()
    return {
        "employees": users,
        "total": len(users)
    }

# ====================== GET ATTENDANCE ======================

@app.get("/attendance/{user_id}")
async def get_attendance(user_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Lấy attendance records của user"""
    user_data = get_user_by_id(user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    
    records = get_attendance_by_user(user_id, start_date, end_date)
    return {
        "user_id": user_id,
        "records": records,
        "total": len(records)
    }

# ====================== CHECK IN ======================

@app.post("/check-in")
async def check_in(data: CheckInRequest):
    """Lưu check-in"""
    user_data = get_user_by_id(data.user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    
    today = date.today().isoformat()
    now = datetime.now()
    check_in_time = now.strftime("%H:%M")
    
    # Kiểm tra đã check-in chưa
    today_record = get_today_attendance(data.user_id)
    
    if today_record and today_record.get("check_in"):
        raise HTTPException(status_code=400, detail="Đã check-in hôm nay")
    
    # Tính late minutes (nếu check-in sau 8:00)
    late_minutes = 0
    status = "present"
    check_in_hour = now.hour
    check_in_minute = now.minute
    
    if check_in_hour > 8 or (check_in_hour == 8 and check_in_minute > 0):
        late_minutes = (check_in_hour - 8) * 60 + check_in_minute
        if late_minutes > 0:
            status = "late"
    
    # Tạo hoặc cập nhật attendance record
    attendance_id = str(uuid.uuid4())
    
    if today_record:
        # Cập nhật record hiện có
        result = client.scroll(
            collection_name=ATTENDANCE_COLLECTION,
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="user_id", match=MatchValue(value=data.user_id)),
                    FieldCondition(key="date", match=MatchValue(value=today))
                ]
            ),
            limit=1
        )
        if result[0]:
            point_id = result[0][0].id
            payload = result[0][0].payload.copy()
            payload.update({
                "check_in": check_in_time,
                "status": status,
                "late_minutes": late_minutes,
                "latitude": data.latitude,
                "longitude": data.longitude
            })
            
            update_point = PointStruct(
                id=point_id,
                vector=[0.0],
                payload=payload
            )
            client.upsert(collection_name=ATTENDANCE_COLLECTION, points=[update_point])
    else:
        # Tạo record mới
        point = PointStruct(
            id=attendance_id,
            vector=[0.0],
            payload={
                "attendance_id": attendance_id,
                "user_id": data.user_id,
                "date": today,
                "check_in": check_in_time,
                "check_out": None,
                "status": status,
                "late_minutes": late_minutes,
                "latitude": data.latitude,
                "longitude": data.longitude,
                "created_at": datetime.now().isoformat()
            }
        )
        client.upsert(collection_name=ATTENDANCE_COLLECTION, points=[point])
    
    # Lấy thông tin địa điểm từ GPS
    location_name = "Phòng Hải, Quảng Yên"
    if data.latitude and data.longitude:
        location_name = f"Phòng Hải ({data.latitude:.4f}, {data.longitude:.4f})"
    
    return {
        "message": "Check-in thành công",
        "check_in": check_in_time,
        "date": today,
        "datetime": now.isoformat(),
        "status": status,
        "late_minutes": late_minutes,
        "user": {
            "id": user_data["user_id"],
            "name": user_data["name"],
            "email": user_data["email"]
        },
        "location": {
            "name": location_name,
            "latitude": data.latitude,
            "longitude": data.longitude
        }
    }

# ====================== CHECK OUT ======================

@app.post("/check-out")
async def check_out(data: CheckOutRequest):
    """Lưu check-out"""
    user_data = get_user_by_id(data.user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    
    today = date.today().isoformat()
    now = datetime.now()
    check_out_time = now.strftime("%H:%M")
    
    # Lấy record hôm nay
    today_record = get_today_attendance(data.user_id)
    
    if not today_record:
        raise HTTPException(status_code=400, detail="Chưa check-in hôm nay")
    
    if today_record.get("check_out"):
        raise HTTPException(status_code=400, detail="Đã check-out hôm nay")
    
    # Cập nhật check-out
    result = client.scroll(
        collection_name=ATTENDANCE_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="user_id", match=MatchValue(value=data.user_id)),
                FieldCondition(key="date", match=MatchValue(value=today))
            ]
        ),
        limit=1
    )
    
    if result[0]:
        point_id = result[0][0].id
        payload = result[0][0].payload.copy()
        payload["check_out"] = check_out_time
        
        update_point = PointStruct(
            id=point_id,
            vector=[0.0],
            payload=payload
        )
        client.upsert(collection_name=ATTENDANCE_COLLECTION, points=[update_point])
    
    return {
        "message": "Check-out thành công",
        "check_out": check_out_time,
        "date": today,
        "datetime": now.isoformat(),
        "user": {
            "id": user_data["user_id"],
            "name": user_data["name"],
            "email": user_data["email"]
        }
    }

# ====================== ADMIN STATS ======================

@app.get("/admin/stats")
async def get_admin_stats(date_filter: Optional[str] = None):
    """Lấy stats cho admin dashboard"""
    target_date = date_filter if date_filter else date.today().isoformat()
    
    all_users = get_all_users()
    total_employees = len(all_users)
    
    result = client.scroll(
        collection_name=ATTENDANCE_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="date", match=MatchValue(value=target_date))
            ]
        ),
        limit=1000
    )
    
    present = 0
    late = 0
    absent = 0
    on_leave = 0
    
    if result[0]:
        for point in result[0]:
            status = point.payload.get("status", "absent")
            if status == "present":
                present += 1
            elif status == "late":
                late += 1
                present += 1
            elif status == "leave":
                on_leave += 1
    
    absent = total_employees - present - on_leave
    
    return {
        "date": target_date,
        "total_employees": total_employees,
        "present": present,
        "late": late,
        "absent": absent,
        "on_leave": on_leave
    }

@app.get("/admin/employees")
async def get_admin_employees():
    """Lấy danh sách nhân viên với attendance hôm nay cho admin"""
    today = date.today().isoformat()
    
    all_users = get_all_users()
    
    result = client.scroll(
        collection_name=ATTENDANCE_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="date", match=MatchValue(value=today))
            ]
        ),
        limit=1000
    )
    
    attendance_map = {}
    if result[0]:
        for point in result[0]:
            user_id = point.payload.get("user_id")
            if user_id:
                attendance_map[user_id] = point.payload
    
    employees_with_attendance = []
    for user in all_users:
        user_id = user.get("user_id")
        attendance = attendance_map.get(user_id, {})
        
        employees_with_attendance.append({
            **user,
            "today_attendance": {
                "check_in": attendance.get("check_in"),
                "check_out": attendance.get("check_out"),
                "status": attendance.get("status", "absent"),
                "late_minutes": attendance.get("late_minutes", 0)
            }
        })
    
    return {
        "employees": employees_with_attendance,
        "date": today
    }

# ====================== DEBUG ======================

@app.get("/debug/face-embeddings")
async def debug_face_embeddings():
    """Debug endpoint để kiểm tra số lượng face embeddings"""
    try:
        collection_info = client.get_collection(FACE_COLLECTION)
        total_points = collection_info.points_count
        
        result = client.scroll(
            collection_name=FACE_COLLECTION,
            limit=10
        )
        
        embeddings_info = []
        if result[0]:
            for point in result[0]:
                has_image = "image_base64" in point.payload
                embeddings_info.append({
                    "id": point.id,
                    "user_id": point.payload.get("user_id"),
                    "name": point.payload.get("name"),
                    "email": point.payload.get("email"),
                    "has_image": has_image,
                    "registered_at": point.payload.get("registered_at")
                })
        
        return {
            "collection": FACE_COLLECTION,
            "total_embeddings": total_points,
            "sample_embeddings": embeddings_info,
            "config": {
                "model": FACE_MODEL,
                "detector": FACE_DETECTOR,
                "threshold": SIMILARITY_THRESHOLD
            }
        }
    except Exception as e:
        return {
            "error": str(e),
            "collection": FACE_COLLECTION
        }

@app.get("/face-image/{user_id}")
async def get_face_image(user_id: str):
    """Lấy ảnh đã đăng ký của user"""
    try:
        result = client.scroll(
            collection_name=FACE_COLLECTION,
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="user_id", match=MatchValue(value=user_id))
                ]
            ),
            limit=1
        )
        
        if not result[0]:
            raise HTTPException(status_code=404, detail="Không tìm thấy face embedding")
        
        point = result[0][0]
        image_base64 = point.payload.get("image_base64")
        
        if not image_base64:
            raise HTTPException(status_code=404, detail="Không có ảnh được lưu")
        
        return {
            "user_id": user_id,
            "name": point.payload.get("name"),
            "image_base64": image_base64,
            "registered_at": point.payload.get("registered_at")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")

# ====================== HEALTH CHECK ======================

@app.get("/health")
async def health_check():
    """Kiểm tra trạng thái collections"""
    collections_status = {}
    
    for coll_name in [FACE_COLLECTION, USERS_COLLECTION, ATTENDANCE_COLLECTION]:
        try:
            exists = client.collection_exists(coll_name)
            collections_status[coll_name] = {
                "exists": exists,
                "status": "ok" if exists else "missing"
            }
            if not exists:
                try:
                    vector_size = 512 if coll_name == FACE_COLLECTION else 1
                    ensure_collection_exists(coll_name, vector_size)
                    collections_status[coll_name]["status"] = "created"
                except Exception as e:
                    collections_status[coll_name]["error"] = str(e)
        except Exception as e:
            collections_status[coll_name] = {
                "exists": False,
                "status": "error",
                "error": str(e)
            }
    
    all_ok = all(c.get("status") in ["ok", "created"] for c in collections_status.values())
    
    return {
        "status": "healthy" if all_ok else "degraded",
        "collections": collections_status,
        "face_recognition_config": {
            "model": FACE_MODEL,
            "detector": FACE_DETECTOR,
            "threshold": SIMILARITY_THRESHOLD
        }
    }

# ====================== ADMIN MANAGEMENT ======================

@app.post("/admin/create-admin")
async def create_admin(
    email: str = Form(...),
    name: str = Form(...),
    password: str = Form(...),
    department: str = Form("Chung")
):
    """Tạo tài khoản admin"""
    existing = get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=400, detail="Email đã tồn tại")

    hashed_password = pwd_context.hash(password)
    user_id = str(uuid.uuid4())
    created_at = datetime.now().isoformat()

    point = PointStruct(
        id=str(uuid.uuid4()),
        vector=[0.0],
        payload={
            "user_id": user_id,
            "email": email,
            "name": name,
            "password": hashed_password,
            "role": "admin",
            "department": department,
            "face_registered": False,
            "created_at": created_at
        }
    )

    client.upsert(collection_name=USERS_COLLECTION, points=[point])

    return {
        "message": "Tạo tài khoản admin thành công",
        "user": {
            "id": user_id,
            "email": email,
            "name": name,
            "role": "admin",
            "department": department,
            "face_registered": False
        }
    }

@app.post("/admin/update-role")
async def update_user_role(data: UpdateUserRoleRequest):
    """Cập nhật role của user (chỉ admin mới có quyền)"""
    if data.role not in ["admin", "employee"]:
        raise HTTPException(status_code=400, detail="Role phải là 'admin' hoặc 'employee'")
    
    user_data = get_user_by_id(data.user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    
    result = client.scroll(
        collection_name=USERS_COLLECTION,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="user_id", match=MatchValue(value=data.user_id))
            ]
        ),
        limit=1
    )
    
    if result[0]:
        point_id = result[0][0].id
        user_payload = result[0][0].payload.copy()
        user_payload["role"] = data.role
        
        update_point = PointStruct(
            id=point_id,
            vector=[0.0],
            payload=user_payload
        )
        client.upsert(collection_name=USERS_COLLECTION, points=[update_point])
        
        return {
            "message": f"Cập nhật role thành {data.role} thành công",
            "user_id": data.user_id,
            "role": data.role
        }
    
    raise HTTPException(status_code=404, detail="User không tồn tại")

# ====================== RUN ======================

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("Starting AttendAI API Server...")
    print("=" * 50)
    print(f"Qdrant URL: {os.getenv('QDRANT_URL', 'Not set')}")
    print(f"Face Recognition Config:")
    print(f"  - Model: {FACE_MODEL}")
    print(f"  - Detector: {FACE_DETECTOR}")
    print(f"  - Threshold: {SIMILARITY_THRESHOLD}")
    print(f"Collections:")
    print(f"  - {FACE_COLLECTION}: {'✓' if client.collection_exists(FACE_COLLECTION) else '✗'}")
    print(f"  - {USERS_COLLECTION}: {'✓' if client.collection_exists(USERS_COLLECTION) else '✗'}")
    print(f"  - {ATTENDANCE_COLLECTION}: {'✓' if client.collection_exists(ATTENDANCE_COLLECTION) else '✗'}")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)