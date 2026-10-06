# Kế hoạch phân quyền theo chức danh trên tàu

Ngày: 06/10/2026. Trạng thái: đã chốt hướng thiết kế; đang triển khai quyền truy cập và thao tác.

## 1. Kết quả đọc code hiện tại

- Chức danh nghiệp vụ nằm ở `ranks`, được thuyền viên tham chiếu qua `RankId`. Shore quản lý bằng `shore_product/backend/Controllers/Crew/RanksController.cs`; có mã, tên, bộ phận, cấp bậc, thứ tự và trạng thái hoạt động.
- `shore_product/backend/Data/AppDbContext.SyncOutbox.cs` tự ghi snapshot `rank` vào outbox với đích `*` khi lưu bằng EF. `edge_product/edge-services/Services/Core/SyncConflictHandler.cs` nhận `rank` như danh mục do bờ sở hữu. Có thể dùng chính danh mục này làm danh sách động bên trái.
- Chức danh khác với vai trò tài khoản. Edge có `User.RoleId`, `User.CrewId` và bảng `Role` trong `Models/EdgeModels.cs`. `Services/Core/CrewAccountProvisioning.cs` cấp vai trò `CREW` cho tài khoản thuyền viên mới; không cấp quyền theo chức danh.
- `SessionAuthMiddleware.cs` xác thực phiên và cung cấp RoleCode. `AuthController.cs` dùng `HasRole` ở các thao tác quản lý tài khoản. Chưa thấy mô hình quyền truy cập module theo chức danh.
- Frontend `components/auth/AuthGuard.tsx` chỉ kiểm tra đăng nhập; `App.tsx` chưa gắn quyền riêng cho từng route. `components/layouts/Sidebar.tsx` chỉ lọc một số mục theo vai trò cố định, ví dụ Audit Log cho ADMIN/CAPTAIN.
- Shore dùng JWT và các policy riêng trong `backend/Program.cs`. Không dùng chức danh thuyền viên để thay thế vai trò nhân viên văn phòng.
- Điểm cần xử lý khi bổ sung quyền nghiệp vụ: `MaintenanceController.ApproveTask` hiện lấy người duyệt từ `request.ApprovedBy`; phần kiểm tra chức danh bị comment với lý do bỏ cột Rank cũ. `CompleteTask` truyền `request.CompletedBy` vào service; cần rà soát kiểm tra danh tính tại service. Không được coi các kiểm tra người thực hiện/phê duyệt hiện tại là đã đầy đủ chỉ vì có comment mô tả. Phải kiểm tra người đăng nhập và `RankId` thực tế khi triển khai.

## 2. Phạm vi và nguyên tắc đề xuất

Trang phân quyền này dành cho **Edge**, quản trị viên trên tàu cấu hình quyền của các chức danh đã nhận từ công ty. Shore tiếp tục sở hữu danh mục chức danh. Nhân viên văn phòng trên Shore giữ cơ chế vai trò hiện hành; nếu cần màn hình phân quyền trên bờ sẽ tách thành yêu cầu riêng.

Tài khoản thuyền viên lấy quyền bằng chuỗi `User.CrewId → CrewMember.RankId → cấu hình quyền chức danh`. Không hardcode danh sách chức danh vào giao diện, không tạo một Role mới cho từng Rank, không tự đổi RoleId theo chức danh.

ADMIN giữ quyền quản trị và có thể phục hồi cấu hình. Quyền chức danh quyết định quyền truy cập trang/tab; quyền thực hiện/phê duyệt PMS, điều kiện trực ca, trạng thái thuyền viên và quyền ghi danh mục do bờ quản lý vẫn kiểm tra riêng. Bật truy cập vật tư trên tàu không cấp quyền thêm/sửa/xóa danh mục vật tư.

ADMIN được quản trị quyền truy cập nhưng vẫn phải tuân thủ quy tắc sở hữu dữ liệu và workflow. Không tự coi tài khoản admin không gắn thuyền viên là người thực hiện hoặc người ký duyệt nghiệp vụ. Nếu cần thao tác thay mặt phải thiết kế quyền riêng, xác định người được đại diện, lý do và audit; không ngầm bỏ qua các điều kiện đó.

