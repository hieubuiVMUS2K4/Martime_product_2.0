import * as XLSX from 'xlsx';

export function downloadMaterialCatalogTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([['ItemCode', 'Name', 'CategoryCode', 'UnitPrice']]);
  sheet['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 22 }, { wch: 16 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Danh mục vật tư');
  const guide = XLSX.utils.aoa_to_sheet([
    ['Cột', 'Ý nghĩa'],
    ['ItemCode', 'Mã vật tư, bắt buộc. Mã đã có sẽ được cập nhật.'],
    ['Name', 'Tên vật tư, bắt buộc.'],
    ['CategoryCode', 'Mã loại vật tư đã khai báo trên bờ, bắt buộc.'],
    ['UnitPrice', 'Đơn giá không âm, có thể để trống.'],
    ['Giới hạn', 'Tối đa 1000 vật tư; nhập dữ liệu ở sheet đầu tiên.'],
  ]);
  guide['!cols'] = [{ wch: 20 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(book, guide, 'Hướng dẫn');
  XLSX.writeFile(book, 'Danh-muc-vat-tu.xlsx');
}
