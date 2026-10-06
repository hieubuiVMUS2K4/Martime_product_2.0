# Đánh giá đồng bộ Edge ↔ Shore — 05/10/2026

> Đây là đánh giá trước khi sửa. Xem [kết quả sửa và hướng dẫn vận hành ngày 06/10](SYNC_IMPLEMENTATION_2026-10-06.md) để biết trạng thái mới.

## Kết luận

Thiết kế có nền tảng store-and-forward phù hợp: queue/outbox trong PostgreSQL, ACK sau khi lưu, phân loại ưu tiên, retry có jitter, metadata file tách khỏi nội dung, chunk/checksum và cấu hình provisioning. Tuy nhiên phiên bản hiện tại **chưa đủ tin cậy để vận hành nhiều tàu trên mạng hàng hải gián đoạn**. Có đường xử lý báo thành công dù dữ liệu chưa được áp dụng, ACK có thể làm mất cập nhật và resume file có lỗi.

Đây là đánh giá source trong workspace hiện tại, vốn có nhiều thay đổi chưa commit. Phạm vi: luồng push/pull/ACK/heartbeat, queue generation/reconciliation, inbox/outbox, conflict resolution, file upload/download/session, xác thực, telemetry enqueuer và đường gửi report trực tiếp; đối chiếu một số nơi phát outbox của crew/certificate/material/SMS. Không khẳng định đã kiểm chứng mọi field nghiệp vụ của mọi bảng, hay binary đang chạy trùng source hiện tại.

Chưa thực hiện thử nghiệm mạng vệ tinh, fault injection, restart giữa commit hoặc thử nghiệm nhiều tàu end-to-end. Những kết luận dưới đây phân biệt lỗi thấy trực tiếp trong code và các tình huống cần kiểm chứng tích hợp. Không sửa code ứng dụng hay dữ liệu vận hành trong đợt review này.

## Luồng hiện tại

1. Edge lưu thay đổi nghiệp vụ; EdgeDbContext tạo sync_queue hoặc background enqueuer tạo bản tin telemetry/SMS. Một số CREATE dùng ID database được enqueue ở lần SaveChanges thứ hai.
2. SyncBackgroundWorker tuần tự heartbeat → push → pull. Push lọc priority, NextRetryAt, RetryCount, lấy batch rồi POST /api/sync.
3. Shore kiểm tra danh tính nếu bật signing, xử lý theo nhóm bảng/phụ thuộc, lưu entity + idempotency, trả số thành công/thất bại.
4. Edge đánh dấu queue SyncedAt hoặc tăng RetryCount. File được xử lý tiếp trong cùng vòng worker.
5. Shore business services ghi SyncOutbox. Edge pull theo ID/cursor, áp dụng từng item, lưu rồi ACK OutboxId.
6. FileRefs tạo manifest/request; nội dung truyền riêng theo single upload, bundle hoặc chunk. Có SHA-256 từng chunk và toàn file, staging và session trong database.

## Các lỗi cần xử lý trước pilot

### F01 — P0: Broadcast ACK dùng chung cho mọi tàu

**Source:** shore_product/backend/Services/Sync/SyncOutboxService.cs:139, 179, 405.

BroadcastAsync chỉ enqueue một hàng TargetNode="*". Mọi tàu lấy cùng hàng với DeliveredAt=null. ACK từ tàu A đặt DeliveredAt cho chính hàng đó; tàu B kết nối sau sẽ không còn nhận được. VesselSyncIdentity.CanonicalTargetAsync cũng giữ nguyên "*", không fan-out.

**Tác động:** mất cập nhật danh mục, quy trình SMS, crew/certificate ở các tàu khác. Có nhiều caller thực sự dùng BroadcastAsync, nên đây không chỉ là API chưa sử dụng.

**Sửa:** delivery riêng theo (event, node), hoặc fan-out thành hàng outbox riêng cho từng node; xác định bootstrap cho tàu mới và chính sách khi node bị thu hồi.