Chức danh mới chưa được cấu hình mặc định không có quyền module, hiện nhãn “Chưa cấu hình”. Tài khoản không gắn thuyền viên hoặc chưa có chức danh không được tự cấp toàn quyền. Quản trị viên không bị khóa khỏi trang phân quyền.

### 2.1. Luồng tạo tài khoản và gán chức danh đã thống nhất

1. Khi cơ chế hiện hữu tạo tài khoản thuyền viên, `User.RoleId` mặc định là **CREW**. CREW là loại vai trò tài khoản phục vụ đăng nhập, không phải chức danh và không tự cấp quyền nghiệp vụ.
2. Nếu thuyền viên đã có `RankId`, tài khoản tự hưởng quyền của chức danh đó thông qua `User.CrewId`. Không sao chép RankId vào RoleId hay tạo thêm một Role trùng tên chức danh.
3. Nếu chưa có chức danh, vẫn tạo tài khoản CREW. Tài khoản được đăng nhập, đổi mật khẩu, xem thông tin tài khoản và thông báo “Chưa được gán chức danh”; chưa có quyền vào các module nghiệp vụ.
4. Công ty gán/đổi chức danh cho thuyền viên trên **màn hình quản lý thuyền viên trên bờ**, rồi đồng bộ xuống tàu. Đây là thay đổi hồ sơ/phân công, không phải thao tác trên màn hình phân quyền của admin tàu.
5. Admin trên tàu dùng màn hình **Phân quyền** để xác định “chức danh này được làm gì”. Màn hình không gán chức danh cho từng người. Ví dụ công ty xác định ai là Máy trưởng; admin cấu hình quyền của Máy trưởng.
6. Khi chức danh hoặc cấu hình quyền thay đổi, quyền hiệu lực của tài khoản cập nhật theo. Role tài khoản vẫn là CREW; không chờ tạo lại tài khoản hoặc đổi role thủ công.

Các role nghiệp vụ cũ như CAPTAIN/OFFICER/ENGINEER phải kiểm kê tài khoản và kiểm tra `HasRole` trước khi chuyển đổi. Chuyển quyền tương ứng sang chức danh đúng, giữ ADMIN, sau đó mới ngừng dùng/xóa role không còn tham chiếu. Không xóa ngay hay tự suy ra chức danh từ role cũ nếu hồ sơ chưa xác định.

### 2.2. Phạm vi triển khai đã chốt: truy cập và thao tác

Giai đoạn hiện tại chỉ triển khai **hai lớp quyền**. Dữ liệu nghiệp vụ dùng chung trong phạm vi tàu hiện tại, không phân chia tập dữ liệu theo chức danh và không thêm cấu hình phạm vi dữ liệu.

| Lớp | Câu hỏi cần trả lời | Ví dụ |
| --- | --- | --- |
| Truy cập | Được mở module/tab nào? | Được mở Danh sách công việc, không được mở tab Cấu hình |
| Thao tác | Được thực hiện hành động nào? | Xem, thêm, sửa, xóa, import, export, phân công, thực hiện, duyệt |

Quyết định cho phép = tài khoản hợp lệ + chức danh/quyền hiệu lực (hoặc quyền quản trị phù hợp) + quyền truy cập và thao tác tương ứng + điều kiện workflow/sở hữu dữ liệu được đáp ứng. Bật truy cập module không tự bật mọi thao tác trong module.

Mỗi thao tác được định nghĩa riêng theo chức năng thực tế. Các nhóm thường gặp là xem, thêm, sửa, xóa, import, export; phân công, thực hiện, duyệt, từ chối, cấu hình chỉ có ở module hỗ trợ. Danh mục vật tư Edge chỉ đọc và có thao tác liên kết thiết bị riêng, không có quyền chỉnh sửa danh mục công ty.

Không bổ sung DataScope, bộ lọc quyền theo người/bộ phận hoặc dropdown phạm vi trong màn hình phân quyền. Quyền được cấp áp dụng trên dữ liệu của tàu mà chức năng hiện tại phục vụ; không mở rộng sang dữ liệu tàu khác trên Shore.

