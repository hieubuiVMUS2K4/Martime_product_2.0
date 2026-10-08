/** @type {import('tailwindcss').Config} */

/*
  Màu của Tailwind lấy từ chính bộ token trong src/styles/variables.css, để trang viết
  bằng Tailwind và trang viết bằng CSS thuần ra cùng một màu. Đổi màu thì sửa token
  bên đó, không sửa ở đây.

  Token dạng kênh RGB (--rgb-*) để giữ được độ trong suốt kiểu `bg-primary/10`.
*/
const token = (name) => `rgb(var(--rgb-${name}) / <alpha-value>)`;

export default {
  /*
    Phân hệ bờ chỉ có giao diện sáng. Để mặc định 'media' thì máy đặt chế độ tối sẽ
    làm các trang Tailwind (PMS, Vật tư, SMS) tối đi một nửa trong khi các trang CSS
    thuần vẫn sáng. 'class' mà không bao giờ gắn lớp .dark nghĩa là tắt hẳn.
  */
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Chữ đậm hơn một bậc cho dễ đọc: semibold 600→700, bold 700→800 (Inter tải sẵn 400–800)
      fontWeight: { semibold: '700', bold: '800' },
      fontSize: {
        // Cỡ nhỏ nhất của app: 14px (mặc định Tailwind 12px). Đổi cỡ nhỏ nhất chỉ sửa ở đây.
        xs: ['0.875rem', { lineHeight: '1.25rem' }],
      },
      // Chỉ đổi MÀU CHỮ xám (không đổi viền/nền): đậm lên một bậc, chữ chính gần đen
      textColor: {
        gray: { 400: '#6b7280', 500: '#4b5563', 600: '#374151', 700: '#1f2937', 800: '#111827', 900: '#0a0a0a' },
        slate: { 400: '#64748b', 500: '#475569', 600: '#334155', 700: '#1e293b', 800: '#0f172a', 900: '#020617' },
      },
      colors: {
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          soft: token('primary-soft'),
        },
        accent: {
          DEFAULT: token('accent'),
          soft: token('accent-soft'),
        },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        surface: token('surface'),
        canvas: token('background'),
        line: token('border'),
        grid: { DEFAULT: token('grid'), strong: token('grid-strong') },
        ink: {
          DEFAULT: token('text'),
          muted: token('text-secondary'),
          light: token('text-light'),
        },
      },
      fontFamily: {
        // Mã/số dùng cùng font Inter cho đồng bộ; số thẳng cột nhờ tabular-nums (index.css)
        mono: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Thanh điều hướng trên cùng là z-[1100], menu thả xuống của nó z-[1200].
      // Hộp thoại và thông báo phải nằm TRÊN thanh điều hướng.
      zIndex: {
        dropdown: '100',
        modal: '1300',
        popover: '1350',
        toast: '1500',
      },
    },
  },
  plugins: [],
}