### F02 — P0: ACK cũ có thể xác nhận payload mới chưa gửi

**Source:** SyncOutboxService.cs:88–106, 399–419.

EnqueueAsync sửa Payload/ActionType/SyncVersion của hàng chưa delivered nhưng giữ Id. ACK chỉ có ItemIds. Tình huống: edge nhận Id=100 phiên bản V1; shore sửa cùng hàng thành V2; ACK của V1 đặt DeliveredAt cho V2. Edge chưa nhận V2 nhưng shore cho rằng đã giao.

**Sửa:** event bất biến; hoặc ACK phải mang revision/hash và UPDATE có điều kiện đúng revision. Không chỉ thêm lock tại edge, vì cuộc đua diễn ra giữa shore và ACK qua mạng.

### F03 — P0: Resume upload xoá các chunk đã nhận

**Source:** shore_product/backend/Services/Sync/SyncFileTransferService.cs:575–581, 1132–1149.

RegisterUploadSessionAsync khôi phục NextChunkIndex từ file staging, sau đó luôn gọi PrepareUploadSessionStagingAsync. Hàm này xoá staging; delta thì copy lại base. Session vẫn giữ NextChunkIndex đã khôi phục. Khi mạng rớt sau vài chunk, lần đăng ký tiếp theo có thể bỏ qua chunk đã bị xoá. Checksum cuối sẽ chặn file sai, nhưng transfer không còn resume đúng và có thể lặp thất bại.

**Sửa:** chỉ tạo/reset staging khi khởi tạo hoặc chủ động reset session; trạng thái chunk và staging phải nhất quán. Kiểm tra expiry trước khi gia hạn (hiện expiry được ghi mới trước phép kiểm tra expiry).

### F04 — P0: Resume delta suy ra tiến độ từ kích thước toàn file

**Source:** edge_product/edge-services/Services/Core/SyncService.cs:2377–2379, 2481–2502; shore SyncFileTransferService.cs:575–577.

Delta staging là bản copy của file base, vốn đã có kích thước toàn file ngay cả khi chưa nhận chunk mới. Công thức ceil(fileSize/chunkSize), giới hạn bởi TotalChunks, có thể cho rằng toàn bộ chunk delta đã nhận. Với delta ghi tại offset cao, file length cũng không phản ánh số chunk đã commit.

**Sửa:** dùng chỉ số/bitmap chunk đã xác thực lưu bền vững, gắn với session revision, hash base và hash file đích. Không dùng độ dài staging làm chứng cứ đã nhận đủ.

### F05 — P1: Lỗi mạng làm bản tin hết lượt gửi

**Source:** edge SyncService.cs:199, 839–863, 918–925; EdgeDbContext.cs:3117; PositionSyncEnqueuerService.cs:151.

Network error, timeout và HTTP failure cùng tăng RetryCount. Query chỉ lấy RetryCount < MaxRetries; nhiều nơi đặt MaxRetries=5. Sau năm lần thất bại, bản tin vẫn còn database nhưng không được tự động gửi tiếp. Một phần master/PMS có reconciliation bổ sung, nhưng không bao phủ mọi loại bản tin. Telemetry enqueuer còn đánh dấu entity IsSynced=true ngay lúc enqueue, nên nó không tự enqueue lại item bị cạn retry.

**Tác động:** outage dài hoặc mạng chập chờn có thể khiến dữ liệu không bao giờ lên shore sau khi mạng phục hồi; dashboard đếm pending cũng bao gồm item không còn được xử lý.

**Sửa:** tách transport failure khỏi permanent business/schema failure. Transport retry bền vững, có backoff/circuit breaker và không bỏ bản tin chỉ vì tàu mất mạng. DLQ cho lỗi nội dung phải có cảnh báo và replay có kiểm soát.

### F06 — P1: HTTP 2xx bị coi là xác nhận đầy đủ