Sau khi đọc code: PMS hiện có endpoint tasks/my-tasks lọc theo thuyền viên/phân công. Theo yêu cầu đã chốt, khi triển khai phải điều chỉnh danh sách này để lấy công việc toàn tàu, không giới hạn bản ghi theo người đăng nhập hoặc người được giao. Đổi nhãn “Công việc của tôi” thành “Danh sách công việc” cho đúng nội dung; giữ các bộ lọc tìm kiếm/trạng thái thông thường và phân trang. Việc mở rộng danh sách không tự bỏ điều kiện thực hiện/phê duyệt hoặc cho phép ký thay người khác.

Phân quyền theo phạm vi dữ liệu có thể bổ sung sau bằng yêu cầu riêng. Giữ dữ liệu phân công, CrewId, chức danh và các liên kết hiện hữu để có thể bổ sung bộ lọc/phạm vi về sau; chỉ thay cách lấy danh sách, không xóa dữ liệu phân công. Chưa thêm DataScope hoặc giao diện cấu hình phạm vi trong đợt này.

### 2.3. Ví dụ quyền PMS để duyệt thiết kế

Đây là ví dụ cấu hình đề xuất, không phải quyền mặc định đã được áp dụng:

| Chức danh | Truy cập | Thao tác | Điều kiện nghiệp vụ |
| --- | --- | --- | --- |
| Thợ máy | Bảng công việc, vật tư công ty | Xem; cập nhật tiến độ/checklist; gửi hoàn thành | Dữ liệu tàu dùng chung; vẫn kiểm tra phân công thực hiện theo workflow hiện tại; vật tư chỉ đọc |
| Máy trưởng | Công việc, cấu hình, thiết bị, kho vận | Xem; cấu hình; phân công; duyệt theo quyền được cấp | Không lọc quyền theo bộ phận; công việc phải ở trạng thái cho phép và người duyệt hợp lệ |
| Thuyền trưởng | Các module được cấp | Xem; duyệt theo quy trình | Không được sửa danh mục công ty trên Edge hoặc ký thay người khác qua request |

Cấp quyền duyệt không tự cấp thực hiện, xóa hay cấu hình. Điều kiện người duyệt, người thực hiện, trạng thái công việc và chữ ký vẫn bắt buộc. Quy định không tự duyệt công việc mình thực hiện cần được xác nhận theo workflow của công ty trước khi áp dụng.

## 3. Giao diện theo mẫu

- Bên trái: danh sách tên chức danh đang hoạt động, sắp theo SortOrder rồi tên; có tìm kiếm và bộ phận. Sau khi nhận đồng bộ rank, tự tải lại danh sách, không cần sửa code hay tạo Role thủ công.
- Bên phải: tên chức danh đang chọn, ô tìm quyền theo tên/mã, nút **Lưu thay đổi** và **Đặt lại**; module được nhóm theo menu hiện tại, mỗi trang/tab có công tắc bật/tắt.
- Mỗi module có phần **Quyền thao tác** mở rộng: công tắc xem, thêm, sửa, xóa, import, export và các hành động nghiệp vụ thực tế. Không có lựa chọn phạm vi dữ liệu. Công tắc truy cập không tự chọn thêm/sửa/xóa/duyệt.
- Tắt truy cập module làm các quyền con mất hiệu lực; giao diện khóa chúng, giữ lựa chọn trước đó để admin xem và khôi phục có chủ đích. Khi bật lại phải hiển thị rõ các quyền con sẽ hiệu lực. Lưu trạng thái truy cập và quyền con cùng transaction.
- Nhóm cha thể hiện trạng thái bật hết/tắt hết/một phần; bật/tắt nhóm áp dụng quyền truy cập các mục con, không cấp hàng loạt quyền thao tác. Search chỉ lọc hiển thị, không xóa hoặc tự sửa quyền bị ẩn.
- Layout hai cột, phần danh sách và bảng quyền cuộn độc lập, header/nút lưu cố định; dùng font, màu, border và khoảng cách của hệ thống hiện tại.
- Có trạng thái đang tải, trống, lỗi, thay đổi chưa lưu; chuyển chức danh khi có thay đổi thì yêu cầu xử lý thay đổi đó. Toast báo lưu thành công hoặc lỗi.
- Không dùng danh sách quyền cố định được lưu ở localStorage làm nguồn quyết định truy cập.

