# Sửa đồng bộ Edge ↔ Shore — 06/10/2026

Đây là kết quả sửa source sau [bản review ngày 05/10](SYNC_REVIEW_2026-10-05.md). Bản review cũ ghi tình trạng trước khi sửa. Các kiểm thử dùng PostgreSQL riêng và HTTP giả lập lỗi; chưa triển khai bản sửa vào database vận hành hoặc thử trên modem của tàu.

## Danh tính và luồng dữ liệu

Mỗi Edge sử dụng **một NodeId** đã được provisioning. Shore ràng buộc NodeId với một VesselId; IMO là thuộc tính nghiệp vụ của vessel. Push, pull, ACK, heartbeat, file request và session dùng NodeId. Shore không suy diễn một NodeId chưa đăng ký thành IMO và không tự tạo vessel từ nguồn chưa biết.

Các caller nghiệp vụ cũ còn truyền IMO được chuyển về NodeId tại `VesselSyncIdentity`. Khi chưa provisioning, outbox giữ địa chỉ `vessel:{VesselId}` để chờ. Migration và lúc pull/ACK chuyển địa chỉ IMO cũ hoặc địa chỉ chờ về NodeId đã được ràng buộc. Truy vấn báo cáo lịch sử vẫn nhận cả origin NodeId và IMO cũ.

```mermaid
sequenceDiagram
    participant E as Edge / PostgreSQL
    participant S as Shore / PostgreSQL
    E->>E: Lưu nghiệp vụ và queue trong transaction
    E->>S: Push có chữ ký, EventId và StreamId
    S->>S: Kiểm tra node, thứ tự và trùng; lưu entity và receipt
    S-->>E: ACK từng EventId đã xử lý
    E->>E: Đánh dấu đúng queue revision đã có ACK
    S->>S: Lưu nghiệp vụ và outbox bất biến trong transaction
    E->>S: Pull theo NodeId và chính sách đường truyền
    S-->>E: Snapshot / delete và metadata file
    E->>E: Lưu entity và watermark cùng nhau
    E->>S: ACK OutboxId sau khi lưu
    Note over E,S: Broadcast có receipt riêng cho từng node; file truyền qua worker riêng
```

## Những lỗi đã được xử lý

| Review | Thay đổi |
|---|---|
| F01 | Broadcast dùng receipt `(OutboxId, NodeId)`; ACK của tàu A không làm mất phần giao cho B. |
| F02 | Outbox append sự kiện bất biến; chỉ gộp payload giống hệt còn chờ. ACK cũ không xác nhận thay đổi mới. |
| F03–F04 | Resume dựa vào chỉ số chunk đã lưu; giữ staging khi đăng ký lại phiên đang hoạt động. Không suy tiến độ delta từ file length. |
| F05 | Outage không chặn retry vĩnh viễn sau `MaxRetries`; dùng backoff/jitter, giữ EventId. Telemetry và SMS chỉ đánh dấu IsSynced sau ACK. |
| F06 | Push yêu cầu danh sách EventId và số lượng hợp lệ; response rỗng, sai định dạng hoặc thiếu receipt giữ item chờ. Báo cáo dùng queue có chữ ký; log chỉ SUCCESS khi cả parent và detail có ACK. |
| F07 | UPDATE thiếu bản gốc trả `dependency_missing`; Edge có thể dựng snapshot đầy đủ để retry. Shore phát snapshot đầy đủ cho các UPDATE của entity đã biết. |
| F08 | Idempotency có namespace node và UUID sự kiện. StreamId tách sequence sau khi tạo lại database. |
| F09 | DbContext ghi business và queue/outbox trong transaction, kể cả khóa do database sinh. Không nuốt lỗi deferred queue. Bỏ SaveChanges trung gian lúc làm giàu noon report trước khi enqueue. |
| F10 | Reconcile loại các bản ghi đã có queue trước khi giới hạn 200 dòng; cập nhật IsSynced khi giao xong để tránh replay sau purge. |
| F11 | Hỗ trợ file trạng thái do router/modem cung cấp; trạng thái thiếu, quá hạn hoặc không hợp lệ nghĩa là offline. |
| F12 | File có worker và HTTP timeout riêng, giới hạn số request/file/chunk mỗi chu kỳ. Heartbeat lỗi không làm bỏ qua cả chu kỳ metadata. |
| F13 | Giới hạn payload theo byte thực tế; chunk và timeout theo đường truyền. Kiểm tra lại giới hạn trước lúc gửi nếu đường truyền đổi. |
| F14 | Ánh xạ khóa cục bộ theo node cho dữ liệu PMS/vật tư thuộc tàu; remap khóa ngoại khi nhận và đổi ngược về khóa Edge khi trả xuống. Watermark ngăn snapshot cũ hồi sinh dữ liệu đã xóa. |
| F15 | Áp dụng theo field thực sự có trong JSON; phân biệt omitted, null và chuỗi rỗng. Dùng timestamp của event cho conflict resolution. |
| F16 | Bỏ đường report HTTP trực tiếp không qua signing; nonce được giữ trong PostgreSQL và chỉ đăng ký sau xác minh chữ ký. |
| F17 | Tắt Shore API giữ nguyên queue chờ. |
| F18 | Giữ idempotency receipts qua kỳ purge; thêm tuổi queue/error/deferred file trong trạng thái; xác minh session, chunk, hash và file receipt. Recovery sau restore cần thao tác snapshot có kiểm soát, như mô tả dưới đây. |

