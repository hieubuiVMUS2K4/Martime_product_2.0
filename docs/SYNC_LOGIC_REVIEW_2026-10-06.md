# Rà soát logic các hướng đồng bộ — 06/10/2026

> Trạng thái sau rà soát: F01–F07 đã được xử lý. Xem [bản ghi thay đổi và kiểm chứng](SYNC_DIRECTION_FIXES_2026-10-06.md). Những mô tả lỗi dưới đây ghi nhận trạng thái trước sửa.

## Kết luận và phạm vi

Đã đối chiếu source của bên phát, outbox/queue, bên nhận, bộ xử lý xung đột và giao diện Edge. Đã đọc số lượng danh mục và trạng thái hàng đợi trên hai PostgreSQL Docker đang chạy. Không ghi dữ liệu vận hành, không gọi trigger/force-push, không triển khai hoặc sửa code nghiệp vụ trong lượt review này.

Cơ chế giao nhận đã có transaction, receipt theo sự kiện/node và watermark. Tuy nhiên, logic nghiệp vụ chưa thống nhất hoàn toàn: phạm vi tàu của hải trình, quyền sở hữu field khi nhận xuống Edge và phạm vi phục hồi snapshot còn các vấn đề bên dưới. Hàng đợi rỗng không chứng minh dữ liệu hai phía đã đầy đủ hoặc có cùng nội dung.

Các phát hiện về code là kết quả phân tích tĩnh; các kịch bản tái hiện được mô tả để làm regression test khi sửa. Không chạy lại các test suite hoặc kiểm thử thao tác ghi trong lượt review này.

## Danh sách chức danh trên Edge

Danh sách hiện đã có tại **Quản lý thuyền viên → Quản lý chứng chỉ → Chứng chỉ theo chức danh** (`/crew/certificates`). Tab này có mã/tên chức danh, yêu cầu chứng chỉ và thuyền viên thuộc chức danh.

- `edge_product/frontend-edge/src/components/layouts/Sidebar.tsx`: menu chỉ có thuyền viên và chứng chỉ; chưa có mục “Danh sách chức danh”.
- `edge_product/frontend-edge/src/pages/Crew/CertificateMonitorView.tsx:342`: tải danh sách qua `maritimeService.ranks.getAll()`.
- Cùng file, dòng 1217 và 1562: tab và bảng chức danh.
- `edge_product/edge-services/Controllers/Crew/RanksController.cs:26`: `GET /api/ranks`; mặc định chỉ trả chức danh đang hoạt động, có `includeInactive=true` để xem cả chức danh ngừng dùng.

Tại thời điểm kiểm tra, **mỗi database có 17 chức danh đang hoạt động và 38 liên kết yêu cầu chứng chỉ theo chức danh**. Đây là kiểm tra số lượng, chưa phải đối soát nội dung từng bản ghi hoặc chứng minh chúng được tạo bởi sync thay vì seed.

Đề xuất giao diện: thêm mục **Danh sách chức danh** trong nhóm Quản lý thuyền viên, với bảng chỉ xem: mã, tên, bộ phận, cấp bậc, thứ tự, trạng thái và yêu cầu chứng chỉ. Việc thêm/sửa danh mục vẫn thực hiện ở bờ theo ownership hiện có.

## Các phát hiện theo mức ưu tiên

### F01 — P1: Hải trình của một tàu được broadcast xuống mọi tàu

**Source:** `shore_product/backend/Services/Voyage/VoyageService.cs:840`, `:1313`; `shore_product/backend/Services/Sync/SyncOutboxService.cs:118`, `:197`; `shore_product/backend/Data/AppDbContext.SyncOutbox.cs`; `edge_product/edge-services/Controllers/Voyage/VoyageController.cs:64`.

Create/update hải trình gọi `BroadcastAsync` cho parent và nhiều bảng con, kể cả dữ liệu tài chính. Hàm này đặt `TargetNode="*"`; pull của mọi node đều lấy các event có đích `*`. Phần tự capture cũng mặc định broadcast nếu entity không có `VesselId`; `VoyageRecord` hiện lưu `VesselIMO` thay vì `VesselId`, còn bảng con chủ yếu có `VoyageId`. API danh sách hải trình ở Edge đọc toàn bộ bản ghi cục bộ, không lọc tàu.