## 4. Danh mục module cần đối chiếu khi triển khai

| Nhóm | Trang/tab cần có mã quyền ổn định |
| --- | --- |
| Tổng quan | Bảng điều khiển |
| Hàng hải và dữ liệu tàu | Hàng hải; dữ liệu tàu và các tab hiện hữu |
| Thuyền viên | Danh sách, chi tiết, chứng chỉ, duyệt xuống tàu |
| Khai thác | Cảng, chuyến đi, báo cáo và các tab nghiệp vụ |
| PMS – danh mục | Thiết bị, vật tư công ty, kho |
| PMS – kho vận | Yêu cầu vật tư, phiếu nhập, tồn kho |
| PMS – công việc | Bảng công việc, cấu hình, counter và các tab đang sử dụng |
| An toàn/tài liệu | HSQE, thư viện tài liệu, diễn tập và các tab hiện hữu |
| Nhật ký | Boong, máy, dầu, rác, ballast, trực ca, chuyến đi, abstract |
| Quản trị | Tài khoản, phân quyền, audit log, màn hình trạng thái đồng bộ |

Lập registry từ route, tab và endpoint thực tế trước khi viết migration; không suy ra quyền chỉ từ tên trên menu. Module ẩn/chưa sử dụng không đưa vào mặc định. Ví dụ mã `pms.assets.access`, `pms.work.config.access`, `logbooks.engine.access`; mã ổn định khi đổi tên tiếng Việt.

## 5. Thiết kế dữ liệu đề xuất

Thiết kế ban đầu dưới đây là đề xuất. Bản triển khai bước đầu dùng registry cố định trong code và một bảng cấu hình theo chức danh (chi tiết ở mục 11), thay vì tạo hai bảng danh mục/quyền chưa cần thiết:

- `module_permissions`: mã quyền duy nhất, tên hiển thị/khóa dịch, nhóm cha, module/tab, loại quyền (truy cập/thao tác), hành động, thứ tự, trạng thái; seed từ registry của ứng dụng, không do người dùng tùy ý tạo endpoint. Ví dụ `pms.work.board.access`, `pms.work.tasks.view`, `pms.work.tasks.execute`, `pms.work.tasks.approve`.
- `rank_module_permissions`: `RankId`, `PermissionCode`, `IsAllowed`, phiên bản cấu hình, người và thời điểm cập nhật; unique `(RankId, PermissionCode)`, FK tới rank/quyền. Không thêm DataScope trong đợt này. Lưu rõ false để ghi nhận thu hồi quyền. Version dùng chung cho toàn cấu hình của rank để kiểm soát lưu nguyên tử; schema cụ thể chốt trong bước triển khai.
- Ghi thay đổi vào cơ chế audit hiện hữu sau khi kiểm tra khả năng lưu before/after; chỉ đề xuất bảng audit riêng nếu cơ chế hiện hữu không đáp ứng.

Không xóa bảng `roles`, `users`, `ranks` hay đổi khóa rank hiện tại. Rank bị vô hiệu hóa giữ cấu hình/lịch sử, không cho tài khoản tiếp tục hưởng quyền của rank đó. Nếu chuyển tàu, dùng chức danh/phân công có hiệu lực tại tàu hiện tại; kiểm tra nguồn phân công thực tế trước khi chốt truy vấn.

## 6. API và thực thi quyền

API đề xuất: danh sách quyền, đọc/lưu toàn bộ cấu hình một chức danh, và `/api/auth/me/permissions` trả quyền hiệu lực của tài khoản. API lưu chỉ ADMIN, kiểm tra rank tồn tại/hoạt động, mã quyền hợp lệ và version để tránh ghi đè cấu hình của người khác. Ghi cấu hình và audit cùng transaction; không phát sinh bản ghi cho mã quyền không biết.

