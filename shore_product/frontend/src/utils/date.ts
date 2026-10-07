/**
 * Ngày kiểu Việt Nam, luôn đủ 2 chữ số: 02/07/1980 (toLocaleDateString('vi-VN') ra "2/7/1980",
 * dễ đọc nhầm ngày/tháng). Chuỗi yyyy-mm-dd được đọc thẳng, không qua múi giờ, để không lệch
 * một ngày. Trống hoặc sai trả về chuỗi rỗng.
 */
export const formatDateVi = (value?: string | null): string => {
  if (!value) return '';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

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
