# components/vessel-detail/ — Các tab dữ liệu kỹ thuật tàu

## Mục đích

Các tab trong `pages/VesselManagement/VesselDetailPage.tsx` — trang hồ sơ chi tiết một con tàu.

## Cấu trúc & vai trò

| File | Tab hiển thị | Ghi chú |
|---|---|---|
| `VesselOverviewTab.tsx` | Tổng quan | Hàng trạng thái, kích thước, đăng ký, két chứa, cảnh báo/sự kiện động cơ (tự gọi API cảnh báo). |
| `VesselParticularsPanel.tsx` | 9 mục con của "Thông số tàu" (Thông tin chung … Bảo hiểm) | Một component dùng chung cho cả 9 mục, đọc cấu hình ở `vesselParticularsFields.ts`. Chế độ xem / bấm "Sửa" giống hồ sơ thuyền viên. |
| `vesselParticularsFields.ts` | — | Cấu hình tab con → nhóm → trường (nhãn, kiểu ô, đơn vị). Khóa trường = tên camelCase từ API particulars; đủ 268 trường của `Vessel`. |
| `VesselCrewTab.tsx` | Thuyền viên đang trên tàu | Tự fetch `crewApi` theo `vesselId`. |
| `VesselCertificateTab.tsx` | Chứng chỉ tàu | Tự fetch chứng chỉ của tàu. |

## Luồng "Thông số tàu" — đồng bộ hai chiều

```
VesselParticularsPanel
   │  GET  /vessels/:id/particulars      → mọi thông số (khóa camelCase)
   │  PUT  /vessels/:id/particulars      → chỉ các trường đã đổi
   ▼
Shore: VesselService.UpdateParticularsAsync → lưu Vessel
       → outbox bảng "ship_data" (chỉ các trường đổi, tên theo ShipData của tàu) → tàu
Edge:  SyncConflictHandler.ApplyShipDataAsync → áp đúng các cột đó lên ShipData (không dội ngược)
Tàu sửa: Edge gửi "ship_data" (delta) → Shore SyncInboxService.ProcessShipDataAsync
       → bỏ qua trường bờ vừa sửa mà tàu chưa áp lúc tạo bản đó (giữ giá trị bờ, hai bên ra cùng kết quả)
```

Ánh xạ tên Vessel (bờ) ↔ ShipData (tàu) ở `backend/Services/VesselParticulars.cs`: trùng tên trừ `Name`↔`ShipName`, `VesselType`↔`TypeOfVessel`, `IMO`↔`ImoNumber`. IMO không sửa được (định danh tàu, gắn với gói kết nối). `IsActive` chỉ có ở bờ.

## Ghi chú khi đọc/dạy

- Tên `VesselCertificateTab` dễ nhầm với chứng chỉ **thuyền viên** (`crew certificate`, theo dõi ở `pages/CrewManagement/RankComplianceTab.tsx`) — đây là chứng chỉ của **con tàu** (class, statutory certificates...), hoàn toàn khác đối tượng.
