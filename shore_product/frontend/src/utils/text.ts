/**
 * Bỏ dấu tiếng Việt và viết thường, để tìm "ha noi" vẫn ra "Hà Nội", "dang" ra "Đăng".
 */
export const foldVietnamese = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