**Kịch bản:** tạo hải trình cho tàu A, cả Edge A và Edge B pull; B nhận cả hải trình và dữ liệu tài chính của A. Hiện database chỉ có một node đăng ký, chưa tái hiện tình huống nhiều tàu trên stack vận hành.

**Hướng xử lý:** xác định tàu từ hải trình cha, resolve về NodeId đã provisioning và enqueue riêng cho node đó; áp dụng đồng nhất cho auto-capture, create/update/delete và snapshot. Bổ sung test A/B: dữ liệu hải trình A chỉ xuất hiện trong pull A. Danh mục dùng chung vẫn có thể broadcast.

### F02 — P1: Snapshot hải trình từ bờ có thể ghi đè field vận hành trên Edge

**Source:** `edge_product/edge-services/Services/Core/SyncConflictHandler.cs:454`, `:477`; `shore_product/backend/Services/Sync/ConflictResolverService.cs:96`, `:513`.

Shore có danh sách field vận hành thuộc Edge cho `voyage_record`, như trạng thái thực hiện, thời gian đi/đến, quãng đường và nhiên liệu thực tế. Nhưng `MergeFromShore` trên Edge chỉ phân nhánh ownership cho crew, chứng chỉ và tài liệu; hải trình đi qua mặc định `shouldApply=true` cho mọi scalar có trong payload. Watermark chỉ kiểm tra thứ tự event từ Shore, không bảo vệ thay đổi cục bộ chưa được giao.

**Kịch bản:** Edge cập nhật `FuelConsumed` hoặc `DepartureTime`; một snapshot bờ đang chờ chứa số liệu cũ đến sau đó và ghi đè số liệu trên tàu, kể cả khi push cục bộ vẫn chưa thành công. Việc worker gọi push trước pull không loại trừ tình huống push lỗi hoặc snapshot bờ được tạo trước lần push đó.

**Hướng xử lý:** bảo vệ field thuộc Edge ngay tại receiver; áp dụng field kế hoạch/tài chính từ Shore và định nghĩa riêng các chuyển trạng thái mà Shore được phép quyết định. Dùng cùng một quy tắc ownership ở hai phía. Test cần kiểm tra cả event cũ từ bờ và thay đổi cục bộ đang pending.

### F03 — P2: Shore phát `voyage_crew_assignment` nhưng Edge không có receiver

**Source:** `shore_product/backend/Data/AppDbContext.SyncOutbox.cs:19`; `shore_product/backend/Services/Voyage/VoyageService.cs:1450`; `edge_product/edge-services/Services/Core/SyncConflictHandler.cs:32`, `:174`.

So sánh danh sách `OutgoingTables` tự capture của Shore với `_tableEntityMap` của Edge cho thấy thiếu `voyage_crew_assignment`. Shore cũng phát DELETE của bảng này khi xóa hải trình. Receiver Edge ném `Unsupported Shore sync table`, nên event không có ACK và tiếp tục pending.

**Hướng xử lý:** bổ sung receiver cùng ownership, khóa ngoại voyage/crew/rank và thứ tự phụ thuộc; hoặc loại chiều xuống nếu bảng này chỉ thuộc Edge, đồng thời điều chỉnh các producer. Test cần phủ CREATE/SNAPSHOT/DELETE, đặc biệt xóa một hải trình đã có phân công thuyền viên.

### F04 — P2: Force-push chứa `service_record`, nhưng Edge ACK mà không phục hồi

**Source:** `shore_product/backend/Services/Sync/CrewSyncOrchestrator.cs:104`; `edge_product/edge-services/Services/Core/SyncConflictHandler.cs:144`, `:180`; `edge_product/edge-services/Services/Core/SyncService.cs:516`.

Full crew snapshot đưa `service_record` vào batch với action SNAPSHOT. Edge xác định bảng này thuộc Edge và return ngay cho mọi action khác CREATE, trước khi tìm xem bản ghi có tồn tại hay không. Caller vẫn lưu watermark và ACK OutboxId sau khi handler return.

**Kịch bản:** Edge phục hồi database và thiếu một service record, bờ force-push; event được xác nhận giao nhưng bản ghi vẫn không tồn tại trên tàu.

**Hướng xử lý:** tách chế độ phục hồi khỏi cập nhật thường xuyên. Cho phép snapshot phục hồi bản ghi thiếu theo phạm vi được xác định; giữ quy tắc bảo vệ bản ghi vận hành đang có. Nếu không hỗ trợ phục hồi chiều này, loại bảng khỏi full snapshot và ghi rõ giới hạn. Test phải kiểm tra nội dung database sau ACK.

