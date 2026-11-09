# Đề xuất dashboard Engine Summary cho Edge

Ngày lập 09/11/2026. Trạng thái đã triển khai và kiểm thử local trên nhánh hiu67-rework.

## 1. Căn cứ và hướng thiết kế

Đã đọc tài liệu Engine Summary của AOMP. Trang tham khảo có các nhóm theo dõi máy, so sánh hai máy, nhiên liệu, hiệu suất và hàng hải. Dashboard mới sẽ vận dụng các nhóm này cho giao diện trên tàu. [Tài liệu AOMP](https://aomp.aquametro-oil-marine.com.sg/tutorial/docs/Dashboard/engine-summary/)

Phần bố trí, số liệu, cách mô phỏng, quyền và hành vi dưới đây là đề xuất cho hệ thống hiện tại để người dùng duyệt.

### Vị trí truy cập

- Thêm mục **Tổng quan máy** trên sidebar, đặt ngay sau Bảng điều khiển. Tên tiếng Anh là **Engine Summary**.
- Đường dẫn đề xuất `/engine-summary`.
- Trang sử dụng header, sidebar, bộ icon Lucide, bảng, màu nền, font và hộp thoại chung của Edge.
- Phạm vi là tàu hiện tại. Phần nội dung bắt đầu từ thanh chọn máy và chế độ xem.
- Dữ liệu giai đoạn này hoàn toàn giả lập, tự thay đổi.

### Hai cách xem

1. **Chi tiết thiết bị — Engine Detail**. Ba cột như ảnh tổng thể, chuyển bằng các tab Máy chính, Máy phụ và Nồi hơi.
2. **So sánh — Dual Engine Detail**. Hai thẻ đồng hồ cạnh nhau, bộ lọc thiết bị và phân trang như ảnh so sánh.

## 2. Vị trí của từng giao diện trong ảnh

Bản đầu đã bố trí lại quá xa mẫu. Bản điều chỉnh này dùng cấu trúc ba cột của ảnh làm bố cục chính, đồng hồ lớn ở trên và đồng hồ nhỏ phía dưới, KPI và cụm la bàn ở cột phải.

| Ảnh người dùng gửi | Vị trí và hành vi trong dashboard |
| --- | --- |
| 1. Toàn màn hình | Màn mặc định của mục Tổng quan máy, chế độ Engine Detail, bố cục ba cột |
| 2. MainEngine / Aux Engine / Boiler | Thanh tab ở trên hai cột trái, chuyển nhóm thiết bị và cập nhật nội dung của trang |
| 3. Thẻ đồng hồ | Cột trái, đồng hồ chính lớn phía trên, đồng hồ phụ nhỏ phía dưới, bảng thông số ở chân thẻ |
| 4. Fuel Consumption và SFOC | Cột giữa, hai biểu đồ đường xếp dọc trong cùng thẻ, có số cấp/hồi giữa hai biểu đồ và giá trị SFOC phía cuối |
| 5. Dual Engine Detail | Chọn chế độ So sánh ở thanh công cụ trên cùng để chuyển sang màn hai thẻ, có lọc và phân trang |
| 6. KPI | Thẻ trên cùng của cột phải, năm dòng số liệu và combo khoảng thời gian ngay trong thẻ |
| 7. La bàn và môi trường | Thẻ dưới KPI ở cột phải, giữ cấu trúc vòng phương hướng, lõi đường chân trời và bốn góc thông số |

### 2.1. Wireframe Engine Detail trên màn ngang

```text
+------------------+-------------------------------------------------------------------------------------------+
| SIDEBAR EDGE     | HEADER HE THONG                                                                           |
| Tong quan tau    +-------------------------------------------------------------------------------------------+
| Bang dieu khien  | TONG QUAN MAY       14:32:09        [Engine Detail v] [|| Tam dung]    |
| > Tong quan may  +-------------------------------------------------------------+-----------------------------+
| Hang hai        | [May chinh (1)]  [May phu (1)]  [Noi hoi (1)]                 | KPI               [Hom nay v]|
| ...             +------------------------------+------------------------------+                             |
|                 | MAY CHINH (1)                | TIEU HAO NHIEN LIEU          | Tong nhien lieu    10,80 t   |
|                 | Thong tin thiet bi           |                  [Hom nay v]| Quang duong        210 NM    |
|                 |                              |     MDO (do)  HFO (xanh)     | CO2                33,48 t   |
|                 |       .--------------.       | kg                           | Nhien lieu / NM    51,43 kg  |
|                 |      /  DONG HO LON    \      |   __/~~\____/~~~\___         | CO2 / NM          159,43 kg  |
|                 |     |      RPM         |     | --------------------------   +-----------------------------+
|                 |     |       92         |     | 00:00   06:00  12:00  18:00   | Do sau           Dong chay  |
|                 |      \______________/       |                              | 45 m             1,2 kn     |
|                 |                              | Luu luong cap    1.480 kg/h  |                             |
|                 |          .--------.          | Luu luong hoi      544 kg/h  |             BOW             |
|                 |         / DONG HO  \         |                              |              N              |
|                 |        |   NHO     |         | HIEU SUAT SFOC               |        NW .-----. NE        |
|                 |        | 4.800 kW  |         | g/kWh                        | PORT W  | CHAN  |  E STBD   |
|                 |         \________/          |   ~~\___/~~~~\___            |         | TROI  |           |
|                 |                              | --------------------------   |        SW '-----' SE        |
|                 | Tieu thu          936 kg/h   | 00:00   06:00  12:00  18:00   |              S              |
|                 | Toc do quay        92 RPM   |                              |             AFT             |
|                 | Cong suat       4.800 kW    | SFOC             195 g/kWh   |                             |
|                 | Chay hom nay      10h15     |                              | Gio                 Ship GPS|
|                 | Nhien lieu ngay   10,80 t   |                              | 9 kn / 044 deg  12,4 kn/068  |
|                 | SFOC              195 g/kWh |                              |                             |
|                 +------------------------------+------------------------------+-----------------------------+
+------------------+-------------------------------------------------------------------------------------------+
```

- Thanh trên sử dụng tàu đang đăng nhập. Combo chế độ ở bên phải tương ứng Engine Detail / Dual Engine Detail trong ảnh.
- Tab nhóm nằm ngang trên hai cột trái. Nếu nhóm có nhiều thiết bị, hiện combo tìm/chọn thiết bị trong nhóm ngay dưới thanh tab.
- Tỷ lệ ba cột đề xuất khoảng 34% / 34% / 32% trên vùng nội dung, điều chỉnh theo sidebar và kích thước thực tế.
- Cột trái và giữa cao tương đương. KPI ở phải chiếm phần trên, cụm la bàn chiếm phần còn lại.
- Biểu đồ nhiên liệu dùng hai đường MDO và HFO theo ảnh, có điểm dữ liệu, chú giải và trục thời gian. Trục Y là kg tiêu hao trong từng khoảng gom dữ liệu.
- SFOC dùng đường xanh lá, cùng khoảng và trục thời gian với nhiên liệu. Số cấp/hồi và SFOC cuối thẻ là giá trị tức thời, có nhãn rõ.
- Đồng hồ dùng kim, vạch chia, đơn vị, vùng cảnh báo và số đọc chính xác. Đồng hồ nhỏ nằm dưới đồng hồ lớn trong cùng thẻ.
- KPI là bảng năm dòng như ảnh. Combo riêng tại thẻ KPI điều khiển khoảng tính KPI. Combo ở thẻ biểu đồ điều khiển đồng thời hai biểu đồ trong thẻ đó.
- Hai khoảng mặc định đều Hôm nay. Mỗi thẻ ghi khoảng đang xem, cho phép chọn Hôm nay / 7 ngày / 30 ngày độc lập.
- Tổng nhiên liệu và CO2 trong KPI thuộc thiết bị đang chọn. Quãng đường thuộc tàu, cùng khoảng thời gian KPI. Hai tỷ số lấy nhiên liệu/CO2 của thiết bị chia quãng đường tàu, có tooltip giải thích phạm vi.
- Đổi tab/thiết bị cập nhật cả thẻ đồng hồ, thẻ biểu đồ và KPI. La bàn và thông số môi trường dùng chung dữ liệu tàu.

### 2.2. La bàn và lõi đường chân trời

```text
+---------------------------------------------------+
| Do sau                                 Dong chay  |
| 45 m                                  1,2 kn      |
|                                         110 deg   |
|                       BOW                         |
|                        N                          |
|                 NW .---------. NE                 |
|                   /   troi    \                   |
|          PORT W  |---- + -----|  E STBD            |
|                  |    bien   |                    |
|                 SW '---------' SE                 |
|                        S                          |
|                       AFT                         |
| Gio                                    Ship GPS  |
| 9 kn / 044 deg                   12,4 kn / 068 deg |
+---------------------------------------------------+
```

- Giữ đủ nhãn Bow/Aft/Port/Stbd, hướng chính/phụ và lõi xanh trời/xanh đậm như ảnh.
- Mũi tàu là mốc cố định ở đầu vòng. Vòng phương hướng thể hiện hướng Bắc tương đối với heading của tàu, mọi góc cùng một quy ước.
- Kim gió và dòng chảy có màu riêng, chú giải và giá trị số. Lõi có vạch nghiêng, mô phỏng lắc ngang/dọc nhỏ, chuyển động chậm.
- Ship GPS hiển thị tốc độ và hướng di chuyển, đơn vị kn/độ. Heading và hướng di chuyển là hai giá trị có nhãn riêng khi mở giải thích.
- Tất cả thành phần là SVG có thể co giãn, chữ vẫn nằm trong thẻ khi xoay màn hình.

### 2.3. Wireframe Dual Engine Detail

```text
+------------------------------------------------------------------------------------------+
| TONG QUAN MAY                          [Dual Engine Detail v] [|| Tam dung]               |
+------------------------------------------------------------------------------------------+
| [<]                     Trang 1 / 2 - 3 thiet bi                                     [>]   |
|                           [Tat ca thiet bi v]                                            |
+--------------------------------------------+---------------------------------------------+
| MAY CHINH (1)                              | MAY PHU (1)                                 |
| Thong tin thiet bi                         | Thong tin thiet bi                          |
|                                            |                                             |
|          .----------------.                |          .----------------.                 |
|         /  DONG HO LON RPM  \               |         / DONG HO LON kW   \                 |
|        |        92          |              |        |       600          |               |
|         \________________/                |         \________________/                 |
|                                            |                                             |
|             .--------.                     |             .--------.                      |
|            / DONG HO  \                    |            / DONG HO  \                     |
|           | 4.800 kW  |                    |           |   SFOC    |                     |
|            \________/                     |            \________/                      |
|                                            |                                             |
| Tieu thu                    936 kg/h      | Tieu thu                     126 kg/h       |
| Toc do quay                  92 RPM      | Cong suat                    600 kW         |
| Cong suat                 4.800 kW       | Tai may                       75%           |
| Chay hom nay               10h15         | Chay hom nay                  12h30         |
| Nhien lieu ngay            10,80 t       | Nhien lieu ngay                1,60 t       |
| SFOC                       195 g/kWh     | SFOC                          210 g/kWh     |
+--------------------------------------------+---------------------------------------------+
```

- Màn so sánh tập trung hai thẻ đồng hồ/thông số như ảnh 5. Bộ lọc chọn tất cả hoặc một nhóm thiết bị, có tìm kiếm khi danh sách dài.
- Mỗi trang tối đa hai thiết bị theo thứ tự Máy chính → Máy phụ → Nồi hơi. Nút trước/sau và số trang cập nhật theo bộ lọc.
- Trang 2 của bộ demo có một thẻ Nồi hơi, giữ cùng kích thước thẻ, căn trái. Khi lọc chỉ còn một thiết bị, hiển thị một thẻ và một trang.
- Hai thẻ dùng cùng snapshot, cùng cách căn nhãn/giá trị. Cấu hình đồng hồ và trường thông tin tùy nhóm, theo mục 4.
- Quay về Engine Detail khôi phục tab, thiết bị và khoảng xem trước đó.

## 3. Màn hình dọc và thao tác cảm ứng

### 3.1. Wireframe dọc của Engine Detail

```text
+-----------------------------------------------------+
| HEADER EDGE                                         |
+-----------------------------------------------------+
| TONG QUAN MAY [Engine Detail v] [|| Tam dung]         |
| [May chinh (1)] [May phu (1)] [Noi hoi (1)]           |
+-----------------------------------------------------+
| THONG TIN THIET BI                                   |
|                (DONG HO LON)                        |
|                   (NHO)                             |
|            Bang thong so theo nhom                  |
+-----------------------------------------------------+
| TIEU HAO NHIEN LIEU                      [Hom nay v] |
|             Hai duong MDO / HFO                     |
| Luu luong cap / hoi                                 |
| SFOC                                                |
|             Bieu do duong xanh la                   |
| SFOC hien tai                                       |
+-----------------------------------------------------+
| KPI                                     [Hom nay v] |
|                Nam dong gia tri                     |
+-----------------------------------------------------+
| Do sau                                  Dong chay   |
|                   LA BAN                            |
|               LOI CHAN TROI                         |
| Gio                                      Ship GPS  |
+-----------------------------------------------------+
```

- Màn ngang rộng từ 1.600 px dùng ba cột như ảnh. Ở 1.920 × 1.080 px, ưu tiên đặt đầy đủ bốn thẻ trong vùng nội dung với tỷ lệ đồng hồ/biểu đồ dễ đọc.
- Màn ngang khoảng 1.280 px hoặc khi phóng chữ dùng hai cột trái, đưa KPI và la bàn xuống hàng kế tiếp.
- Màn dọc 1.080 × 1.920 px và viewport sau scale 864 × 1.536 px xếp khối theo thứ tự trong wireframe, một luồng cuộn dọc. Biểu đồ cao khoảng 240–300 px.
- So sánh giữ hai cột khi mỗi thẻ còn đủ 360 px. Nếu hẹp hơn, xếp hai thẻ theo chiều dọc, vẫn cùng một trang so sánh.
- Toolbar có thể chia hai hàng, tab nhóm cuộn ngang khi thiếu chỗ.
- Chữ nội dung tối thiểu 14 px, số chính 28–36 px. Vùng chạm nút tối thiểu 44 × 44 px, icon 22–24 px.
- Chạm điểm biểu đồ giữ tooltip, chạm ngoài để đóng. Tooltip đang xem giữ timestamp cho đến khi đóng.
- Các thẻ có chiều cao cân đối, số cập nhật giữ vị trí cuộn. Phóng to thẻ bằng modal chung có nút đóng dễ chạm.

## 4. Thông tin cần hiển thị và phạm vi tính

### 4.1. Bộ thiết bị demo bám theo ba tab

| Nhóm | Thiết bị demo | Đồng hồ lớn | Đồng hồ nhỏ | Các dòng thông số |
| --- | --- | --- | --- | --- |
| Máy chính (1) | ME1, định mức 6.400 kW | Shaft RPM | Shaft Power | Tiêu hao, RPM, công suất trục, thời gian chạy hôm nay, nhiên liệu hôm nay, SFOC |
| Máy phụ (1) | AE1, định mức 800 kW | Công suất phát | SFOC | Tiêu hao, công suất, tải, thời gian chạy hôm nay, nhiên liệu hôm nay, SFOC |
| Nồi hơi (1) | Boiler1 | Áp suất hơi | Tải đầu đốt | Tiêu hao, áp suất, tải đầu đốt, thời gian đốt hôm nay, nhiên liệu hôm nay |

Nồi hơi có cấu hình thông số riêng. Khi chọn Nồi hơi, khu vực biểu đồ thứ hai chuyển thành **Áp suất hơi**, đơn vị bar. SFOC chỉ hiển thị cho các máy có công suất kW phù hợp để tính g/kWh. Cách này giữ bố cục của ảnh và thể hiện đúng loại thiết bị.

Máy chính chạy ổn định, máy phụ có chu kỳ thay đổi tải và nồi hơi đốt theo chu kỳ. Tên, định mức và giới hạn đồng hồ được đặt trong một nguồn cấu hình demo duy nhất.

### 4.2. Phạm vi dữ liệu của từng thẻ

| Thẻ | Phạm vi | Điều khiển thời gian |
| --- | --- | --- |
| Đồng hồ và bảng thông số | Thiết bị đang chọn, số tức thời và phần hôm nay có nhãn riêng | Snapshot hiện tại, tích lũy hôm nay |
| Biểu đồ nhiên liệu và SFOC/áp suất | Thiết bị đang chọn | Combo tại thẻ biểu đồ, điều khiển cả hai biểu đồ |
| KPI | Nhiên liệu/CO2 của thiết bị đang chọn, quãng đường của tàu cùng khoảng | Combo riêng trong thẻ KPI |
| La bàn và môi trường | Tàu hiện tại | Snapshot hiện tại |
| So sánh | Các thiết bị trên trang hiện tại | Snapshot hiện tại, tích lũy hôm nay |

Các tên viết tắt có icon giải thích. Thời gian vận hành hiển thị giờ/phút, đơn vị luôn đứng cạnh giá trị.

### 4.3. Đơn vị và xử lý giá trị

- Tốc độ quay dùng RPM, công suất dùng kW, lưu lượng dùng kg/h.
- Khối tích lũy nhiên liệu và CO₂ dùng tấn. Giá trị theo quãng đường dùng kg/NM. Ghi đầy đủ đơn vị trên thẻ.
- Tốc độ tàu dùng kn, độ sâu dùng m, hướng dùng độ.
- Tiếng Việt và tiếng Anh dùng cùng giá trị, định dạng số/ngày theo ngôn ngữ đã chọn.
- Động cơ dừng có công suất, RPM và mức tiêu hao bằng 0 trong trạng thái ổn định. SFOC hiển thị dấu gạch khi công suất quá thấp để tính có ý nghĩa.
- Khi quãng đường bằng 0, hai tỷ số theo NM hiển thị dấu gạch.
- Đường tham chiếu SFOC là giá trị demo riêng của từng máy. Tooltip giải thích đây là tham chiếu của bộ mô phỏng.

## 5. Dữ liệu giả phải tự thay đổi như thế nào

### 5.1. Một nguồn dữ liệu cho toàn trang

Tạo bộ mô phỏng dùng chung, sinh một snapshot có timestamp cho tất cả máy và thông số tàu mỗi **3 giây**. Mọi đồng hồ, KPI và biểu đồ đọc cùng snapshot.

Đề xuất dùng Zustand hiện có để lưu snapshot, máy đang chọn, chế độ xem và trạng thái tạm dừng. Nguồn dữ liệu mô phỏng được tách khỏi phần hiển thị để sau này có thể cung cấp snapshot từ cảm biến.

### 5.2. Quy luật biến đổi

- Tải máy biến đổi từ từ theo chu kỳ và nhiễu nhỏ có seed. Máy chính phần lớn hoạt động ở vùng 60–85% tải.
- Công suất, RPM và nhiên liệu được tính từ trạng thái tải. Các số dịch chuyển mượt trong khoảng hợp lệ.
- AE1 có kịch bản nhận tải/thay đổi tải. Boiler1 có chu kỳ bật/tắt đầu đốt, áp suất tăng/giảm mượt theo chu kỳ.
- Giá trị cấp luôn lớn hơn hoặc bằng giá trị hồi, chênh lệch bằng tiêu hao ròng trong cùng thời điểm.
- SFOC được suy ra từ tiêu hao và công suất. Ví dụ 936 kg/h ở 4.800 kW tương ứng 195 g/kWh.
- Máy đổi nhiên liệu theo kịch bản có mốc thời gian. Trong trạng thái ổn định, lượng tiêu hao được ghi vào loại nhiên liệu đang sử dụng.
- Thông số hàng hải có mô phỏng riêng nhưng dùng cùng đồng hồ thời gian. Tốc độ thay đổi mượt, các góc quay qua 359° → 0° theo quãng ngắn.

### 5.3. Tổng tích lũy có quan hệ với số tức thời

- Nhiên liệu là tích phân lưu lượng theo thời gian.
- Giờ chạy hoặc thời gian đốt chỉ tăng khi thiết bị hoạt động. Phần Hôm nay chỉ cộng trong ngày tàu hiện tại.
- Quãng đường là tích phân tốc độ theo thời gian.
- CO₂ được tính bằng lượng nhiên liệu nhân hệ số cấu hình demo. Ví dụ hệ số 3,10 t CO₂/t nhiên liệu chỉ là tham số minh họa của bộ dữ liệu.
- Ví dụ KPI của ME1 có 10,80 t nhiên liệu, quãng đường tàu 210 NM, CO₂ demo 33,48 t. Hai tỷ số tương ứng khoảng 51,43 kg/NM và 159,43 kg/NM.
- Khi đổi thiết bị, KPI tính lại phần nhiên liệu/CO₂ cho thiết bị đó. Đổi khoảng tại thẻ nào chỉ tính lại thẻ đó. Hai biểu đồ trong thẻ nhiên liệu luôn dùng chung khoảng.
- Qua 00 giờ theo múi giờ tàu, phần Hôm nay bắt đầu ngày mới. Dữ liệu 7/30 ngày vẫn bao gồm các ngày trước trong khoảng của nó.

### 5.4. Lịch sử, tạm dừng và tải lại trang

- Sinh sẵn lịch sử 30 ngày có seed cố định. Cùng máy, cùng mốc thời gian sẽ cho cùng dữ liệu.
- Biểu đồ Hôm nay gom theo 15 phút, 7 ngày theo giờ, 30 ngày theo 6 giờ. Gom bằng tổng với nhiên liệu và trung bình có trọng số thời gian với số tức thời.
- Dữ liệu tức thời lấy độ phân giải cao hơn. Các tổng tích lũy được tính từ nguồn mô phỏng gốc, tránh cộng trực tiếp các điểm trung bình trên biểu đồ.
- Giữ giới hạn khoảng 240 điểm cho mỗi chuỗi biểu đồ. Đồng hồ cập nhật 3 giây, chuỗi lịch sử chỉ cập nhật điểm đang hoạt động.
- Nút Tạm dừng đóng băng phần đang hiển thị và hiện trạng thái Đã tạm dừng. Nút Tiếp tục bắt kịp thời điểm hiện tại của mô phỏng.
- Đổi tab máy hoặc chế độ xem dùng cùng nguồn đang chạy.
- Lưu seed/phiên bản cấu hình và lựa chọn xem tối thiểu ở localStorage. Dữ liệu tại thời điểm hiện tại được tái dựng từ mốc thời gian ổn định, tránh việc tải lại trang làm tổng hôm nay trở về 0.
- Khi tab trình duyệt ở nền, dừng việc vẽ lại liên tục. Khi quay lại, dựng snapshot theo thời điểm hiện tại và cập nhật một lần.
- Khi rời trang, dọn timer và listener. Khi quay lại, sử dụng cùng mốc mô phỏng.

## 6. Tái sử dụng hệ thống hiện tại

Đã đối chiếu mã nguồn Edge tại thời điểm lập kế hoạch.

| Thành phần có sẵn | Cách sử dụng đề xuất |
| --- | --- |
| Sidebar và router | Đăng ký trang riêng, trạng thái mục đang chọn giống các mục hiện tại |
| Recharts | Vẽ biểu đồ và đồng hồ bằng thành phần sẵn có của dự án |
| Zustand | Một nguồn snapshot và trạng thái xem cho toàn dashboard |
| I18nContext và từ điển dịch | Hoàn thiện đồng thời VI/EN, bao gồm tooltip và trạng thái |
| AppModal và style hệ thống | Phóng to thẻ, hộp giải thích và nút thao tác |
| Registry phân quyền | Thêm quyền truy cập Engine Summary cho chức danh và Admin |
| Dịch vụ vị trí tàu | Hiện có API vị trí mới nhất/lịch sử. Giai đoạn demo này phần hàng hải dùng cùng bộ giả lập của dashboard |
| PMS Counter | Dùng để đối chiếu khái niệm giờ chạy khi kết nối dữ liệu thật về sau. Bộ mô phỏng chỉ có dữ liệu trong phạm vi dashboard |

Sự có mặt của API vị trí chưa xác nhận hệ thống có đủ luồng cảm biến máy tương ứng. Việc nối RPM, lưu lượng, công suất và hiệu suất vào dữ liệu thực cần một đợt tích hợp riêng.

## 7. Phân quyền và điều hướng

- Đề xuất module `dashboard.engine-summary`, route `/engine-summary`, quyền truy cập/xem.
- Sidebar và việc mở URL trực tiếp phải kiểm tra cùng quyền.
- Admin có thể bật/tắt quyền này trong danh sách bên trái của màn hình phân quyền, giống hai dashboard hiện có.
- Giữ quy tắc đang có là phải bật ít nhất một trong **Tổng quan tàu** hoặc **Bảng điều khiển**. Engine Summary là quyền bổ sung riêng trong giai đoạn này.
- Tài khoản đã có trước thay đổi giữ cấu hình dashboard hiện tại. Engine Summary cần được bật sau khi cập nhật registry.
- Các nút Chi tiết, So sánh, Tạm dừng và đổi khoảng chỉ thay trạng thái xem của dashboard.
- Chạm tab nhóm → chọn thiết bị trong nhóm → cập nhật chi tiết. Chọn So sánh → lọc nhóm và chuyển trang thiết bị. Chạm icon phóng to → xem cùng dữ liệu trong modal.

## 8. Trình tự thực hiện sau khi duyệt

1. Tạo mô hình dữ liệu và bộ mô phỏng có seed, các phép tính tổng và hiệu suất.
2. Làm trang Một máy và bộ thẻ/đồng hồ dùng chung.
3. Làm chế độ So sánh có lọc/phân trang, thẻ Nồi hơi, la bàn/lõi đường chân trời, lịch sử 7/30 ngày và tooltip cảm ứng.
4. Đăng ký sidebar, route và phân quyền, gồm cấu hình Admin.
5. Hoàn thiện VI/EN, sáng/tối và responsive ngang/dọc.
6. Kiểm thử mô phỏng, tương tác trên trình duyệt và bản build.

## 9. Tiêu chí nghiệm thu

### Bố cục và tương tác

- Có mục Tổng quan máy riêng, truy cập được theo đúng quyền.
- Engine Detail đủ ba cột và bốn thẻ chính theo ảnh. Ba tab có đủ Máy chính, Máy phụ, Nồi hơi.
- Dual Engine Detail có hai thẻ đồng hồ, lọc và phân trang. Kiểm tra trang cuối lẻ một thiết bị.
- Có vòng phương hướng, lõi đường chân trời và bốn góc thông số trong thẻ la bàn.
- Mỗi nhóm có đồng hồ/trường phù hợp. Combo thời gian riêng của KPI và biểu đồ hoạt động đúng phạm vi.
- Kiểm tra 1.920 × 1.080, 1.280 × 720, 1.080 × 1.920 và 864 × 1.536 px.
- Icon, nút, combo, tab và tooltip dùng được bằng thao tác chạm.
- Đồng hồ và chú giải rõ ở sáng/tối, giá trị không chồng chữ.
- Phóng to/đóng thẻ, chuyển máy và đổi khoảng giữ giao diện ổn định.

### Số liệu và hiệu năng

- Số tự cập nhật mỗi 3 giây, cùng snapshot trên toàn trang.
- Kiểm tra chênh lệch cấp/hồi, SFOC, công suất/tải, tổng nhiên liệu và tỷ số theo NM bằng dữ liệu cố định.
- Kiểm tra máy dừng, tốc độ tàu bằng 0, chuyển ngày tàu, đổi khoảng, tải lại và tab nền.
- Tạm dừng/tiếp tục đúng trạng thái. Chuyển trang nhiều lần vẫn chỉ có một timer hoạt động khi mở dashboard.
- Chạy liên tục tối thiểu 15 phút, số điểm biểu đồ nằm trong giới hạn và bộ nhớ ổn định.
- Build thành công. Các phép tính mô phỏng quan trọng có kiểm thử tự động để bắt sai đơn vị và sai tích lũy.

## 10. Những lựa chọn đề xuất để duyệt cùng bản này

| Hạng mục | Phương án trong wireframe |
| --- | --- |
| Tên hiển thị | Tổng quan máy / Engine Summary |
| Vị trí | Mục riêng ngay sau Bảng điều khiển trên sidebar |
| Danh sách | Một máy chính, một máy phụ và một nồi hơi, chia ba tab như ảnh |
| Nhịp cập nhật | 3 giây, chuyển động mượt |
| Khoảng phân tích | Hôm nay, 7 ngày, 30 ngày, combo riêng tại thẻ biểu đồ và KPI |
| Nguồn | Toàn bộ thông số và lịch sử giả lập, tự cập nhật |
| KPI | Thẻ năm dòng ở cột phải, nhiên liệu/CO₂ theo thiết bị đang chọn và quãng đường của tàu |
| So sánh | Hai thẻ mỗi trang, combo lọc nhóm và nút trước/sau như ảnh |
| Quyền | Quyền Engine Summary riêng, tiếp tục quy tắc hai dashboard hiện tại |

Người dùng đã yêu cầu triển khai và bỏ nhãn nguồn dữ liệu trên giao diện.

## 11. Kết quả triển khai local

- Đã có trang `/engine-summary`, mục sidebar và quyền riêng cho chức danh/Admin.
- Đã làm ba nhóm thiết bị, đồng hồ lớn/nhỏ, hai biểu đồ, KPI, la bàn và màn so sánh có lọc/phân trang.
- Có VI/EN, sáng/tối, tạm dừng/tiếp tục, giữ số liệu khi chạm biểu đồ và phóng to thẻ.
- Thông số dựng từ thời gian, cập nhật mỗi 3 giây. Đồng hồ của bộ dữ liệu đặt UTC+07, tương ứng Asia/Ho_Chi_Minh.
- 11 kiểm thử Engine Summary và 57 kiểm thử phiên đăng nhập/phân quyền hiện có đều đạt. Bài cập nhật liên tục chạy trên chuỗi thời gian tương đương 15 phút.
- Build frontend và backend thành công. Công cụ build vẫn báo các cảnh báo phụ thuộc/cỡ bundle và cảnh báo EF có sẵn của dự án.
- Kiểm tra giao diện bằng component thực trên trang thử local tại 1.920 × 1.080, 1.280 × 720, 1.080 × 1.920 và 864 × 1.536 px. Việc kiểm tra trên phần cứng cảm ứng thực tế cần thực hiện sau khi đưa bản mới lên thiết bị.
- Trang thử local và timer thử nghiệm đã được dọn sau kiểm tra. Thay đổi đang ở workspace, chờ yêu cầu push/deploy.

## 12. Bổ sung danh sách tín hiệu buồng lái

Đối chiếu sheet Sheet2, vùng B4:G32 của file người dùng cung cấp `tín hiệu buồng lái-Excel.xlsx`. Thêm khu vực Tín hiệu vận hành ở dưới dashboard, truy cập nhanh bằng nút trên thanh công cụ.

| Tab | Tín hiệu hiển thị |
| --- | --- |
| Hàng hải & điều khiển | rudder, propRpm, lat, lon, windSpeed, windDir, compass, speedLog, roll, depth, cog, sog, rot, currentSpeed, currentDir |
| Tình trạng máy chính | mainRpm, coolTemp, luboPress, luboTemp, startAirPress, fuelRack và exhaustTemp cho từng xi lanh |
| Nhiên liệu toàn tàu | fuelTotal, fuelMain, fuelAux, fuelHourly, fuelDaily và biểu đồ 24 giờ chia máy chính/máy đèn/nồi hơi |

- Bộ mô phỏng có đủ 27 khóa trong file. Tách riêng kênh tốc độ máy chính và tốc độ chân vịt. Đồng hồ trục được ghi rõ là Tốc độ chân vịt.
- Lấy mẫu theo nhóm electric_data 1 giây, engine_data 3 giây, bridge_data 5 giây. Timer giao diện chạy 1 giây, từng nhóm giữ giá trị đến kỳ lấy mẫu của mình.
- Lưu lượng nhiên liệu dùng t/h, tiêu hao theo giờ/ngày dùng t. Tổng toàn tàu hiện gồm ME1 + AE1 + BLR1, có ghi phạm vi trên giao diện.
- Biểu đồ đủ 24 mốc giờ theo ngày tàu UTC+07. Giờ hiện tại đang tích lũy, các giờ tương lai để trống. Tổng ngày bằng tổng các cột đã phát sinh.
- Các thẻ tự chia 5/3/2 cột theo bề rộng, nhóm máy chính chia 3/2 cột. Có số góc nghiêng bên cạnh biểu diễn đường chân trời.
- Các giả định cấu hình demo gồm 6 xi lanh, áp suất bar, nhiệt độ °C, vị trí thanh răng theo %, truyền động trực tiếp với RPM máy/chân vịt tỷ số 1:1. File chưa chỉ rõ số xi lanh, thang đo thanh răng và tỷ số truyền.
- Đây là phần dữ liệu giả tự thay đổi trong dashboard. Việc nhận dữ liệu từ InfluxDB cần nguồn kết nối và ánh xạ kênh thực tế ở bước tích hợp.


## Điều chỉnh cách trình bày tín hiệu ngày 09/11/2026

- Tín hiệu hàng hải được tích hợp vào la bàn AOMP, gồm chân trời nghiêng, chỉ báo bánh lái, ROT, tốc độ so với nước và tọa độ.
- Tốc độ máy chính và tốc độ chân vịt có đồng hồ riêng bên cạnh công suất trục.
- Cụm nhiên liệu cho chuyển giữa thiết bị đang chọn và toàn tàu. Toàn tàu có sơ đồ dòng nhiên liệu ME/AE/nồi hơi, đồng hồ tổng và biểu đồ tiêu hao từng giờ. KPI chuyển cùng phạm vi và chỉ tính quãng đường tàu một lần.
- Nhiệt độ nước làm mát, áp suất/nhiệt độ dầu và áp suất khí khởi động có đồng hồ kim. Khí xả được biểu diễn bằng nhiệt kế từng xi lanh trên sơ đồ máy. Vị trí thanh răng dùng chỉ báo tuyến tính.
- Bỏ phần các tab thẻ số liệu tín hiệu rời. Sơ đồ có phóng to, giữ màu giao diện hệ thống và hỗ trợ Việt/Anh.
- Cấu hình trình diễn tiếp tục dùng sáu xi lanh và truyền động trực tiếp 1:1. Sơ đồ là hình minh họa bố trí tín hiệu, chưa phản ánh sơ đồ đường ống thực tế của tàu.


### Thu gọn dashboard theo phản hồi màn hình

- Giữ ba tab thiết bị, bỏ thanh tiêu đề phụ, chế độ so sánh, nút tín hiệu và nút tạm dừng. Dữ liệu tiếp tục cập nhật tự động.
- Cụm tình trạng máy chính nằm trong nội dung tab Máy chính. Máy phụ và nồi hơi không hiển thị cụm này.
- Bốn giá trị nhiệt độ/áp suất có tên, số và đơn vị trực tiếp phía trên sơ đồ. Bỏ các đường màu trang trí ở chân sơ đồ.
- Dashboard lấy chiều cao vùng còn lại sau header ứng dụng. Màn hình ngang dùng ba cột, màn hình dọc chuyển KPI và hàng hải xuống hàng riêng. Màn hình nhỏ cho cuộn để giữ khả năng đọc và thao tác.
