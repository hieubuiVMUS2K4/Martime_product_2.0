# PMS rework — hợp đồng API Job và Work Order

Đây là bước API tiếp theo của [kế hoạch](PMS_JOB_LIST_WORK_ORDER_SEPARATION_PLAN_2026-10-25.md). Chưa phải cutover hoặc bản PMS mới hoàn chỉnh.

## Điều kiện bật trong môi trường kiểm thử

- `Pms:ReworkApiEnabled` mặc định **false**. Khi chưa bật, endpoint mới trả 503 với mã `PMS_REWORK_NOT_ENABLED`; module Job List mới chưa xuất hiện trong catalog quyền.
- `Pms:VesselTimeZone` là múi giờ tàu hợp lệ (ví dụ `Asia/Ho_Chi_Minh`). API đọc WO không tự lấy múi giờ máy chủ khi thiếu cấu hình. Windows timezone được chuẩn hóa sang IANA khi truy vấn PostgreSQL.
- Cần schema nền tảng, `20261025170000_FreezeWorkOrderWarningWindows`, `20261025180000_AddPmsWorkOrderWorkflow` và `20261026090000_AddPmsAdHocOrderDrafts` trên cả Edge/Shore. Schema WO nháp/đột xuất được bổ sung bằng migration mới, không sửa migration đã giao.
- Không bật cho tàu vận hành chỉ để xem UI: chưa nối worker phát hành protocol mới, chưa hoàn tất capability đồng bộ, giao diện hoặc mobile. Không thay `.env.production` trong bước này.

## Endpoint