Backend cần bổ sung bộ kiểm tra quyền tương thích SessionAuthMiddleware hiện tại, rồi gắn requirement vào controller/action theo registry. Thiếu quyền trả 403 kể cả gọi API trực tiếp. Các endpoint công khai, cảm biến, xác thực và đồng bộ dùng node token giữ cơ chế riêng; công tắc “Đồng bộ” chỉ quản lý truy cập màn hình của người dùng, không ngăn worker nhận dữ liệu.

Các endpoint phục vụ nhiều tab phải kiểm tra đúng quyền của tài nguyên/thao tác, tránh bắt buộc quyền tab cha cho mọi request. Quyền truy cập không bỏ qua kiểm tra người thực hiện/người phê duyệt và điều kiện workflow.

Backend kiểm tra quyền truy cập và thao tác trên danh sách, chi tiết, tìm kiếm, thống kê và export. Không thêm bộ lọc dữ liệu theo chức danh/người được giao; giữ ranh giới tàu, bộ lọc tìm kiếm/trạng thái và phân trang. Danh sách công việc đang dùng tasks/my-tasks phải được điều chỉnh sang dữ liệu toàn tàu; endpoint nên dùng chung truy vấn toàn tàu, tránh sao chép logic danh sách. Với cập nhật/xóa/thực hiện/duyệt, kiểm tra lại quyền và điều kiện của bản ghi trong transaction; bulk operation phải xác thực tất cả bản ghi, thống nhất xử lý nguyên tử hoặc trả kết quả từng bản ghi rõ ràng.

Danh tính người thao tác lấy từ phiên đăng nhập phía server. Các trường client như `ApprovedBy`, `CompletedBy`, `CrewId` không đủ để chứng minh quyền; không cho đổi payload để mạo danh người khác. `CrewId` của người được phân công là dữ liệu đích, khác với danh tính người phân công. Không chọn người duyệt ở client rồi bỏ qua người đang đăng nhập.

Khi bật enforcement, chỉ endpoint/tab đã được ánh xạ mới được chạy trong module được bảo vệ; mục chưa ánh xạ không tự cho phép. Những trường nhạy cảm của hồ sơ/tài liệu cần kiểm kê riêng: tách quyền xem tài liệu nhạy cảm hoặc giới hạn trường trả về nếu quy trình yêu cầu, không trả cả payload rồi chỉ ẩn cột.

Frontend dùng cùng mã quyền cho sidebar, route guard, tab và nút liên quan. Đường dẫn trực tiếp cũng bị chặn. Thu hồi quyền thì cập nhật menu và điều hướng khỏi trang không còn quyền.

## 7. Đồng bộ và cập nhật khi đang đăng nhập

Rank tiếp tục đi Shore → Edge bằng luồng hiện có; không tạo thêm luồng danh mục ngược. Sau khi xử lý rank thành công, vô hiệu hóa cache danh sách/phân quyền. Giao diện mở trang hoặc quay lại cửa sổ phải lấy dữ liệu mới; có thể thêm thông báo thay đổi qua cơ chế realtime hiện hữu sau khi kiểm tra.

Cấu hình quyền trong phương án này thuộc tàu, không tự broadcast sang mọi tàu. Nếu sau này bờ cần cấu hình tập trung, phải thêm scope theo tàu, version và đường đồng bộ riêng; không trộn cấu hình vào snapshot rank.

Cache quyền theo user/rank và version, vô hiệu hóa khi lưu quyền, đổi chức danh, khóa tài khoản hoặc nhận rank mới. Backend dùng dữ liệu hiệu lực hiện tại, không tin quyền cũ chỉ vì phiên đăng nhập còn sống. Tàu mất mạng vẫn thực thi quyền đã lưu trong DB local.

## 8. Chuyển đổi không gián đoạn

