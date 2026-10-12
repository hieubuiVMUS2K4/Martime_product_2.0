# BÁO CÁO KIỂM TRA HIỆN TRẠNG & ĐỀ XUẤT NÂNG CẤP HỆ THỐNG DANH MỤC DATABASE
**Hệ thống Quản lý Hàng hải Toàn diện (Maritime Shore & Edge Product)**  
*Ngày kiểm tra: 12/10/2026*

---

## 1. TỔNG QUAN MỤC ĐÍCH KIỂM TRA
Kiểm tra tính đầy đủ, đồng bộ và khả năng hoạt động thực tế của toàn bộ các bảng danh mục (Master Data / Catalog / Lookups) trên 2 môi trường Cơ sở dữ liệu:
- **Shore Database:** `productdb` (PostgreSQL 15, Port 5434)
- **Edge Database:** `maritime_edge` (PostgreSQL 15, Port 5433)
Đồng thời đối chiếu với các ComboBox / Dropdown trên 2 ứng dụng Giao diện người dùng (**Shore Frontend** và **Edge Frontend**) để phát hiện các trường hợp:
1. ComboBox bị trống do bảng danh mục trong DB không có dữ liệu (0 bản ghi).
2. Dữ liệu bị kẹt bản ghi thử nghiệm làm lỗi cơ chế tự động nạp (Seed) danh mục chuẩn.
3. Các trường nghiệp vụ cốt lõi đang phải nhập tay tự do (Free Text), chưa có danh mục chuẩn hóa.
4. Thiếu hụt các loại danh mục bắt buộc theo quy chuẩn hàng hải quốc tế (SOLAS, MARPOL, STCW, ISM Code, ISPS, MLC 2006).

---

## 2. BẢNG TỔNG HỢP HIỆN TRẠNG KIỂM TRA TOÀN BỘ DANH MỤC TRONG DB

