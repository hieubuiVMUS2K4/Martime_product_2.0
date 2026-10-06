/** Ngày kiểu Việt Nam (dd/mm/yyyy); trống trả về chuỗi rỗng. */
export const formatDateVi = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('vi-VN') : '';

/**
 * Đọc ngày từ một ô Excel đã chuyển thành chữ, trả về yyyy-mm-dd (rỗng nếu không đọc được).
 * Nhận: số ngày kiểu Excel (45123), dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd.
 */
export const parseImportDate = (value: string): string => {
  const v = value.trim();
  if (!v) return '';
  if (/^\d{4,6}(\.\d+)?$/.test(v)) {
    const d = new Date(Math.round((Number(v) - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return '';
};