1. Kiểm kê route/tab/API, quyền cố định và tài khoản không gắn thuyền viên; lập ma trận **module → thao tác → điều kiện workflow**, xuất bản mapping cho người dùng xem trước. Rà soát cả service xử lý PMS, không chỉ controller/menu.
2. Thêm schema, API và audit dưới feature flag, giữ hành vi hiện tại trong thời gian chuyển đổi.
3. Khởi tạo ma trận quyền cho các chức danh hiện có từ hành vi thực tế đã thống kê; quyền quản trị không tự gán cho tất cả thuyền viên. Quyền nhạy cảm cần mapping rõ trước khi bật.
4. Làm màn hình hai cột, quyền truy cập module/tab và quyền thao tác theo chức danh; điều chỉnh danh sách công việc sang dữ liệu toàn tàu và đổi nhãn “Công việc của tôi”. Schema/registry chỉ phục vụ hai lớp quyền này; không triển khai phạm vi dữ liệu. Trong giai đoạn chuyển đổi vẫn giữ các kiểm tra nghiệp vụ hiện hữu.
5. Gắn kiểm tra quyền thao tác vào từng module, ưu tiên PMS (xem, cấu hình, phân công, thực hiện, duyệt), thuyền viên và kho vận. Hoàn thành kiểm tra server và danh tính người thao tác trước khi công bố hỗ trợ quyền tương ứng. Kiểm tra đồng bộ tạo/thay đổi rank.
6. Bật trên môi trường thử, kiểm thử các tài khoản mẫu, rồi triển khai. Có thể tắt feature flag để quay về cơ chế cũ trong giai đoạn chuyển đổi, giữ dữ liệu/audit.

## 9. Tiêu chí nghiệm thu

- Tạo chức danh trên bờ, đồng bộ thành công: bên trái Edge có chức danh mới, chưa tự hưởng quyền.
- Hai thuyền viên cùng chức danh nhận cùng quyền; đổi chức danh thì quyền thay đổi khi phiên đang hoạt động.
- Tắt module/tab: menu/tab ẩn, URL trực tiếp bị chặn, API trả 403; API không phụ thuộc giao diện.
- ADMIN luôn vào được quản trị phân quyền. CREW chưa gắn rank, rank inactive và tài khoản khóa được xử lý đúng.
- Lưu nhiều công tắc nguyên tử; mã sai và phiên bản cũ bị từ chối; có audit người sửa và before/after.
- Tàu offline vẫn dùng quyền local; nhận rank không ghi đè cấu hình quyền của tàu.
- Không ảnh hưởng node-token sync, cảm biến, đăng nhập, PMS approval và quy tắc vật tư chỉ do bờ quản lý.
- CREW được tự tạo dù chưa có RankId; khi gán chức danh trên bờ và đồng bộ, tài khoản đó nhận đúng quyền mà RoleId vẫn là CREW.
- Người có quyền xem không thể thêm/sửa/xóa/import/duyệt nếu thiếu quyền thao tác, kể cả gọi trực tiếp API.
- Tài khoản có quyền xem danh sách công việc nhận dữ liệu toàn tàu, kể cả danh sách trước đây mang tên “Công việc của tôi”; không lọc ngầm theo crewId/assignedTo của người đăng nhập. Count/phân trang/tìm kiếm phải dùng cùng tập dữ liệu toàn tàu. Không có cấu hình DataScope trong API, database hoặc giao diện của đợt này.
- Đổi `ApprovedBy`/`CompletedBy` trong payload không thể ký hoặc thực hiện thay người khác. Kiểm tra phân công dùng định danh chính xác; người trùng tên không được hưởng quyền của nhau.
- Duyệt khi sai trạng thái hoặc sửa danh mục vật tư công ty trên Edge vẫn bị từ chối, kể cả module đã bật. Thu hồi quyền hoặc đổi chức danh làm mất quyền trong phiên đang hoạt động.

## 10. Seed chức danh (yêu cầu số 1)

`RankSeedData.SeedAsync` bổ sung bộ danh mục 25 chức danh cho DECK/ENGINE/CATERING/OTHER. Giữ nguyên bản ghi đã có, kể cả inactive; nhận alias MAST để không tạo thêm Captain trùng nghiệp vụ. EF ghi snapshot rank mới và outbox cùng transaction. Startup chạy lại không thêm trùng hay tạo lại hàng đợi; có advisory lock để tránh hai instance seed đồng thời.