| Method / đường dẫn | Chức năng | Quyền |
| --- | --- | --- |
| GET `/api/pms/jobs` | Danh sách Job phân trang, không tải checklist/snapshot toàn bộ | Job truy cập |
| GET `/api/pms/jobs/{id}` | Chi tiết Job, checklist mẫu, vật tư thiết bị chỉ đọc, phần thông tin còn thiếu | Job truy cập |
| GET `/api/pms/jobs/references` | Tên/mã/chức danh/bộ phận của người onboard và chức danh hoạt động để chọn trong form | Job truy cập; không trả hồ sơ thuyền viên đầy đủ |
| POST `/api/pms/jobs` | Thêm Job | Job thêm/xóa |
| PUT `/api/pms/jobs/{id}` | Sửa bằng `expectedVersion` | Job cập nhật |
| POST `/api/pms/jobs/{id}/state` | Tạm dừng/ngừng/tiếp tục hoặc khôi phục, có lý do và phiên bản | Job cập nhật |
| DELETE `/api/pms/jobs/{id}?expectedVersion=n` | Xóa mềm Job chưa có WO/lịch sử | Job thêm/xóa |
| POST `/api/pms/jobs/import` | Kiểm tra/nhập lô Job, tối đa 1.000 dòng | Job thêm/xóa/import |
| GET `/api/pms/jobs/{id}/history` | Lịch sử legacy và báo cáo WO đã duyệt thuộc đúng Job, phân trang/lọc/sắp xếp ở DB | Job truy cập |
| GET `/api/pms/jobs/{id}/history/{historyId}` | Snapshot legacy đã lưu của đúng Job | Job truy cập |
| GET `/api/pms/work-orders` | Danh sách WO protocol mới, mặc định đã phát hành và còn mở | WO truy cập |
| GET `/api/pms/work-orders/{id}` | Chi tiết WO, snapshot, kết quả hiện tại, checklist, timeline | WO truy cập |
| GET `/api/pms/jobs/{id}/completed-reports/{reportId}` | Báo cáo mới đã duyệt của đúng Job; không mở bản đang chờ duyệt | Job truy cập |
| POST `/api/pms/work-orders/from-job` | Phát hành thủ công kỳ định kỳ, kiểm tra phiên bản Job/lý do làm sớm | WO thêm/xóa |
| POST `/api/pms/work-orders/{id}/assignment` | Giao PIC/người hỗ trợ hoặc bàn giao có lý do | WO cập nhật/phân công |
| POST `/api/pms/work-orders/{id}/start` | Nhận và bắt đầu hoặc bắt đầu làm lại | WO thực hiện và là người được giao/hỗ trợ còn onboard |
| PUT `/api/pms/work-orders/{id}/progress` | Lưu kết quả đang làm, không trừ kho | WO thực hiện và là người được giao/hỗ trợ |
| POST `/api/pms/work-orders/{id}/submit` | Chụp revision bất biến và gửi duyệt, không trừ kho | WO thực hiện và là người được giao/hỗ trợ |
| POST `/api/pms/work-orders/{id}/approve` | Duyệt qua xác thực tài khoản/chữ ký, cập nhật kho/counter/kỳ trong cùng giao dịch | WO duyệt, không tự duyệt phần mình đã thực hiện |
| POST `/api/pms/work-orders/{id}/return` | Trả lại có lý do, giữ revision đã gửi | WO từ chối, không tự kiểm tra phần mình đã thực hiện |
| POST `/api/pms/work-orders/{id}/cancel` | Hủy có lý do, không tăng kỳ hoặc xóa báo cáo | WO cập nhật |
| GET `/api/pms/work-orders/{id}/reports/{revision}` | Bản gửi bất biến cùng quyết định/bằng chứng của một lượt | WO truy cập |
| POST `/api/pms/work-orders/ad-hoc` | Tạo WO đột xuất nháp hoặc phát hành ngay nếu đủ thông tin | WO thêm/xóa; gán PIC/hỗ trợ còn cần cập nhật/phân công |
| PUT `/api/pms/work-orders/{id}/draft` | Sửa định nghĩa/checklist WO đột xuất còn nháp, kiểm tra phiên bản | WO cập nhật |
| POST `/api/pms/work-orders/{id}/issue` | Kiểm tra lại và phát hành WO đột xuất nháp | WO thêm/xóa; nháp có người được giao còn cần phân công |
| DELETE `/api/pms/work-orders/{id}/draft?expectedVersion=n` | Xóa mềm WO đột xuất còn nháp, giữ mã và biên nhận yêu cầu tạo | WO thêm/xóa |
| GET `/api/pms/work-orders/references` | Các trường chọn người onboard có chức danh hoạt động; không trả hồ sơ thuyền viên đầy đủ | WO truy cập |
| GET `/api/pms/work-orders/equipment-tree` | ID/tên/mã/cha/loại/trạng thái thiết bị hoạt động, không tải thông số kỹ thuật | Job/WO/Counter truy cập hoặc config legacy tương đương |
| GET `/api/pms/work-orders/settings` | Múi giờ tàu IANA và trạng thái khả năng phát hành tự động (hiện false) | Job/WO/Counter truy cập hoặc config legacy tương đương |
| GET `/api/pms/work-orders/material-options` | Tìm mã/tên hoặc selectedIds, phân trang tối đa 200, chỉ metadata và tồn theo vị trí cho form kết quả | WO thực hiện |
| GET `/api/pms/counters` | Thiết bị cụ thể còn hoạt động, lọc tên/mã/ID và phân trang tối đa 100 | Counter truy cập |

Mọi endpoint còn chịu kiểm tra tài khoản đang hoạt động và quyền hiện tại theo chức danh. Quyền đọc Job không cấp quyền đọc WO đang làm hoặc cập nhật/thực hiện/duyệt. Quyền cũ `pms.config` được chấp nhận ở đúng thao tác Job tương đương trong giai đoạn tương thích; chưa ghi lại cấu hình quyền của người dùng. Khi chuyển giao diện phải hoàn tất mapping/cutover catalog để không giữ hai nơi cấu hình quyền trùng nhau.

Job mới không cần quyền API hồ sơ thuyền viên để lấy danh sách người chọn. Cây thiết bị dùng endpoint tree hiện có với quyền đọc Job; không cấp quyền thêm/sửa thiết bị.

## Query bảng