### F05 — P2: Quyền sửa danh mục trên Edge chưa khớp hướng một chiều

**Source:** `edge_product/edge-services/Controllers/Crew/RanksController.cs:78`, `:108`, `:161`, `:189`; `edge_product/edge-services/Controllers/Crew/CountriesController.cs:44`, `:57`, `:94`; `edge_product/shared/Models/Crew/Rank.cs`; `shore_product/backend/Services/Sync/ConflictResolverService.cs:78`.

Rank và Country được quy định do Shore làm chủ; Edge nhận và sử dụng. Nhưng các API tạo/sửa/xóa trên Edge vẫn ghi database. Rank không có `IsSynced`, nên đường auto-queue dựa vào property này cũng không phát thay đổi lên bờ. Một chức danh tạo/sửa cục bộ có thể lệch lâu dài hoặc bị snapshot Shore ghi đè.

**Hướng xử lý:** đưa API danh mục này về chỉ đọc như `RankCertificatesController`/`CountryCertificatesController`. Màn hình danh sách chức danh mới cần đi cùng việc thực thi ownership ở backend. Test gọi write API phải chứng minh database không thay đổi.

### F06 — P2: Cảng vẫn được Edge phát lên dù Shore coi đây là danh mục của bờ

**Source:** `edge_product/edge-services/Services/Core/SyncService.cs:298`; `edge_product/edge-services/Controllers/Voyage/PortController.cs:119`, `:159`, `:190`; `shore_product/backend/Services/Sync/ConflictResolverService.cs:85`.

Edge vẫn có CRUD cảng và reconcile tự xếp snapshot các cảng chưa đồng bộ. Shore đưa `port` vào nhóm Shore-authoritative và từ chối update từ Edge. Đây là producer và receiver có quy tắc khác nhau; người dùng có thể sửa thành công cục bộ mà thay đổi không được chấp nhận tại bờ.

Trong 24 giờ trước thời điểm truy vấn, database Shore có **83 log CONFLICT và 83 log SUCCESS cho `port`**. Đây là số log, không phải 166 cảng; chưa đối chiếu từng cặp event hoặc kết luận cảng nào có nội dung khác nhau.

**Hướng xử lý:** nếu cảng do bờ quản lý, bỏ CRUD/reconcile chiều lên và cung cấp quy trình nhập danh mục cũ về bờ riêng. Nếu cần cho tàu đề xuất cảng mới, định nghĩa thao tác đề xuất/phê duyệt rõ ràng thay vì dùng cập nhật danh mục thông thường.

### F07 — P2: Nút làm mới chứng chỉ không tải lại danh sách chức danh

**Source:** `edge_product/frontend-edge/src/pages/Crew/CertificateMonitorView.tsx:64`, `:339`, `:558`.

Danh sách `ranks` được tải khi mount. Nút làm mới tải lại loại chứng chỉ và tăng `reloadTrigger`; nhánh refresh cache chỉ tải liên kết chứng chỉ của các rank đã có trong cache. Nó không gọi `loadRanks()`.

**Kịch bản:** Shore tạo hoặc đổi tên chức danh; sync đã ghi vào database Edge nhưng trang đang mở vẫn giữ danh sách cũ sau khi bấm làm mới. Chức danh mới chỉ xuất hiện khi component được mount lại.

**Hướng xử lý:** làm mới danh sách ranks cùng yêu cầu chứng chỉ; hiển thị loading/error/empty để phân biệt không có danh mục với lỗi tải dữ liệu. Đây là phần liên quan trực tiếp đến khả năng nhìn thấy chức danh sau sync.

## Ma trận hướng đồng bộ cần dùng khi sửa