Chạy riêng trên database đã có schema: `dotnet run --project shore_product/backend -- --SeedRanksOnly=true` (sử dụng cấu hình kết nối của môi trường đó). Chế độ này không chạy worker, không tự áp dụng các migration khác. Danh mục vẫn cho phép công ty bổ sung chức danh đặc thù; bộ seed không phải danh sách chức danh pháp lý bắt buộc cho mọi tàu.

## 11. Bản triển khai bước đầu

- Bản seed và kế hoạch đã được push trước khi triển khai: commit 415612c1 trên feature/hiu67.
- Danh mục module và mapping endpoint nằm ở permissions.registry.json, nhúng vào backend. Có 29 mục module/tab và 451 mapping action hiện hữu, gồm các API đọc dữ liệu phụ trợ cần cho dashboard và các selector. Endpoint chưa được ánh xạ không tự được mở cho CREW. Danh sách này là registry của ứng dụng, khác với danh sách chức danh động từ DB.
- Bảng mới thực tế là rank_permission_configs: RankId (PK/FK), GrantsJson, Version, UpdatedAt, UpdatedBy. Lưu cả cấu hình trong một bản ghi để version dùng chung và lưu nguyên tử. Không thêm DataScope; không xóa bảng Role/User/Rank. Migration: 20261006110000_AddRankPermissionConfigs.
- Registry thay vai trò bảng module_permissions trong đợt này; GrantsJson thay các dòng rank_module_permissions. Server kiểm tra mọi mã quyền trước khi lưu; các quyền không được chọn tương đương từ chối. Khi cần mở rộng phạm vi dữ liệu sẽ thiết kế migration riêng, giữ liên kết chức danh và phân công.
- API /api/permissions/me, /catalog, /ranks, /ranks/{id}. Chỉ ADMIN đọc/sửa cấu hình chức danh. Lưu kiểm tra version, dùng transaction/advisory lock và ghi before/after vào SystemLog cùng transaction. Cấu hình này không đi vào hàng đợi đồng bộ.
- RankPermissionFilter được đăng ký toàn cục cho controller. Lấy role, thuyền viên, chức danh và quyền hiện tại từ DB; không tin RoleCode cũ trong cache phiên. Giữ các đường công khai/node-token sync và cảm biến hiện hữu.
- Chặn tạo thuyền viên/gán lại chức danh hoặc đổi CrewId trên Edge để tránh tự chuyển tài khoản sang chức danh có nhiều quyền hơn. Thực hiện các thay đổi định danh/chức danh trên bờ rồi đồng bộ; tài khoản vẫn được provision tự động với CREW.
- PMS thực hiện/duyệt dùng thuyền viên liên kết tài khoản. Không nhận ApprovedBy/CompletedBy/PerformedBy khác danh tính thật; thao tác từ chối kiểm tra quyền reject riêng. Generic update không được dùng để bỏ qua workflow hoàn thành/duyệt; đổi phân công cần quyền assign. Phần kiểm tra chức danh cũ bị comment được thay bằng quyền approve/reject của chức danh hiện tại trong filter.
- Frontend thêm /admin/permissions với hai cột, nhóm module, công tắc thao tác, tìm kiếm, version, toast và nhắc thay đổi chưa lưu khi chọn chức danh khác. Bật module mặc định kèm quyền xem; không tự bật các quyền ghi/duyệt. Tắt module giữ lựa chọn thao tác nhưng làm chúng mất hiệu lực.
- Sidebar và route guard dùng quyền server. Tab Cấu hình/Counter của PMS và các nút ghi chính của PMS kiểm tra quyền tương ứng. API vẫn kiểm tra mọi thao tác, kể cả các màn hình cũ chưa có đầy đủ trạng thái ẩn/khóa nút. Cần tiếp tục đồng nhất trạng thái nút ở các module còn lại theo registry; không coi việc ẩn nút là lớp bảo vệ.
- Danh sách công việc lấy toàn tàu; endpoint tasks/my-tasks không còn lọc crewId/assignedTo. Đổi nhãn thành Danh sách công việc; giữ phân công để bổ sung lọc về sau.
- Frontend lấy lại quyền/chức danh khi mở trang, quay lại cửa sổ và mỗi 30 giây. API thu hồi quyền ngay theo DB; menu của phiên khác cập nhật ở lần tải tiếp theo. Chức danh chưa cấu hình mặc định không có quyền nghiệp vụ; ADMIN cần cấu hình trước khi thuyền viên sử dụng bản mới.
- Màn hình quản lý tài khoản chỉ cho chọn ADMIN/CREW đang hoạt động; backend từ chối dùng chức danh nghề nghiệp làm role tài khoản. Các role cũ vẫn giữ dữ liệu để chuyển đổi, không tự xóa hoặc tự nâng quyền.
- Khi ký thực hiện/duyệt PMS, thuyền viên liên kết phải có chức danh hoạt động và đã được duyệt lên tàu; quyền truy cập toàn tàu không thay thế điều kiện ký nghiệp vụ.