**Source:** edge SyncService.cs:769–824; Services/Reporting/ReportingService.cs:1852–1860.

Push không parse được body vẫn để batchResponse=null rồi đi nhánh đánh dấu toàn batch thành công. Response {} cũng có kết quả tương tự. Đường gửi report trực tiếp chỉ kiểm tra HTTP success, trong khi shore dùng HTTP 200 cả khi batch có failed > 0.

**Tác động:** parent report hoặc child bị reject nhưng không có fallback queue nếu đường trực tiếp thấy HTTP 200. Người dùng thấy transmitted nhưng dữ liệu chưa đủ trên bờ.

**Sửa:** ACK từng event ID/revision và trạng thái applied/duplicate/rejected. Response lỗi định dạng hoặc thiếu receipt phải được xem là chưa xác nhận. Report dùng cùng pipeline queue/signing/receipt thay vì đường HTTP riêng.

### F07 — P1: UPDATE thiếu bản ghi bị ACK thành công rồi bỏ

**Source:** shore SyncInboxService.cs:1300–1314, 690–706, 838–858.

Một số UPDATE khi không tìm thấy entity chỉ log rồi return. ProcessBatchAsync vẫn ghi idempotency và tăng Succeeded. Nếu CREATE trước đó bị lỗi/đang backoff mà UPDATE sau đến trước, update bị bỏ và retry cùng version cũng bị xem là đã xử lý.

**Sửa:** trả dependency_missing và retry sau; hoặc gửi snapshot đủ dữ liệu. Chỉ ghi processed khi có kết quả hợp lệ theo protocol. Phân biệt ignored_by_ownership với applied để theo dõi được.

### F08 — P1: Idempotency không có OriginNode

**Source:** shore SyncInboxService.cs:838–858; edge SyncService.cs:713–720.

Key hiện là table:recordKey:syncVersion; edge dùng queue Id làm version. Hai tàu có queue sequence độc lập, cùng seed/local numeric RecordKey và cùng queue Id có thể trùng key. OriginNode được lưu nhưng không nằm trong phép kiểm tra/key. Tàu thứ hai có thể bị bỏ như duplicate.

**Sửa:** stable event UUID cùng node/database incarnation; ít nhất namespace key bằng origin node. Tính tới restore backup/reset sequence/thay máy edge. Bảo vệ duplicate nguyên tử tại database.

### F09 — P1: Ghi nghiệp vụ và outbox chưa luôn nguyên tử

**Source:** edge EdgeDbContext.cs:2959–2977; shore Services/Crew/CertificateService.cs:378–382, 393–397.

Edge deferred CREATE lưu entity trước, rồi lưu queue ở lần thứ hai, bắt exception và tiếp tục. Shore có đường SaveChanges nghiệp vụ trước rồi BroadcastAsync sau, không transaction bao cả hai. Crash giữa hai bước làm có dữ liệu nghiệp vụ nhưng không có event; deletion đặc biệt khó khôi phục vì bản ghi gốc đã mất.

**Sửa:** transaction bao entity + outbox, kể cả ID tự tăng; giữ tombstone cho deletion. Reconciliation là lớp sửa chữa bổ sung, không thay thế atomic outbox.

### F10 — P1: Đối soát chỉ nhìn 200 dòng đầu

**Source:** edge SyncService.cs:329–381; EdgeSyncQueuePurgeService.cs:64–68.

ReconcileTableAsync lấy unsyncedQuery.Take(200) trước khi bỏ các key đã queued. Với bảng không được MarkOriginalRecordSyncedAsync đánh dấu IsSynced=true, 200 dòng đầu vẫn hiện trong query mãi và các dòng sau không được xét. Ví dụ mapping đánh dấu synced không bao gồm port/equipment_asset/store_location, trong khi chúng được reconciliation quét. Sau purge queue đã xử lý 30 ngày, các dòng đầu còn có thể được enqueue lại.