| STT | Tên bảng danh mục | Shore DB | Edge DB | Trạng thái ComboBox Frontend | Mức độ nghiêm trọng | Hiện trạng & Vấn đề phát hiện |
|:---:|---|:---:|:---:|:---:|:---:|---|
| **1** | `drill_types` *(Loại diễn tập an toàn SOLAS/ISPS)* | *N/A (Chỉ có ở Edge)* | **0 bản ghi (RỖNG)** | ❌ **Liệt chức năng** | **Khẩn cấp** | Form lên lịch/sửa diễn tập (`DrillEditModal`) load API bị rỗng, không thể chọn loại diễn tập. Trong bản dump cũ có sẵn 15+ loại diễn tập nhưng migration bị rỗng do `// Automatic data seeding has been removed`. |
| **2** | `store_locations` *(Kho & Vị trí kho lưu vật tư)* | **0 bản ghi (RỖNG)** | **0 bản ghi (RỖNG)** | ❌ **Liệt chức năng** | **Khẩn cấp** | Phiếu nhập kho (`StockReceiptPage`), Form vật tư (`ItemFormModal`), Trang quản lý kho (`StoreLocationPage`): ComboBox chọn kho bị trống trơn, không thể gán vị trí lưu kho. |
| **3** | `equipment_groups` *(Nhóm hệ thống / Nhóm thiết bị PMS)* | **0 bản ghi (RỖNG)** | **0 bản ghi (RỖNG)** | ❌ **Liệt chức năng** | **Khẩn cấp** | Form tạo thiết bị (`AddAssetModal`) và Form tạo lịch bảo dưỡng theo nhóm (`AddScheduleModal`): Dropdown chọn nhóm thiết bị bị trống, báo lỗi không cho tạo lịch. |
| **4** | `schedule_checklist_templates` *(Mẫu checklist bảo dưỡng)* | **0 bản ghi (RỖNG)** | **0 bản ghi (RỖNG)** | ⚠️ **Thiếu dữ liệu** | **Trung bình** | Lịch bảo dưỡng định kỳ PMS không có sẵn các mẫu danh mục kiểm tra kỹ thuật (Checklist). |
| **5** | `sms_form_templates` *(Mẫu biểu an toàn điện tử SMS)* | **0 bản ghi (RỖNG)** | **0 bản ghi (RỖNG)** | ❌ **Liệt chức năng** | **Cao** | Thư viện biểu mẫu an toàn trống trơn, không có biểu mẫu mẫu để thuyền viên áp dụng. |
| **6** | `sms_procedures` *(Quy trình an toàn SMS - ISM Code)* | **1 bản ghi (Dữ liệu test)** | **1 bản ghi (Dữ liệu test)** | ❌ **Bị kẹt dữ liệu rác** | **Cao** | Tồn tại 1 dòng test cá nhân (`Nhóm 3 Tinh.V.D Linh.N.T.M`), làm chặn cơ chế `SmsSeedData.cs` nạp 16 chương quy trình chuẩn ISM Code và các form template đi kèm. |
| **7** | `equipment_assets` *(Danh mục thiết bị kỹ thuật tàu)* | **1 bản ghi (Mẫu)** | **1 bản ghi (Mẫu)** | ⚠️ **Không đủ vận hành** | **Cao** | Hệ thống PMS chỉ có đúng 1 thiết bị, không đủ các hệ thống máy móc chính (Máy chính, Máy phát phụ, Nồi hơi, Máy nén khí, Máy lái...) để lập kế hoạch bảo dưỡng. |
| **8** | `ports` *(Cảng biển)* | **83 bản ghi** | **83 bản ghi** | ⚠️ **Chưa đồng bộ UI** | **Trung bình** | Database đã có 83 cảng rất tốt, nhưng một số màn hình (như Bunker Report) người dùng vẫn phải gõ text tay thay vì có ComboBox chọn từ bảng `ports`. |
| **9** | `countries` *(Quốc gia / Quốc tịch)* | **15 bản ghi** | **15 bản ghi** | ⚠️ **Thiếu quốc gia** | **Thấp** | Có 15 nước lớn, nhưng thiếu một số cờ tàu thuận tiện (FOC) và nguồn thuyền viên quốc tế lớn (*Bahamas, Cyprus, Malta, Vanuatu, Myanmar, Ukraine...*). |
| **10** | `certificates` *(Chứng chỉ thuyền viên)* | **15 bản ghi** | **15 bản ghi** | ⚠️ **Thiếu chứng chỉ STCW** | **Trung bình** | Có 15 chứng chỉ cơ bản, nhưng thiếu các chứng chỉ chuyên ngành bắt buộc STCW (*DSD, SAT, PSCRB, BTOCT, ATOT, ATCT, MLC_MED*). |
| **11** | `ranks` *(Chức danh thuyền viên)* | **35 bản ghi** | **35 bản ghi** | ✅ **Đầy đủ** | **Thấp** | Đã có 35 chức danh chuẩn từ Thuyền trưởng đến thuyền viên hỗ trợ. Tuy nhiên `AddAssetModal` đang hardcode mảng text thay vì đọc từ DB. |
| **12** | `material_categories` *(Danh mục phân loại vật tư)* | **29 bản ghi** | **29 bản ghi** | ✅ **Đầy đủ** | **Thấp** | 29 danh mục phân cấp cha - con đầy đủ (Phụ tùng máy, Sơn, Dầu mỡ, Vật tư làm sạch...). |
| **13** | `report_types` *(Loại báo cáo hàng hải)* | **5 bản ghi** | **5 bản ghi** | ✅ **Đầy đủ** | **Thấp** | NOON, DEPARTURE, ARRIVAL, BUNKER, POSITION. |
| **14** | `manning_positions` & `vessel_manning_standards` | **0 bản ghi (RỖNG)** | *N/A* | ⚠️ **Chưa kích hoạt** | **Thấp** | Bảng cấu hình định biên an toàn thuyền viên của tàu chưa có dữ liệu mẫu. |

---

## 3. CÁC TRƯỜNG NGHIỆP VỤ ĐANG THIẾU COMBOBOX (HIỆN TẠI ĐANG NHẬP TAY TEXT TỰ DO)

1. **Loại hàng hóa (Cargo Type):**
   - **Vị trí:** Kế hoạch chuyến đi (`VoyageFormPage.tsx` - dòng 310, 460) và Báo cáo đến cảng (`ArrivalReport`).
   - **Hiện trạng:** Đang là ô `<input type="text">` tự do ("than", "quặng", "container", "gạo", "dầu thô"...), dễ sai chính tả và không thể lọc/thống kê chuẩn hóa.
   - **Đề xuất:** Chuẩn hóa ComboBox danh mục loại hàng hải: Dry Bulk, Container, General Cargo, Liquid Bulk, Gas (LPG/LNG), Ro-Ro...