### Kiểm chứng bản triển khai

- Đã áp dụng migration mới vào database Edge local; xác nhận có 25 chức danh và chưa tự cấp quyền cho chức danh nào.
- Backend build và frontend production build thành công. 9 bài kiểm thử mới về quyền/role/workflow đạt; bài PostgreSQL về lưu cấu hình, version conflict và audit đạt trên database thử riêng.
- Lần chạy toàn bộ suite trước kiểm thử role cuối: 90 đạt, 1 lỗi VSAT tại SensorAndDeferralSyncTests.cs:143 (mong đợi 2 payload, thực tế 1). Đã chạy lại cùng bài trên source commit 415612c1 trước thay đổi phân quyền và xác nhận cùng lỗi; chưa sửa luồng VSAT trong phạm vi này.
- Phần triển khai sau commit 415612c1 hiện nằm local, chưa push lần thứ hai. Cần build/restart dịch vụ Edge để dùng code mới và đăng nhập ADMIN vào Phân quyền để cấp quyền theo chức danh.
- Cập nhật vị trí giao diện: Quản lý tài khoản tại /admin/accounts có hai tab Tài khoản và Phân quyền, kiểu tab giống Danh sách công việc. Tab Phân quyền dùng /admin/accounts?tab=permissions; bỏ mục Phân quyền riêng trên sidebar. Đường dẫn /admin/permissions cũ chuyển hướng vào tab mới. Giữ nguyên bản nháp phân quyền khi chuyển giữa hai tab.
- Điều chỉnh giao diện theo phản hồi: tab lớn hơn; bỏ hai khối tiêu đề trang; bảng tài khoản hiển thị tên chức danh từ hồ sơ thuyền viên, không dùng dropdown ADMIN/CREW ở cột này. Phân quyền hiển thị dạng ma trận module/thao tác: công tắc có nhãn cho truy cập module, checkbox cho từng thao tác và truy cập cả nhóm, không hiển thị mã kỹ thuật. Có header và cột module cố định, cuộn ngang/dọc.
- Thiết kế phân quyền mới nhất: danh sách module theo từng nhóm, tên module và công tắc Truy cập ở bên trái; checkbox có nhãn ở bên phải, chỉ hiển thị các thao tác áp dụng. Giao diện tự xuống dòng theo chiều rộng, không còn ma trận 10 cột hoặc ô trống/gạch ngang. Giữ tìm kiếm, chọn truy cập cả nhóm, lưu/version/audit và dữ liệu quyền hiện có.
- Bản nền tảng phân quyền và seed admin đã push lên origin/feature/hiu67 tại commit 92f55371. Bố cục mới nhất gộp Tài khoản và Phân quyền thành một màn hình tại /admin/accounts: chức danh bên trái, cấu hình quyền ở giữa, danh sách tài khoản bên phải; không còn thanh hai tab hoặc nút Làm mới. Chọn tài khoản mở quyền theo RankId thực tế từ API, không so sánh tên chức danh. Tài khoản vẫn có đặt lại mật khẩu và khóa/mở; chức danh vẫn do bờ quản lý. Giữ style trắng/xanh, font và nút hiện có của hệ thống. Danh sách tài khoản/chức danh tự cập nhật khi focus và mỗi 30 giây.
