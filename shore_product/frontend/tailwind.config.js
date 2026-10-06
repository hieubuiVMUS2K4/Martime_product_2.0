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
        ink: {
          DEFAULT: token('text'),
          muted: token('text-secondary'),
          light: token('text-light'),
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      zIndex: {
        dropdown: '100',
        modal: '400',
        toast: '500',
      },
    },
  },
  plugins: [],
}