- Chung: `page` bắt đầu 1, `pageSize` từ 1 đến 100; `sort` theo danh sách cột được hỗ trợ, `descending` boolean. Có thứ tự phụ theo ID để phân trang ổn định. Không nhận chuỗi SQL/cột tùy ý.
- Job: `name` tìm tên/mã/WorkCode; `equipment`, `equipmentAssetId`, `category`, `state`, `department`, `responsibleCrewId`, `dueFrom`, `dueTo`, `dueHoursFrom`, `dueHoursTo`. Sort: `name`, `code`, `due`, `dueHours`, `lastCompleted`, `state`.
- WO: `name`, `code`, `equipment`, `equipmentAssetId`, `jobId`, `status`, `dueState`, `assignedTo`, `department`, `priority` và khoảng hạn ngày/giờ. Sort: `name`, `code`, `due`, `dueHours`, `status`, `priority`.
- `status=OPEN` là mặc định; `ALL`, `DRAFT`, `COMPLETED`, `CANCELLED` hoặc một tiến độ cụ thể là lựa chọn thêm. `jobId` là FK, không suy ra từ tên.
- Lịch sử: `completedBy`, `sourceFrom`, `sourceTo`, `hoursFrom`, `hoursTo`; sort `sourceTime`, `hours`, `completedBy`. Danh sách hợp nhất bằng SQL, không tải JSON báo cáo để lọc/phân trang.
- Khoảng ngày gửi UTC. Các điều kiện lọc/sắp xếp chạy trước phân trang ở DB, phục vụ filter tại cột; không cần toolbar search/sort trùng.
- WO chỉ giờ dùng `work_order_due_hours`, không dùng ngày ước tính hoặc `NextDueAt` tương thích. Tình trạng hạn mở được tính khi đọc bằng counter hiện tại và ngày theo múi giờ tàu, độc lập trạng thái thực hiện. Cảnh báo ngày/giờ được chụp trên WO, sửa Job không thay ngưỡng cảnh báo lệnh cũ.

## Lưu Job và import

- DTO ghi chỉ chứa định nghĩa Job, mốc, trách nhiệm, chính sách và checklist mẫu. Field kết quả, trạng thái WO, vật tư gán, ngày lần làm cuối/hạn trực tiếp hoặc nhóm thiết bị bị từ chối, không bỏ qua âm thầm.
- Thiếu mốc thì `NEEDS_INFORMATION`; đủ thì `ACTIVE`. Lưu không tự tiếp tục Job `PAUSED`/`RETIRED`. Không có bước Kích hoạt riêng.
- `expectedVersion` bắt buộc khớp khi sửa/đổi trạng thái/xóa; lệch trả 409. Job đã có WO/lịch sử không đổi thiết bị và không xóa. Không đổi loại/cơ chế chu kỳ khi còn WO mở. Thay mốc đã vận hành phải có lý do; không sửa hạn của WO đã phát hành.
- Xóa mềm dùng trạng thái `REMOVED`, ẩn khỏi danh sách mặc định nhưng vẫn giữ mã/outbox. Xem lại qua lọc `state=REMOVED`; khôi phục qua thao tác trạng thái có quyền/lý do. Không thêm hậu tố ngẫu nhiên hoặc import đè để né trùng mã.
- Import nhận `{validateOnly, rows}`; mỗi dòng có `rowNumber`, `assetCode`, `code`, `name`, WorkCode, loại/chu kỳ và nội dung cần thiết. Không có baseline, lịch sử, hạn tới hoặc AutoGenerate trong DTO import. Dòng định kỳ thiếu mốc vẫn được lưu để bổ sung bằng form sau.
- Preview chỉ đọc. Import kiểm tra lại dưới khóa writer; nếu có lỗi thì không nhập dòng nào, trả lỗi từng dòng và `imported=0`. Người dùng muốn nhập các dòng hợp lệ phải gửi lại chính tập dòng đã chọn. Một lô hợp lệ chỉ SaveChanges một lần, không gọi API tạo từng dòng.
- POST/PUT Job trả `workOrderCreated=false`: API này chưa phát hành WO và không giả vờ đã đưa vào hàng chờ hoạt động khi worker mới chưa nối.

## WO đột xuất và WO nháp