**Sửa:** lọc anti-join bản ghi cần enqueue trước Take, hoặc phân trang có tiến độ bền vững; theo dõi revision đã gửi, không chỉ sự tồn tại của bất kỳ CREATE cũ nào.

## Các điểm chưa phù hợp với mạng hàng hải

### F11 — P1: Loại mạng ở edge là cấu hình, pull chưa theo chính sách mạng

**Source:** edge SyncService.cs:122–141, 387–424, 2640–2692; SyncBackgroundWorker.cs:68–94.

GetCurrentNetworkStatusAsync còn TODO actual detection, đọc profile/config, fallback Shore_WiFi. Push/file có filter priority nhưng pull không kiểm tra NetworkType.None hay allowed priorities, shore pull trả theo Id với pageSize mặc định 50. Heartbeat vẫn gửi trên worker cycle. Vì vậy khai báo Iridium chỉ hạn chế một phần upload, không tự giới hạn toàn bộ traffic chiều download.

**Sửa:** policy hai chiều dựa trên router/link đang hoạt động, bandwidth/RTT/error rate và data allowance; truyền budget/priority vào pull. Không suy ra chi phí link chỉ từ ping hoặc chỉ từ tên interface.

### F12 — P1: Truyền file chạy tuần tự trong worker metadata

**Source:** SyncBackgroundWorker.cs:81–95; edge SyncService.cs:1558–1560, 2149–2195, 2228–2259.

Push và pull đều có thể gọi chu kỳ file; upload/download lặp đến hết session, rồi đến file tiếp theo. Trong thời gian ấy worker không chạy vòng heartbeat/push Critical tiếp theo. Token bucket hiện giới hạn batch push, không phải số byte của file hoặc pull. Batch size cũng theo số record, không giới hạn byte payload.

**Sửa:** worker file riêng với budget, giới hạn số chunk/thời gian mỗi lượt và cơ chế nhường cho Critical. Giới hạn cả compressed/uncompressed bytes, xử lý HTTP 413/429 và Retry-After.

### F13 — P1: Chunk/timeout mặc định quá cứng

**Source:** edge appsettings.json:122, 148–149; edge Program.cs:171–172; edge SyncService.cs:2081–2088.

Mặc định timeout request 30 giây, chunk 256 KiB, file dưới 1 MiB gửi một lần; chunk dùng Base64 trong JSON (~33% tăng dung lượng). 256 KiB thành khoảng 350 KB trên wire, chưa tính HTTP/TLS. Với giả định uplink hiệu dụng 22 kbit/s, riêng payload mất khoảng 127 giây; ở 88 kbit/s mất khoảng 32 giây. Đây là phép tính lý tưởng, chưa tính RTT, overhead và chia sẻ đường truyền; không phải kết quả đo modem.

Iridium Certus 100 công bố tốc độ IP tối đa 88 Kbps: https://www.iridium.com/services/iridium-certus-100 . Không thể dùng một nhãn Satellite_Iridium để đại diện mọi modem/gói dịch vụ; tốc độ thực tế cần đo.

**Sửa:** profile theo link và byte budget; chọn chunk sao cho hoàn tất trong cửa sổ kết nối, timeout gồm thời gian truyền + RTT/margin. Xem xét binary streaming thay Base64 và chunk cả file nhỏ trên link yếu. Hiện code ép chunk tối thiểu 64 KiB, cũng cần xem lại cho uplink rất thấp.

## Rủi ro nhất quán, bảo mật và vận hành

### F14 — P1: Ownership/vessel và thứ tự event cần thống nhất

**Source:** shore SyncInboxService.cs:1283–1299, 1686–1708; edge SyncConflictHandler.cs:255–352, 435–547.

Guard UPDATE vessel-scoped còn tra Vessels.IMO == item.OriginNode, trong khi Managed Mode OriginNode là node ID. DELETE chỉ FindEntityByKey rồi delete, không thể hiện guard vessel tại đường này. Cần xác minh end-to-end các loại ID/local seed, và kiểm tra quyền theo vessel trước mọi UPDATE/DELETE, thay vì chỉ xác thực node gửi request.