Phiên file kiểm tra RequestId, ManifestId, supplier, requester, hướng truyền, kích thước và chunk index trước khi ghi. Nội dung phải đúng hash/size của manifest. Delta thiếu hoặc đổi base chuyển sang truyền đầy đủ. Chunk cuối gửi lại sau mất response được xử lý an toàn. Staging được dọn sau khi trạng thái hoàn tất đã lưu.

File Shore phát xuống có manifest riêng cho receiver. SourcePath nhận từ client không thay thế đường dẫn file của Shore; node không thể lấy manifest của node khác để đăng ký request hay ACK. FileRefs bị thiếu trên đĩa giữ event chờ và ghi lỗi; không bỏ file rồi ACK metadata như đã giao đủ.

## Chính sách đường truyền mặc định

Các số dưới đây là cấu hình khởi điểm của ứng dụng, cần chỉnh theo đo đạc thực tế của tàu. Metadata tính theo JSON; chunk tính theo bytes file gốc, trước Base64 và HTTP/TLS.

| Link | Metadata / request | Chunk | HTTP timeout | Khoảng chu kỳ mặc định tối thiểu | Priority metadata |
|---|---:|---:|---:|---:|---|
| None | 0 | 0 | — | 60 giây | Không gửi |
| Satellite_Iridium | 8 KiB | 8 KiB | 120 giây | 120 giây | Critical |
| Satellite_VSAT | 32 KiB | 32 KiB | 120 giây | 60 giây | Critical, Operational |
| Cellular_4G | 128 KiB | 128 KiB | 60 giây | 30 giây | Tất cả |
| Shore_WiFi / Satellite_LEO và link còn lại được hỗ trợ | 256 KiB | 256 KiB | 60 giây | 30 giây | Tất cả |

File mặc định nhường worker sau một chunk và một file trong chu kỳ. Các profile có thể chỉnh qua `Sync:AdaptiveProfiles:{NetworkType}`. Trên link chậm, event không vừa budget được giữ chờ; các event độc lập nhỏ hơn vẫn có thể đi tiếp. Nếu một event lớn hơn giới hạn của link, cần link đủ dung lượng hoặc tăng giới hạn sau khi đo; hiện chưa chia nhỏ một metadata event thành nhiều fragment.