| Nhóm dữ liệu | Hướng/quyền cần thống nhất | Nhận xét từ source hiện tại |
|---|---|---|
| Rank, Country, Certificate và các bảng yêu cầu | Shore → Edge; Edge chỉ xem | Có producer/receiver; API Rank/Country còn cho sửa tại Edge |
| Port | Shore → Edge theo quy tắc hiện tại | Edge còn CRUD/reconcile chiều lên; có conflict thực tế |
| CrewMember | Hai chiều, phân quyền theo field và workflow lên/rời tàu | Cần cập nhật tài liệu: source hiện cho Edge sửa phần lớn thông tin cá nhân; bờ giữ BHXH/mã số thuế theo quy tắc riêng |
| CrewCertificate | Hai chiều theo code hiện tại; giữ đường dẫn file cục bộ | Tài liệu cũ ghi một chiều Shore → Edge |
| CrewLogbookEntry | Hai chiều theo field/trạng thái duyệt | Có ngoại lệ nhận kết quả cho xuống tàu của Shore; không nên áp dụng một quy tắc thắng toàn bảng |
| ServiceRecord | Edge → Shore cho nghiệp vụ; phục hồi cần cơ chế riêng | Full snapshot chiều xuống hiện bị bỏ qua nhưng có ACK |
| VoyageRecord và các kế hoạch | Hai chiều theo field; scope một tàu | Cần sửa scope broadcast và bảo vệ field tại receiver Edge |
| VoyageCrewAssignment | Cần quyết định rõ chiều xuống | Shore đã phát; Edge chưa có receiver |
| PMS, vị trí kho, phiếu vật tư, nhập kho và tồn kho | Edge → Shore cho dữ liệu vận hành theo tàu | Có map receiver và cơ chế remap ID; không kết luận đúng từng field chỉ từ việc có map |
| Danh mục vật tư và định nghĩa vật tư theo tàu | Shore → Edge; danh mục chung hoặc scope tàu tùy entity | Source đã tách định nghĩa khỏi nghiệp vụ tồn kho |
| Telemetry, raw NMEA, navigation, environmental, task deferral | Edge → Shore | Source hiện đã có receiver cho bốn bảng cuối; ghi chú bỏ qua trong tài liệu implementation đã cũ |
| Báo cáo nghiệp vụ | Edge → Shore khi thực hiện Transmit | Auto-queue bỏ qua các báo cáo; trạng thái workflow và receipt giao nhận có ý nghĩa khác nhau |
| Danh mục SMS / biểu mẫu đã điền và xác nhận đọc | Danh mục Shore → Edge; dữ liệu vận hành Edge → Shore | Đã có chặn vọng ngược cho danh mục |
| Một số logbook và HSQE legacy | Hiện ACK theo chính sách bỏ qua tại Shore | ACK không chứng minh có bản sao nghiệp vụ tại bờ |
| File | Hai chiều theo metadata/request và receipt riêng | ACK metadata cần được phân biệt với hoàn tất truyền nội dung file |

## Tài liệu cần cập nhật

`SYNC_OWNERSHIP_MATRIX.md` là bản thiết kế cũ, chưa phản ánh toàn bộ source hiện tại. Các điểm lệch rõ gồm quyền sửa thông tin cá nhân của CrewMember, CrewCertificate hai chiều và VoyagePlanLeg dùng hybrid/LWW. Cần chốt yêu cầu nghiệp vụ trước khi quyết định sửa code theo tài liệu hay cập nhật tài liệu theo code; không suy ra một phía đúng chỉ từ ngày tài liệu.

`SYNC_IMPLEMENTATION_2026-10-06.md` vẫn ghi raw NMEA và task deferral không có model nhận tại Shore. Source hiện tại đã thêm receiver và migration cho sensor/deferral, nên phần đó cần đọc như giới hạn của đợt sửa trước, không phải trạng thái mới nhất của source. Các con số test/deploy trong tài liệu cũ là kết quả lịch sử; lượt review này không xác minh lại các kết quả đó.

## Trạng thái quan sát và thứ tự xử lý

Tại thời điểm truy vấn: Edge không có queue pending; Shore không có outbox với `DeliveredAt IS NULL`; Shore có một node đăng ký chưa bị thu hồi. Đã kiểm tra thêm receipt broadcast theo từng node đăng ký còn hoạt động: không có lượt giao nào còn chờ. Riêng broadcast phải đánh giá receipt theo từng node để kết luận đã giao, không chỉ dựa vào `DeliveredAt`.

Ưu tiên sửa F01/F02 trước triển khai nhiều tàu; tiếp theo F03/F04 để snapshot và ACK phản ánh việc nhận dữ liệu; rồi F05/F06 để thực thi ownership. Với nhu cầu xem chức danh, thêm menu/bảng chỉ đọc và xử lý F07. Sau đó cập nhật ma trận và chạy test theo các kịch bản nêu trên trên database cô lập.