Edge không có guard chung từ chối revision cũ trong HandleCreate/HandleUpdate; authority merge có thể áp dụng lại dữ liệu shore cũ. Push lọc NextRetryAt cho phép event mới của cùng record vượt event cũ đang backoff. Idempotency chỉ ngăn event trùng, không ngăn event cũ đến muộn ghi đè event mới.

**Sửa:** revision theo record/owner, thứ tự hoặc dependency của event; routing/scoping đầy đủ, nhận biết delete tombstone. Thử hai tàu có seed/local ID giống nhau và restore edge từ backup.

### F15 — P2: Merge không biểu diễn tốt thao tác xoá giá trị

**Source:** edge SyncConflictHandler.cs:435–458; shore ConflictResolverService.cs:245–261, 333–341, 588–592.

Nhiều merge bỏ qua null và chuỗi rỗng; thiếu property và property được cố ý set null chưa được phân biệt nhất quán. Edge đã có ngoại lệ sign-off để giải quyết một trường hợp, nhưng xoá notes/field/file reference vẫn cần protocol rõ. Delta cũng bỏ UpdatedAt ở EdgeDbContext.cs:3151, trong khi một số resolver dùng UpdatedAt để LWW và shore UpdateSyncMetadata ghi giờ nhận, không phải giờ sửa của sender.

**Sửa:** patch có field mask và explicit null/delete; revision làm căn cứ thứ tự. Đồng hồ UTC hỗ trợ quan sát, không nên là căn cứ duy nhất cho mọi conflict.

### F16 — P2: Đường report và chống replay chưa thống nhất

**Source:** ReportingService.cs:1849–1852; SyncRequestVerificationMiddleware.cs:140–144, 170–175, 236–237.

Report direct PostAsync không đi qua SyncRequestSigningService. Khi shore RequireSignedRequests=true, đường này sẽ bị từ chối và phải fallback queue. Middleware replay dùng IMemoryCache; chưa dùng nonce registry database được đăng ký trong Program. Restart hoặc nhiều replica không chia sẻ replay cache. Clock skew mặc định 300 giây đòi hỏi tàu có đồng hồ được đồng bộ đáng tin cậy.

**Sửa:** một transport pipeline; production HTTPS + signed node identity; nonce store nguyên tử dùng chung, retention phù hợp timestamp window. Có health/cảnh báo lệch đồng hồ và xác minh rotation/revocation khi tàu offline dài.

### F17 — P1: Tắt ShoreAPI có thể làm sạch queue chưa giao

**Source:** edge SyncService.cs:688–703.

ShoreAPI:Enabled=false không chỉ pause: SendBatchToShoreAsync đặt SyncedAt và đánh dấu original record synced ở chế độ simulated, không có guard environment tại nhánh này. Nếu dùng cờ này để tạm ngắt sync, bản tin pending có thể bị coi là đã giao.

**Sửa:** disabled giữ nguyên pending; simulation phải là chế độ riêng, explicit và bị chặn trong production.

### F18 — P2: Retention và quan sát chưa đủ chứng minh hội tụ

**Source:** shore SyncQueuePurgeService.cs:59–67; edge BaseSyncEnqueuerService.cs:129; SyncBackgroundWorker.cs:102–104.

Idempotency bị purge sau 30 ngày, cần phù hợp retry/backup/offline horizon. IsSynced có nơi nghĩa là đã enqueue, nơi khác nghĩa là đã giao. TaskCanceledException ở outer worker luôn break, không phân biệt stoppingToken cancellation với HTTP timeout; heartbeat timeout có thể kết thúc worker trong khi process vẫn chạy. ACK response pull không được kiểm tra; hiện lần pull sau vẫn lấy DeliveredAt=null nên không tự mất dữ liệu vì ACK thất bại, nhưng thiếu trạng thái/cảnh báo rõ.