- Tạo nhận `commandId` UUID, `issueNow` (mặc định false) và định nghĩa: `name`, `equipmentAssetId`, `instructions`, `priority`, `department`, `dueDate`, `dueHours`, `warningDays`, `warningHours`, `crewId`, `supportingCrewIds`, `checklist`. Không có Job giả, chu kỳ, baseline, kết quả, vật tư gán/đã dùng, ảnh hoặc biểu mẫu cũ trong DTO này. Field ngoài hợp đồng, kể cả kết quả lồng trong checklist mẫu, bị từ chối.
- Cùng `commandId`/người tạo/nội dung/nút tàu trả lại cùng WO, kể cả sau sửa nháp, không ghi đè nội dung hiện tại. Thay nội dung hoặc người tạo khi dùng lại mã trả 409. Sau xóa nháp, retry mã cũ trả 410, không khôi phục/tạo lệnh khác. Unique index bảo vệ mã tạo theo nút nguồn, Shore bổ sung phạm vi tàu.
- Nháp cho phép thiếu tên, thiết bị hoặc hạn; chi tiết trả `missingInformation`. Checklist nháp nằm ở `draftChecklistJson`, không tạo thiết bị giả hoặc checklist thực hiện với AssetId rỗng. Thiết bị nếu đã chọn phải là thiết bị cụ thể còn sử dụng; không nhận thư mục/nhóm.
- Khi phát hành, bắt buộc tên, thiết bị cụ thể và ít nhất hạn ngày hoặc counter. Kiểm tra lại thiết bị/PIC/hỗ trợ tại thời điểm phát hành; người rời tàu hoặc thiết bị ngừng sử dụng chặn phát hành. Có PIC hợp lệ thì Đã phân công, chưa có thì Chờ phân công. Không tự nhận/thực hiện/duyệt khi tạo.
- `dueDate` dùng `YYYY-MM-DD` theo múi giờ tàu; V1 chưa nhận hạn có giờ trong form WO đột xuất. Server chuyển đầu ngày đó sang UTC để lưu, trả `dueDate` theo ngày tàu khi đọc; không diễn giải nó thành mốc quá hạn ngay từ đầu ngày. Counter dùng `dueHours`; có thể chỉ đặt counter hoặc kết hợp ngày/counter.
- Chỉ nháp được sửa/xóa bằng các endpoint này. Sửa/phát hành/xóa cần phiên bản hiện tại; sai phiên bản trả 409. Khi phát hành, chụp hướng dẫn/checklist/thiết bị/hạn/ưu tiên thành snapshot và tạo checklist thực hiện với ID thật. Sau phát hành không sửa định nghĩa hoặc xóa lệnh để mất lịch sử; phân công/bàn giao/hủy dùng thao tác riêng đã có. Nháp dùng xóa nháp, không dùng hủy.
- WO đột xuất sau phát hành dùng cùng thực hiện/gửi/duyệt/trả lại/báo cáo như WO từ Job. Báo cáo giữ `jobId=null`, không cập nhật kỳ của Job định kỳ trên cùng thiết bị và không được tính thay kỳ định kỳ.

## Workflow thực hiện và duyệt