2. **Tổ chức Đăng kiểm tàu (Classification Society):**
   - **Vị trí:** Hồ sơ đặc tính tàu (`ShipDataPage.tsx` - tab Đăng kiểm & Cờ).
   - **Hiện trạng:** Ô nhập text tay `classSocietyName`.
   - **Đề xuất:** ComboBox chọn từ danh mục các tổ chức đăng kiểm thuộc IACS (*VR - Đăng kiểm VN, DNV, Lloyd's Register, ABS, Bureau Veritas, ClassNK, RINA, KR, CCS...*).

3. **Đơn vị tính vật tư (Unit of Measure - UoM):**
   - **Vị trí:** Thêm vật tư (`ItemFormModal.tsx`), Phiếu yêu cầu vật tư, Phiếu nhập kho.
   - **Hiện trạng:** Ô nhập text tay `unit`, người dùng gõ không đồng nhất ("PCS", "Cái", "bộ", "Kg", "lít"...).
   - **Đề xuất:** Cung cấp ComboBox chọn đơn vị chuẩn (*PCS, SET, KG, TON, MTR, LTR, DRUM, PAIR, BOX, ROLL, CAN...*).

4. **Kho lưu trữ trong Form Thêm vật tư:**
   - **Vị trí:** `ItemFormModal.tsx` trường "Kho lưu trữ" (dòng 258).
   - **Hiện trạng:** Đang là ô text nhập tay (`formData.location`).
   - **Đề xuất:** Đổi sang ComboBox chọn từ danh sách bảng `store_locations`.

5. **Chọn Cảng biển trong Bunker Report:**
   - **Vị trí:** `BunkerReportForm.tsx` (dòng 407-434).
   - **Hiện trạng:** Người dùng tự gõ `Port Name` và `Port Code` bằng tay.
   - **Đề xuất:** Chuyển sang dùng component `PortSelect` để chọn nhanh từ 83 cảng biển đã có sẵn trong bảng `ports`.

---

## 4. BẢNG ĐỀ XUẤT NỘI DUNG DỮ LIỆU SEED CHI TIẾT CẦN BỔ SUNG

### Đề xuất 1: Nạp 15 Loại Diễn tập An toàn (`drill_types`) cho Edge DB
Dữ liệu chuẩn theo quy định SOLAS Chapter III, ISPS Code và ISM Code:

| Mã diễn tập (`drill_code`) | Tên diễn tập (`drill_name`) | Chu kỳ (`frequency_type`) | Số ngày (`frequency_days`) | Vai trò phụ trách | Quy chuẩn |
|---|---|:---:|:---:|:---:|---|
| `ABANDON_SHIP_MONTHLY` | Diễn tập bỏ tàu hàng tháng (Abandon ship drill) | MONTHLY | 30 | MASTER | SOLAS III 19.3.2 |
| `ABANDON_SHIP_ON_DEPARTURE` | Diễn tập bỏ tàu khi đổi >25% thuyền viên | ON_EVENT | 1 | MASTER | SOLAS III 19.3.2 |
| `FIRE_DRILL_MONTHLY` | Diễn tập phòng cháy chữa cháy hàng tháng (Fire drill) | MONTHLY | 30 | CHIEF_OFFICER | SOLAS III 19.3.2 |
| `FIRE_DRILL_ON_DEPARTURE` | Diễn tập PCCC trong vòng 24h sau rời cảng | ON_EVENT | 1 | CHIEF_OFFICER | SOLAS III 19.3.2 |
| `RESCUE_BOAT_QUARTERLY` | Diễn tập hạ và điều động xuồng cứu nạn (Rescue boat) | QUARTERLY | 90 | CHIEF_OFFICER | SOLAS III 19.3.4 |
| `ENCLOSED_SPACE_BIMONTHLY` | Diễn tập vào và cứu nạn trong không gian kín | BI_MONTHLY | 60 | CHIEF_OFFICER | SOLAS III 19.3.3 |
| `EMERGENCY_STEERING_QUARTERLY` | Diễn tập lái khẩn cấp buồng máy lái (Emergency steering) | QUARTERLY | 90 | CHIEF_ENGINEER | SOLAS V 26 |
| `SOPEP_OIL_SPILL_QUARTERLY` | Diễn tập ứng phó sự cố tràn dầu trên biển (SOPEP drill) | QUARTERLY | 90 | CHIEF_OFFICER | MARPOL Annex I |
| `SECURITY_DRILL_QUARTERLY` | Diễn tập an ninh tàu biển định kỳ (ISPS Security drill) | QUARTERLY | 90 | MASTER | ISPS Code A/13.4 |
| `SECURITY_DRILL_ON_NEW_CREW` | Diễn tập an ninh khi có thuyền viên mới gia nhập | ON_EVENT | 7 | MASTER | ISPS Code A/13.4 |
| `SECURITY_EXERCISE_ANNUAL` | Thực tập an ninh toàn diện hàng năm (ISPS Exercise) | ANNUAL | 365 | MASTER | ISPS Code A/13.5 |
| `CYBER_SECURITY_QUARTERLY` | Diễn tập an ninh mạng hàng hải (Cyber security drill) | QUARTERLY | 90 | MASTER | IMO MSC-FAL.1 |
| `COLLISION_GROUNDING_ANNUAL` | Diễn tập đâm va và mắc cạn (Collision & Grounding) | ANNUAL | 365 | MASTER | SOLAS III 19 |
| `MAN_OVERBOARD_QUARTERLY` | Diễn tập cứu vớt người rơi xuống nước (Man Overboard) | QUARTERLY | 90 | CHIEF_OFFICER | SOLAS III 19 |
| `FAMILIARIZATION_ON_JOINING` | Huấn luyện làm quen tàu khi thuyền viên mới lên tàu | ON_EVENT | 1 | MASTER | STCW A-I/6 |

---

### Đề xuất 2: Nạp Cây Danh mục Vị trí / Kho lưu trữ (`store_locations`) cho Cả 2 DB
Thiết kế theo cấu trúc phân cấp chuẩn của tàu vận tải biển:

| Mã vị trí (`LocationCode`) | Tên vị trí / Kho (`Name`) | Mã kho cha (`ParentCode`) | Mô tả chức năng |
|---|---|:---:|---|
| `DECK-DEPT` | Bộ phận Boong (Deck Department Stores) | *(Gốc)* | Toàn bộ kho thuộc ngành boong |
| `DECK-STORE` | Kho vật tư boong (Main Deck Store) | `DECK-DEPT` | Lưu trữ cáp, dây buộc tàu, manille, dụng cụ boong |
| `PAINT-LCK` | Kho sơn boong (Paint Locker) | `DECK-DEPT` | Lưu trữ thùng sơn, dung môi, chổi sơn, rulo |
| `BOSUN-ST` | Kho thủy thủ trưởng (Bosun Store) | `DECK-DEPT` | Dụng cụ thao tác neo, dây, thiết bị bảo hộ boong |
| `SAFETY-LCK` | Kho thiết bị an toàn (Safety Equipment Locker) | `DECK-DEPT` | Bình thở SCBA, quần áo chống cháy, phao cứu sinh |
| `ENG-DEPT` | Bộ phận Buồng máy (Engine Department Stores) | *(Gốc)* | Toàn bộ kho thuộc ngành máy |
| `ENG-STORE` | Kho vật tư buồng máy (Engine Room Store) | `ENG-DEPT` | Phụ tùng máy, gioăng đệm, bu-lông, đai ốc |
| `CHEM-LCK` | Kho hóa chất buồng máy (Chemical Locker) | `ENG-DEPT` | Hóa chất xử lý nước lò hơi, dung dịch tẩy rửa sinh hàn |
| `STEER-RM` | Buồng máy lái (Steering Gear Room Store) | `ENG-DEPT` | Phụ tùng và dầu thủy lực dự phòng hệ thống máy lái |
| `ELEC-WKSP` | Xưởng điện & Điện tử (Electrical Workshop) | `ENG-DEPT` | Cầu chì, bóng đèn, cảm biến, dây điện, đồng hồ đo |
| `PROV-DEPT` | Bộ phận Quản trị / Thực phẩm (Provision & Catering) | *(Gốc)* | Toàn bộ kho thực phẩm và quản trị |
| `PROV-DRY` | Kho thực phẩm khô (Dry Provision Store) | `PROV-DEPT` | Gạo, đồ hộp, gia vị, ngũ cốc |
| `PROV-COLD` | Kho lạnh thực phẩm (Cold Store / Reefer Room) | `PROV-DEPT` | Thịt, cá, rau củ quả bảo quản lạnh |
| `BONDED-ST` | Kho miễn thuế (Bonded Store) | `PROV-DEPT` | Thuốc lá, nước giải khát, hàng miễn thuế do Thuyền trưởng giữ |

---

### Đề xuất 3: Nạp 11 Nhóm Thiết bị Kỹ thuật (`equipment_groups`) cho Cả 2 DB

| Mã nhóm (`GroupCode`) | Tên nhóm thiết bị (`GroupName`) | Phân loại (`Category`) | Ngành (`Department`) | Chức danh phụ trách |
|---|---|---|:---:|:---:|
| `GRP-PROPULSION` | Hệ thống Động lực chính (Main Propulsion System) | `ENGINE` | `ENGINE` | `C/E` *(Máy trưởng)* |
| `GRP-POWER-GEN` | Hệ thống Phát điện & Năng lượng (Diesel Generators) | `GENERATOR` | `ENGINE` | `2/E` *(Máy hai)* |
| `GRP-BOILER` | Hệ thống Nồi hơi & Trao đổi nhiệt (Auxiliary Boiler) | `BOILER` | `ENGINE` | `3/E` *(Máy ba)* |
| `GRP-COMP-AIR` | Hệ thống Khí nén & Bình gió (Compressed Air System) | `COMPRESSOR` | `ENGINE` | `4/E` *(Máy tư)* |
| `GRP-PUMPS-BILGE` | Hệ thống Bơm dằn & La-de (Ballast & Bilge System) | `PUMP` | `ENGINE` | `3/E` *(Máy ba)* |
| `GRP-PURIFIERS` | Hệ thống Lọc phân ly dầu (Fuel & Lube Oil Purifiers) | `SEPARATOR` | `ENGINE` | `2/E` *(Máy hai)* |
| `GRP-STEERING` | Hệ thống Máy lái & Bánh lái (Steering Gear System) | `ENGINE` | `ENGINE` | `C/E` *(Máy trưởng)* |
| `GRP-DECK-MACH` | Máy móc boong, Tời neo & Buộc tàu (Mooring & Windlass) | `DECK_MACHINERY` | `DECK` | `C/O` *(Đại phó)* |
| `GRP-NAV-COMM` | Thiết bị Hàng hải & Thông tin buồng lái (Bridge Nav) | `NAVIGATION` | `DECK` | `2/O` *(Phó hai)* |
| `GRP-LIFESAVING` | Thiết bị Cứu sinh (Life Saving Appliances) | `SAFETY` | `DECK` | `C/O` *(Đại phó)* |
| `GRP-FIREFIGHTING`| Thiết bị Phòng cháy Chữa cháy (Fire Fighting Appliances) | `SAFETY` | `ENGINE` | `C/E` *(Máy trưởng)* |

---

### Đề xuất 4: Bổ sung 8 Thiết bị Mẫu cốt lõi (`equipment_assets`) để vận hành ngay PMS

1. **Máy chính (Main Engine):** `ME-01` - MAN B&W 6S50MC-C (Công suất: 9,480 kW, Criticality: `CRITICAL`).
2. **Máy phát điện số 1 (Diesel Generator No.1):** `DG-01` - Yanmar 6EY18AL (Công suất: 600 kW, Criticality: `HIGH`).
3. **Máy phát điện số 2 (Diesel Generator No.2):** `DG-02` - Yanmar 6EY18AL (Công suất: 600 kW, Criticality: `HIGH`).
4. **Nồi hơi phụ (Auxiliary Boiler):** `AB-01` - KangRim Marine Steam Boiler (Áp suất: 0.7 MPa, Criticality: `NORMAL`).
5. **Máy nén khí chính 1 (Main Air Compressor No.1):** `AC-01` - Sperre HL2/105 (Áp suất: 30 bar, Criticality: `NORMAL`).
6. **Máy phân ly dầu FO (HFO Purifier):** `PUR-01` - Alfa Laval S 921 (Công suất: 1,850 L/h, Criticality: `HIGH`).
7. **Bơm dằn chính (Main Ballast Pump):** `BP-01` - Shinko Centrifugal Pump (Lưu lượng: 400 m³/h, Criticality: `NORMAL`).
8. **Máy lái thủy lực (Hydraulic Steering Gear):** `SG-01` - Yoowon Electro-Hydraulic 2-Ram 4-Cylinder (Criticality: `CRITICAL`).

---

### Đề xuất 5: Xử lý và Tái kích hoạt toàn bộ Quy trình SMS (`sms_procedures` & `sms_form_templates`)
1. **Dọn dẹp bản ghi test:** Xóa bản ghi thử nghiệm `18510095-6c26-48f2-9216-3920d6340baa` (`Nhóm 3 Tinh.V.D Linh.N.T.M`).
2. **Kích hoạt chạy `SmsSeedData.cs`:**
   - Nạp đầy đủ **16 Quy trình Quản lý An toàn (SOP)** chuẩn hóa tương ứng 16 chương của ISM Code.
   - Nạp các **Biểu mẫu an toàn điện tử đi kèm (`BM-01` đến `BM-16`)** để form dropdown liên kết quy trình hoạt động trơn tru.

---

### Đề xuất 6: Bổ sung Chứng chỉ STCW và Quốc gia Cờ thuận tiện
- **Bổ sung bảng `certificates`:**
  - `DSD`: Nhiệm vụ an ninh chỉ định (Designated Security Duties - STCW VI/6-2).
  - `SAT`: Nhận thức an ninh (Security Awareness Training - STCW VI/6-1).
  - `PSCRB`: Điều khiển xuồng bè cứu sinh (Proficiency in Survival Craft - STCW VI/2).
  - `MLC_MED`: Chứng chỉ khám sức khỏe quốc tế thuyền viên theo MLC 2006.
  - `BTOCT`: Huấn luyện cơ bản làm hàng tàu dầu & hóa chất (STCW V/1-1).
  - `ATOT`: Huấn luyện nâng cao làm hàng tàu dầu (STCW V/1-1).
  - `ATCT`: Huấn luyện nâng cao làm hàng tàu hóa chất (STCW V/1-1).
- **Bổ sung bảng `countries`:**
  - `BHS` (Bahamas), `CYP` (Cyprus), `MLT` (Malta), `VUT` (Vanuatu), `MYS` (Malaysia), `MMR` (Myanmar), `UKR` (Ukraine).

---

### Đề xuất 7: Chuẩn hóa ComboBox trên Frontend
1. **Loại hàng hóa (Cargo Type):** Cung cấp Dropdown chuẩn trên `VoyageFormPage` và `ArrivalReport`:
   - `Dry Bulk` (Than, Quặng, Ngũ cốc, Clinker), `Container`, `General Cargo / Breakbulk`, `Liquid Bulk` (Dầu thô, Dầu thành phẩm, Hóa chất), `Gas` (LPG, LNG), `Ro-Ro / Vehicles`.
2. **Tổ chức Đăng kiểm (Classification Societies):** Thêm Dropdown chuẩn trên `ShipDataPage`:
   - `VR` (Đăng kiểm Việt Nam), `DNV`, `LR` (Lloyd's Register), `ABS` (American Bureau of Shipping), `BV` (Bureau Veritas), `ClassNK` (Nippon Kaiji Kyokai), `RINA`, `KR` (Korean Register), `CCS` (China Classification Society).
3. **Đơn vị tính vật tư (Unit of Measure):** Thêm Dropdown chuẩn trên `ItemFormModal`:
   - `PCS` (Cái), `SET` (Bộ), `KG` (Kilogram), `TON` (Tấn), `MTR` (Mét), `LTR` (Lít), `DRUM` (Phuy), `PAIR` (Đôi), `BOX` (Hộp), `ROLL` (Cuộn), `CAN` (Can).
4. **Kho lưu trữ trong Form Vật tư:** Đổi ô text `location` thành Dropdown đọc dữ liệu động từ API `store_locations`.
5. **Cảng biển trong Bunker Report:** Tích hợp `PortSelect` vào `BunkerReportForm` để chọn từ 83 cảng biển trong DB.

---

## 5. KẾ HOẠCH TRIỂN KHAI SAU KHI ĐƯỢC DUYỆT

1. **Bước 1:** Viết script SQL migration/seeding cho Shore Database (`productdb`) và Edge Database (`maritime_edge`).
2. **Bước 2:** Chạy nạp dữ liệu vào cả 2 database container và xác nhận số lượng bản ghi thực tế.
3. **Bước 3:** Cập nhật các component giao diện Frontend (Shore & Edge) để chuyển các trường text tự do sang ComboBox chuẩn hóa.
4. **Bước 4:** Kiểm thử trực tiếp luồng tạo mới trên các màn hình PMS, Diễn tập, Nhập kho và Hải trình.


---

## 6. K?T QU? X? L? NG?Y 12/10/2026

?? th?c hi?n s?a m? ngu?n, sao l?u v? n?p b? sung tr?n c? hai database ?ang ch?y. Script ch?y trong transaction ri?ng cho t?ng node, tra c?u kh?a nghi?p v? tr??c khi th?m, d?ng UUID c? ??nh cho b?n ghi m?u v? c?p nh?t sequence c?a ID s? nguy?n. Ch?y l?i kh?ng t?o b?n ghi tr?ng v? kh?ng ghi ?? danh m?c ?? ???c ch?nh s?a. B?n ghi test SMS ???c x?a theo c? ID v? ti?u ?? ?? x?c ??nh; b?n dump tr??c khi s?a gi? l?i t?i li?u v? l?ch s?.

| Danh m?c | Shore sau x? l? | Edge sau x? l? |
|---|---:|---:|
| `store_locations` | 14 | 14 |
| `equipment_groups` | 11 | 11 |
| `equipment_assets` | 9 | 9 |
| `schedule_checklist_templates` | 24 | 24 |
| `sms_procedures` | 16 | 16 |
| `sms_form_templates` | 16 | 16 |
| `countries` | 22 | 22 |
| `certificates` | 22 | 22 |
| `drill_types` | N/A | 15 |
| `vessel_manning_standards` | 1 | N/A |
| `manning_positions` | 7 | N/A |

### Thay ??i m? ngu?n v? giao di?n

- S?a `SmsSeedData.cs` ? c? Shore v? Edge: b? sung t?ng ISM topic/SOP/bi?u m?u c?n thi?u khi d? li?u ?? t?n t?i, gi? n?i dung c?ng ty. Edge v?n gi? quy t?c m?c ??nh kh?ng t? t?o l?i quy tr?nh do Shore qu?n l?.
- B? sung controller `/api/equipment-groups` tr?n Shore. ??y l? l?i b? sung ngo?i b?o c?o: frontend ?? g?i API n?y nh?ng backend ch?a tri?n khai n?n tr? 404. H? tr? danh s?ch, chi ti?t, t?o/s?a, ng?ng s? d?ng, danh s?ch th?nh vi?n v? th?m/b? li?n k?t thi?t b?; th?m c?ng m?t thi?t b? nhi?u l?n kh?ng t?o th?nh vi?n tr?ng.
- Chuy?n ??n v? t?nh sang dropdown ? form v?t t?, y?u c?u v?t t? v? nh?p kho tr?n c? Shore/Edge. Kho trong form v?t t? l?y t? API; ch?c danh trong `AddAssetModal` l?y t? database.
- Chuy?n lo?i h?ng ? k? ho?ch chuy?n ?i v? b?o c?o Arrival sang dropdown; ??ng ki?m d?ng dropdown ? c? h? s? t?u Shore v? Edge.
- Bunker Report d?ng `PortCombobox` s?n c? c?a Edge, t? ?i?n t?n v? m? c?ng c?ng l?c. Gi? gi? tr? c? kh?ng c? trong danh m?c khi m? h? s? ?? tr?nh m?t d? li?u.
- ?? c?p nh?t b?n build frontend trong hai container ?ang ch?y v? assembly backend Shore ?? endpoint nh?m thi?t b? ho?t ??ng. C?c b?n g?c n?m trong `artifacts/catalog-audit-runtime-backup/`. ?? build l?i b?n Docker image Shore/Edge v? recreate c?c container backend/frontend b?ng Docker Compose ng?y 12/10/2026; thay ??i hi?n ?? n?m trong image v? ???c gi? khi recreate container.

### ?i?u ch?nh n?i dung ?? xu?t theo schema th?c t?

- `schedule_checklist_templates` c? FK b?t bu?c t?i l?ch b?o d??ng. ?? t?o 8 l?ch m?u ch?a k?ch ho?t, m?i l?ch 3 checkpoint. C?n x?c nh?n chu k?/gi?i h?n k? thu?t theo manual thi?t b? tr??c khi k?ch ho?t; c?c m?u n?y kh?ng t? sinh c?ng vi?c.
- ??nh bi?n c? FK t?i t?u: t?o m?t ti?u chu?n m?u ch?a k?ch ho?t cho t?u ?ang c? tr?n Shore, g?m 7 v? tr? minh h?a. S? l??ng ph?i ???c c?p nh?t theo Safe Manning Document th?c t? tr??c khi s? d?ng.
- B? seed SMS c? ch? ch?a 7 SOP m?u v? TL-26, kh?ng ch?a 16 SOP ??y ?? nh? nh?n ??nh ban ??u. ?? th?m `SOP-01-01` ??n `SOP-16-01`, `BM-01` ??n `BM-16` d??i d?ng **khung nh?p**, c? tr??ng ng?y/ng??i ph? tr?ch/n?i dung/h?nh ??ng. ??y ch?a ph?i quy tr?nh v?n h?nh ?? ho?n thi?n ho?c ???c ph? duy?t. 16 ch? ?? c?a ph?n m?m kh?ng ???c coi l? ?nh x? ch?nh th?c 16 ?i?u kho?n ISM.
- Thi?t b? th?m l? d? li?u minh h?a theo ?? xu?t, c? ghi ch? y?u c?u x?c nh?n thi?t b?/model th?c t?. Ch?ng ch? chuy?n ng?nh kh?ng ?p d?ng b?t bu?c cho m?i ch?c danh/t?u; gi? tr? `IsMandatory` ?? false, c?n c?u h?nh ma tr?n ?p d?ng theo nghi?p v?.
- Lo?i di?n t?p gi? chu k? c?a ?? xu?t ?? l?m m?u c?u h?nh; c?n x?c nh?n ph?m vi ?p d?ng v?i SMS ???c duy?t c?a t?u. Script kh?ng t? t?o l?ch hay t? g?n c? b?t bu?c cho m?i t?u.

### C?ch ch?y l?i v? ki?m tra

```powershell
python scripts/database/build_catalog_audit_seed.py
python scripts/database/apply_catalog_audit.py
python scripts/database/verify_catalog_audit.py
```

`apply_catalog_audit.py` sao l?u c? hai database tr??c khi s?a node ??u ti?n, d?ng khi psql b?o l?i v? ghi log ri?ng t?ng node. N?u node th? hai l?i, node th? nh?t c? th? ?? commit; s?a l?i r?i ch?y l?i ???c. File SQL h? tr? t?n c?t PascalCase tr?n Shore v? snake_case tr?n Edge, c? th? ch?y ri?ng b?ng `psql -v ON_ERROR_STOP=1 -f scripts/database/catalog_audit_2026_10_12.sql`. Backup ??u ti?n t?i `artifacts/database-backups/20261012T034717Z/`.

### K?t qu? ki?m tra

- Build backend Shore/Edge v? frontend Shore/Edge: ??t. Edge backend c?n c?nh b?o EF1002 c? s?n ? `EdgeVesselSwitchService.cs`; frontend c?n c?nh b?o k?ch th??c bundle.
- Ki?m th? Edge: 10/10 test SMS ownership v? s?a seed ??t.
- Hai test Shore m?i ch?y tr?n database PostgreSQL t?ch bi?t: ??t (nh?m thi?t b?/li?n k?t kh?ng tr?ng, seed SMS thi?u d? li?u v? gi? n?i dung c?ng ty). Project test Shore ??y ?? hi?n c? l?i bi?n d?ch ? `SyncDirectionTests.cs` v? g?i `QueueFullCrewSnapshotAsync` ?? kh?ng c?n; ki?m tra m?c ti?u d?ng project t?m b? file l?i n?y, kh?ng s?a test ngo?i ph?m vi.
- Ch?y l?i SQL nhi?u l?n: s? l??ng kh?ng t?ng. Ki?m tra trong transaction r?i rollback x?c nh?n gi? t?n kho v? quan h? cha ?? ???c ng??i d?ng ch?nh s?a; ki?m tra kho/bi?u m?u kh?ng c? li?n k?t m? c?i.
- API Shore ?ang ch?y: `/api/store-locations` tr? 200 v?i 14 kho, `/api/equipment-groups` tr? 200 v?i 11 nh?m, `/api/equipment-assets` tr? 200 v?i 9 thi?t b?.
- Ch?a ch?y ki?m th? t??ng t?c tr?nh duy?t cho c?c lu?ng t?o m?i. API Edge y?u c?u ??ng nh?p; t?i kho?n bootstrap hi?n kh?ng ??ng nh?p ???c b?ng m?t kh?u seed, n?n ch?a x?c nh?n endpoint Edge qua phi?n ng??i d?ng. Database Edge, build v? ki?m th? h?i quy ?? ???c ki?m tra nh? tr?n.


### X?c nh?n build Docker ng?y 12/10/2026

- ?? ch?y `docker compose build backend frontend` cho hai project `shore_product` v? `edge-services`, sau ?? `up -d --no-deps --force-recreate backend frontend` v?i ??ng file Compose ?ang qu?n l? container.
- C? b?n container ?ng d?ng ch?y t? image m?i, kh?ng c? l?n restart do l?i. Kh?ng recreate database ho?c thay volume.
- Shore frontend `http://localhost:3000`, Edge frontend `http://localhost:3002`: HTTP 200.
- Shore `/health/live`, `/health/ready` v? Edge `/api/health`: HTTP 200. API nh?m thi?t b? Shore tr? ??ng 11 nh?m.
- Ki?m tra l?i danh m?c sau khi recreate: s? l??ng tr?n c? hai database gi? nguy?n nh? b?ng k?t qu?.