**Sửa:** các trạng thái queued/sent/applied/file-complete tách rõ; timeout chỉ break khi host đang dừng; expose oldest pending age, retry-exhausted, DLQ, applied revision và file backlog. Anti-entropy theo hash/revision từng domain để phát hiện lệch dữ liệu dù queue đã trống.

## Điểm đúng nên giữ

- Queue/outbox persistent và ACK sau local SaveChanges là hướng phù hợp offline-first.
- Pull không dùng last-pull timestamp làm watermark duy nhất; ACK mất không làm mất item đơn giản theo timestamp.
- Retry có jitter, reconnect warm-up và push gate giúp tránh nhiều request dồn lúc kết nối lại, nhưng cần bổ sung budget hai chiều.
- Metadata file tách khỏi nội dung; SHA-256 từng chunk/toàn file giúp phát hiện sai file.
- Shore batch sắp nhóm bảng theo phụ thuộc; EF SaveChanges trong transaction hỗ trợ savepoint. Cần test lỗi FK xen giữa batch, vì controller vẫn commit transaction ở cuối và có thao tác SQL/side effect ngoài một lần SaveChanges.
- Ownership theo domain/field, Managed provisioning và node↔vessel binding là nền tảng đúng; cần gom thành ma trận chung và test cả CREATE/UPDATE/DELETE.

## Kiểm chứng đã chạy

- Maritime.Shared.Tests: **4 passed**. Chủ yếu DTO/protocol basics; chưa chứng minh crash consistency hay mạng yếu.
- Edge tests lọc VesselMaterialSyncTests và EdgeRuntimeConfigServiceTests: **11 passed, 1 skipped**. Không xem test skipped là đã kiểm chứng.
- Lần đầu --no-restore bị lỗi NuGet fallback folder Visual Studio không tồn tại. Chạy lại restore với fallback folders rỗng đã hoàn tất các test trên; không thay cấu hình project để xử lý lỗi môi trường này.
- Chưa chạy production mutation, chưa tắt mạng Docker, chưa phát bản tin thử vào database hiện có và chưa sửa implementation.

## Thứ tự sửa và tiêu chí nghiệm thu

1. F01/F02: delivery theo node và revision, event bất biến. Kiểm tra 3 tàu nhận broadcast ở các thời điểm khác nhau; ACK V1 sau khi tạo V2 phải không xoá V2.
2. F03/F04: resume. Ngắt upload/download sau mỗi chunk, sau ghi file trước commit DB, sau commit trước HTTP response; full và delta đều phải hội tụ đúng SHA-256. Restart cả hai phía, kiểm tra staging và expiry.
3. F05/F06/F07/F08/F17: receipt/idempotency/retry. Outage 72 giờ, 2xx malformed/partial, request đã commit nhưng mất response, hai node cùng key/version và pause/resume: không được mất event, không ACK việc chưa làm.
4. F09/F10/F14/F15: transactional outbox, dependency/ownership, anti-entropy. Thử >200 unsynced records, hai tàu cùng local ID, sửa null, DELETE rồi replay event cũ và restore backup.
5. F11/F12/F13/F16/F18: scheduler, link profile, bảo mật và observability. Kịch bản bandwidth 22/88/256 kbit/s là giả lập để chọn budget, không phải đại diện mọi dịch vụ; thêm RTT 0.8–2 giây, loss 1–5%, cửa sổ online 20–60 giây rồi offline, shared bandwidth, HTTP 401/413/429/503, clock skew, key rotation và restart.

Tiêu chí đạt: dữ liệu cuối hội tụ đúng theo ownership; không báo delivered khi chưa applied; không duplicate side effect; Critical được xử lý trong SLA đã thống nhất dù có file backlog; retry không cạn vì transport outage; lượng byte trong budget link; backlog và lỗi hiển thị được cho vận hành. Chỉ sau khi có kết quả này mới kết luận phù hợp cho cấu hình mạng cụ thể trên tàu.