- Phát hành thủ công dùng `{jobId,expectedJobVersion,expectedCycleKey,earlyReleaseReason}`; lấy `cycleKey` từ chi tiết Job. Kiểm tra cả phiên bản và kỳ dưới khóa giao dịch: gửi lại yêu cầu của kỳ cũ sau khi duyệt không được tạo WO cho kỳ mới. `requiresCycleResolution=true` cho biết kỳ hiện tại đã hủy/xóa mềm và cần xử lý, không tự phát hành thay thế.
- Mỗi thao tác ghi nhận `expectedVersion` của WO, lấy từ `workflowVersion` trong danh sách/chi tiết; sai phiên bản trả 409. Assignment nhận `crewId`, `supportingCrewIds` và `reason` khi bàn giao. Không nhận danh tính người làm/người duyệt từ payload.
- Lưu/gửi dùng `notes`, `actualDurationMinutes`, `runningHours`, checklist `{id,completed,reading,remarks}` và vật tư `{materialItemId,quantity}`. UI nhập giờ phải đổi sang phút đúng một lần. Checklist trống được chấp nhận; có checklist thì phải khớp ID đã phát hành, hoàn tất và đủ số đo bắt buộc khi gửi. WO giờ/HYBRID phải ghi counter, không thấp hơn counter lúc bắt đầu.
- `submit` cần `commandId` UUID do client giữ khi retry. Cùng mã/nội dung/người gửi ở cùng bản đang chờ duyệt trả lại chính báo cáo đó; dùng lại cho nội dung khác hoặc lượt cũ trả 409. Mỗi lần gửi tiếp sau trả lại tạo revision mới, không ghi đè bản cũ.
- Snapshot giữ checklist, thông số, mã/tên/đơn vị/số lượng vật tư, những người đã đóng góp, hạn và phiên bản Job. Đổi danh mục sau khi gửi không đổi tên/vật tư trong báo cáo. Ảnh/ĐGRR/BBKT không thuộc DTO mới.
- Duyệt/trả lại nhận `{expectedVersion,revision,reportHash,reason}` và dùng cơ chế xác thực tài khoản hiện có: context `/api/approvals/pms/{id}/context?action=approve` (hoặc `action=reject`), các header `X-Approval-Password`, `X-Approval-Hash`, `X-Approval-Version`, `X-Approval-Idempotency-Key`, `X-Approval-Reason`. `reportHash` là hash của bản gửi; header hash là hash hồ sơ duyệt trả từ API approvals, hai giá trị không thay cho nhau. Bằng chứng quyết định liên kết ID action/revision ký thật, không dựng tên chữ ký từ form.
- Người duyệt có quyền không phải là PIC và không bắt buộc liên kết crew đối với tài khoản admin kỹ thuật. Người đã bắt đầu/lưu/gửi bất kỳ lượt nào trong WO không tự duyệt/trả lại WO đó, kể cả sau bàn giao.
- Kho dùng `InventoryStocks` theo vị trí làm nguồn đúng; thiếu/chưa có tồn theo vị trí trả 409, không tự dùng tổng cache để trừ. Mỗi WO/vật tư chỉ có một posting. Duyệt đồng thời/gửi lại không trừ kho lần hai. Thiếu kho hoặc sai kỳ làm rollback toàn bộ báo cáo/kho/kỳ/bằng chứng/outbox.
- Kỳ sau tính từ thời điểm gửi cuối được duyệt và counter trong bản gửi, không theo ngày duyệt/counter tăng sau đó. WO đã hoàn thành giữ nguyên ID/trạng thái/kết quả; Job được cập nhật kỳ tiếp theo. Hủy không tăng kỳ. Thiết bị chỉ trả trạng thái trước bảo trì khi không còn WO khác đang làm/chờ duyệt/cần làm lại.
- Schema, API nháp/phát hành và workflow cho phép WO/báo cáo có `jobId=null`, không cần Job giả. Chưa nối sự kiện lên đà/yêu cầu/chuyến đi hoặc thông báo phân công bền vững.

## Tính toàn vẹn và ranh giới còn lại

- Giao dịch/khóa writer bảo vệ ghi Job, import và cập nhật phiên bản. API cấu hình legacy chặn ghi lên Job protocol mới, kể cả admin; tác vụ sửa ngày legacy cũng bỏ qua Job/WO protocol mới.
- Chi tiết Job/WO đọc trong snapshot repeatable-read, tránh trả tên/phiên bản mới ghép với checklist/kết quả cũ khi có người cập nhật đồng thời.
- Lịch sử cũ có `isLegacy=true`, `sourceExecutedAt` và `submittedAt=null`; endpoint snapshot legacy giữ `timeSource=LEGACY_EXECUTED_AT`, không đổi ngày nguồn thành “Ngày gửi hoàn tất”. Báo cáo mới đã duyệt có `isLegacy=false`, thời điểm gửi và duyệt riêng. Bản trả lại hiện ở timeline/revision của WO, không tính thành lần bảo trì hoàn tất. Không dựng báo cáo cũ bằng kết quả mutable trên task hiện tại.
- 400: payload/điều kiện không hợp lệ; 403: thiếu quyền; 404: sai đối tượng; 409: phiên bản/mã/liên kết xung đột; 503: chưa bật hoặc thiếu cấu hình rework. Không dùng 401 cho lỗi thiếu quyền hoặc feature chưa bật.
- API ghi legacy (kể cả gia hạn cũ) chặn WO protocol mới. Frontend đã có giao diện mới chọn theo catalog backend; chưa tự chuyển Job/WO legacy thành protocol mới, chưa kiểm chứng đồng bộ end-to-end của rework. Outbox mới đã được ghi cùng giao dịch; receiver/capability/fencing chưa sẵn sàng, không coi có outbox là đã đồng bộ được.
