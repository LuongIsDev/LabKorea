// lib/gps.ts

// Phòng Hải Quảng Yên - Địa điểm điểm danh
export const ICTU_LOCATION = {
  name: 'Phòng Hải, Tx. Quảng Yên, Quảng Ninh',
  latitude: 20.90864734456316,
  longitude: 106.8337942412089,
  radiusMeters: 500, // bán kính cho phép (mét)
};

export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Bán kính Trái Đất (mét)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function checkGPSLocation(): Promise<{ ok: boolean; distance: number; coords: { latitude: number; longitude: number } }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS không khả dụng'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = getDistanceMeters(
          pos.coords.latitude, 
          pos.coords.longitude, 
          ICTU_LOCATION.latitude, 
          ICTU_LOCATION.longitude
        );
        resolve({
          ok: dist <= ICTU_LOCATION.radiusMeters,
          distance: Math.round(dist),
          coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}