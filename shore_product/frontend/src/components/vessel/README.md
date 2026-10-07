# components/vessel/ — Bản đồ theo dõi tàu

## Mục đích

2 component dựng bản đồ Leaflet hiển thị vị trí/hải trình tàu, dùng riêng cho `pages/VesselManagement/VesselTrackingPage.tsx`.

## Cấu trúc & vai trò

| File | Export | Vai trò |
|---|---|---|
| `VesselMap.tsx` | `VesselMap`, type `VesselTrackData`, `GpsPoint` | Bản đồ Leaflet (`react-leaflet` + tile OpenStreetMap, **không** dùng `@vietmap/vietmap-gl-js` dù package có cài — xem ghi chú) hỗ trợ 2 chế độ: **single** (1 tàu, `positions`+`currentPosition`, tương thích ngược) và **multi** (`vessels: VesselTrackData[]`, nhiều tàu cùng lúc, mỗi tàu 1 màu + kiểu nét đứt route riêng). Icon tàu tự vẽ bằng SVG xoay theo `courseOverGround`. Popup theo tàu hiển thị: engine running, thuyền trưởng, hướng đi, tiến độ hải trình (ATD/ETA theo `departurePort`/`arrivalPort`), tốc độ/tọa độ/mớn nước, nút "View Details" điều hướng sang `/vessels/:id`. Có sẵn lớp hiển thị tuyến "dự định Vũng Tàu → Hải Phòng" đọc từ `assets/planned-route.json`, và nhãn tiếng Việt cố định cho "Hoàng Sa"/"Trường Sa". |
| `DisasterMapLayer.tsx` | `DisasterMapLayer` (props: `visible`) | Lớp phủ cảnh báo thiên tai — gọi **trực tiếp 2 API công khai bên ngoài** (không qua Shore Backend): GDACS (`gdacsapi/api/events/geteventlist/MAP?alertlevel=Green,Orange,Red`, lọc `eventtype === 'TC'` — bão nhiệt đới) và RainViewer (`api.rainviewer.com/public/weather-maps.json`, radar mưa). Bật/tắt qua nút "Hiện/Ẩn cảnh báo thiên tai" nằm ngay trong `VesselMap`. |


## Luồng hoạt động chính

```
pages/VesselManagement/VesselTrackingPage.tsx
   │  fetch danh sách tàu + vị trí (qua ENV.API_BASE_URL, Shore Backend)
   │  build VesselTrackData[]
   ▼
components/vessel/VesselMap.tsx
   │  render <MapContainer> (react-leaflet) + <Marker> mỗi tàu + <Polyline> route
   │  nếu showDisasters=true → render <DisasterMapLayer visible/>
   ▼
components/vessel/DisasterMapLayer.tsx
   │  fetch trực tiếp gdacs.org + rainviewer.com (KHÔNG qua /api proxy của Shore)
```

## Liên kết với phần khác

- **pages/VesselManagement/VesselTrackingPage.tsx**: nơi duy nhất render `VesselMap`.
- **assets/planned-route.json**: dữ liệu tuyến cố định vẽ đường "dự định" trên bản đồ (không qua API).
- Khác với hầu hết phần còn lại của app, `DisasterMapLayer` là **ngoại lệ** của quy ước "mọi network call đi qua `services/`" — nó gọi thẳng API bên thứ ba từ trình duyệt.

## Ghi chú khi đọc/dạy

- Dự án khai báo dependency `@vietmap/vietmap-gl-js` (bản đồ nền Việt Nam, thường dùng thay OpenStreetMap để có dữ liệu Việt hoá tốt hơn) và `vite.config.ts` có sẵn proxy `/vietmap`, `/maps` → `maps.vietmap.vn`, nhưng **`VesselMap.tsx` hiện dùng `react-leaflet` + tile OpenStreetMap chuẩn**, không import `vietmap-gl-js` ở đâu cả (đã kiểm tra bằng grep). Coi đây là tích hợp dự kiến/thử nghiệm chưa hoàn thiện, không phải bản đồ đang chạy thật.
- `DisasterMapLayer` gọi thẳng ra Internet công khai (GDACS, RainViewer) — cần mạng ngoài khi test tính năng này (khác các phần còn lại của app vốn chỉ cần Shore Backend chạy local).
- `VesselMap` được thiết kế "2 trong 1" (single + multi mode) nhưng theo `VesselTrackingPage.tsx`, chế độ đang dùng thực tế là **multi** (nhiều tàu) — nhánh single-mode giữ lại chủ yếu để tương thích ngược, nên khi đọc code đừng ngạc nhiên nếu thấy nhánh đó ít được thực thi.