`Sync:DailyByteBudgets:{NetworkType}` giới hạn reservation theo ngày UTC, lưu trong PostgreSQL. Reservation bao gồm body gửi, phần nhận ước tính, overhead và các lần thử thất bại; đây không phải số byte modem tính cước. `0` nghĩa là không giới hạn. Hết allowance giữ queue tới cửa sổ sau. Chưa dành quota độc lập cho Critical, nên cần đặt allowance đủ cho dữ liệu ưu tiên và theo dõi hàng chờ.

## Cấp trạng thái từ router/modem

Không có adapter tự đọc phần cứng modem trong bản sửa này. Nếu chưa cấp trạng thái động, ứng dụng vẫn dùng NetworkType trong profile provisioning. Khi cấp file trạng thái, file đó là nguồn chọn link.

Host adapter ghi atomically `active-link.txt` vào thư mục được mount, với một trong các giá trị enum, ví dụ `Satellite_VSAT`, `Satellite_Iridium`, `Cellular_4G`, `Satellite_LEO`, `Shore_WiFi` hoặc `None`. Cập nhật ít nhất mỗi 60 giây. Ngưỡng quá hạn mặc định là 120 giây. Đồng bộ đồng hồ host/container và Shore để chữ ký timestamp hoạt động trong cửa sổ clock skew đã cấu hình.

Hai compose override tùy chọn được thêm tại:

- `edge_product/edge-services/docker-compose.link.yml` cho môi trường phát triển.
- `edge_product/production/docker-compose.link.yml` cho môi trường production.

Đặt `EDGE_LINK_STATUS_DIRECTORY` thành thư mục tuyệt đối có thật trên host, rồi dùng cả compose chính và override. Ví dụ từ thư mục Edge tương ứng:

```powershell
docker compose -f docker-compose.yml -f docker-compose.link.yml config --quiet
```

Lệnh trên chỉ xác minh cấu hình. Các biến allowance/chunk/file đã được nối vào compose chính. Không cần tạo thư mục trạng thái nếu không dùng override.

## Nâng cấp và khôi phục

1. Sao lưu database và uploads của cả hai bên; giữ nguyên hàng đợi và provisioning. Kiểm tra mỗi NodeId đang hoạt động có VesselId hợp lệ, IsRegistered=true và IsRevoked=false. Không đổi NodeId thành IMO.
2. Nâng cấp Shore trước và áp dụng migration `20261005130000_HardenSyncDelivery`: delivery receipts, record identities, record cursors, stream state và chuyển routing legacy. Nâng cấp Edge cùng migration tên tương ứng: backfill UUID cho queue cũ và thêm danh sách receipt vào transmission log. `Database:AutoMigrate` đã có trong startup; production cần bật rõ khi áp dụng migration bằng startup hoặc dùng quy trình EF migrations của dự án.
3. Nâng cấp Edge ngay sau Shore. Edge mới yêu cầu receipt EventId, nên nếu gặp Shore cũ sẽ giữ chờ; không đánh dấu đã giao từ response cũ. Duy trì volume PostgreSQL, uploads và key mã hóa provisioning. Source chưa được đóng vào binary production hiện có trong workspace.
4. Kiểm tra pending age/error, NodeId, signed heartbeat, push/pull và trạng thái file. Bản sửa không xóa queue vận hành hoặc tự sửa ownership của mọi dữ liệu lịch sử thiếu thông tin; những trường hợp đó cần đối soát riêng.
5. Restore backup hoặc reset sequence: dừng sync trong lúc restore, tạo **StreamId mới** cho phía bị restore trước khi hoạt động lại. Có thể đặt `Sync:StreamId` thành UUID mới. Edge mặc định giữ epoch trong `sync_state`, Shore trong `sync_stream_state`; không đổi epoch ở mỗi restart thông thường.
6. Sau restore, lấy snapshot từ bên giữ dữ liệu đầy đủ. Edge có `POST /api/sync/snapshot` với body `{"groups":["ship_data","crew","voyage","report","pms"]}` và policy InternalAccess. Shore có `POST /api/sync/force-push/{nodeId}` cho crew và reference liên quan; các nhóm khác phải dùng chức năng sync của từng module. Endpoint force-push crew hiện lấy toàn bộ danh sách crew/documents theo thiết kế hiện có, cần chọn phạm vi nghiệp vụ phù hợp trước khi vận hành fleet lớn.
7. Snapshot không tự suy ra những bản ghi đã bị xóa trong khoảng backup bị mất. Khôi phục cả queue/tombstone/receipt hoặc đối soát danh sách xóa riêng. Chưa có giao thức tự đối soát toàn bộ database theo digest sau restore.

Trong đợt sửa này chỉ sửa kết nối network của container PostgreSQL Edge bị tách khỏi network Docker và restart backend để kiểm tra lỗi DNS cũ. Không rebuild/deploy các thay đổi sync mới vào stack đang chạy.

## Kiểm thử và phần cần pilot

Các suite backend Edge, backend Shore và Shared chạy với .NET 8. Các test PostgreSQL dùng container `codex-sync-tests-20261005`, bind cổng riêng `127.0.0.1:15439`, database có prefix `codex_pms_tests_`; các test reliability tự tạo database riêng. Không dùng connection string của database vận hành. Chạy test với `--no-restore -p:RestoreFallbackFolders=` để tránh fallback NuGet cũ của môi trường IDE.

Kết quả: **73/73 Edge, 28/28 Shore, 4/4 Shared**, không skip test PostgreSQL trong lượt xác minh. Đã xác minh cú pháp cả compose Edge chính và override link ở development/production. Sau lượt đầy đủ, bổ sung giá trị `Satellite_LEO=5` còn thiếu trên Shore và chạy lại test chính sách link; DTO wire và enum NetworkType khớp giữa hai bên.

Các tình huống đã được đưa vào test gồm: broadcast nhiều node, ACK lặp/cũ, rollback khi ghi outbox lỗi, nonce qua lần tạo service khác, tắt sync, retry quá MaxRetries, response hỏng/thiếu receipt, partial ACK, missing UPDATE, null/empty/omitted, delete rồi snapshot cũ, GUID và numeric ID trùng giữa hai tàu, khóa ngoại chiều lên/xuống, migration giữ pending events, reconcile vượt 200 dòng, link offline dù profile WiFi, hết allowance, upload restart giữa chunk, delta thiếu base, file receipt bị mất và epoch sau restore. Test truyền file dùng storage mock; chưa thử cắt nguồn thật giữa filesystem và PostgreSQL commit.

Trước pilot cần đo riêng trên tuyến mạng thực tế: latency, throughput, mất gói, outage kéo dài, đổi link khi đang transfer, áp lực queue nhiều ngày, ổ đĩa gần đầy và reconnect đồng thời nhiều tàu. File worker riêng giữ metadata có thể tiến triển, nhưng chưa có scheduler đảm bảo phân chia băng thông tại modem. Chưa benchmark fleet scale hoặc chứng minh mọi field nghiệp vụ của mọi module trong luồng end-to-end.

Phạm vi dữ liệu vẫn theo model và ownership hiện có: raw NMEA, một số logbook, task deferral và các bảng HSQE legacy trong `_ignoredTables` không có model nhận ở Shore, nên ACK của chúng là xử lý theo chính sách bỏ qua, không có nghĩa là đã tạo bản sao nghiệp vụ ở Shore. Bản sửa không bổ sung các module Shore còn thiếu này. Trạng thái workflow `TRANSMITTED` của report vẫn biểu thị thao tác gửi; dùng transmission log `QUEUED` / `SUCCESS` để phân biệt đang chờ và đã được Shore xác nhận đủ.

Các giới hạn này là phạm vi kiểm chứng còn lại; không được coi kết quả test cục bộ là chứng nhận chạy ổn trên mọi mạng hàng hải.
