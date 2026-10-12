import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Theme DUY NHẤT của app — "Navy hàng hải": cùng bảng màu với hệ thống bờ
/// (shore_product/frontend/src/styles/variables.css) để thuyền viên thấy web và app là một sản phẩm.
///
/// - Thanh trên, thanh điều hướng, nút chính: navy đậm.
/// - Nội dung: nền sáng, thẻ trắng viền mảnh, bo góc 8.
/// - Màu trạng thái dùng bản ĐẬM cho chữ/biểu tượng và bản NHẠT (`…Soft`) cho nền chip/khung.
///
/// Màn hình KHÔNG đặt màu cứng (`Colors.blue`…): dùng `MaritimeTheme.xxx` hoặc `Theme.of(context)`,
/// để đổi theme chỉ sửa ở file này.
class MaritimeTheme {
  MaritimeTheme._();

  // ── Navy (thương hiệu) ──────────────────────────────────────────
  static const Color primary = Color(0xFF0B2545);       // navy — thanh trên, nút chính
  static const Color primaryLight = Color(0xFF1B4C7E);  // navy sáng — điểm nhấn, liên kết
  static const Color primaryDark = Color(0xFF061629);
  static const Color primarySoft = Color(0xFFEEF2F7);   // nền nhạt của navy (hàng được chọn, tiêu đề nhóm)

  static const Color accent = Color(0xFF1B4C7E);
  static const Color accentLight = Color(0xFF3A6EA5);
  static const Color accentSoft = Color(0xFFDCE9F8);
  static const Color accentBorder = Color(0xFFB7CDE6);

  // ── Trạng thái (đậm cho chữ/biểu tượng, nhạt cho nền) ──────────
  static const Color success = Color(0xFF047857);
  static const Color successSoft = Color(0xFFD1FAE5);
  static const Color successBorder = Color(0xFF86EFAC);
  static const Color warning = Color(0xFFB45309);
  static const Color warningSoft = Color(0xFFFEF3C7);
  static const Color warningBorder = Color(0xFFFCD34D);
  static const Color error = Color(0xFFB91C1C);
  static const Color errorSoft = Color(0xFFFEE2E2);
  static const Color errorBorder = Color(0xFFFCA5A5);
  static const Color info = Color(0xFF0E7490);
  static const Color infoSoft = Color(0xFFCFFAFE);
  static const Color infoBorder = Color(0xFF67E8F9);

  /// Tên theo nghiệp vụ công việc (giữ để các màn hình đang dùng không phải đổi).
  static const Color completed = success;
  static const Color inProgress = warning;
  static const Color overdue = Color(0xFFC2410C);
  static const Color mandatory = error;
  static const Color critical = error;
  static const Color dueSoon = Color(0xFFD97706);
  static const Color pending = accent;

  // ── Nền, viền, chữ ──────────────────────────────────────────────
  static const Color background = Color(0xFFF5F7FA);    // nền màn hình
  static const Color surfaceLight = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFF1F5F9);       // nền khối phụ
  static const Color card = Colors.white;
  static const Color border = Color(0xFFD6DEE8);
  static const Color divider = Color(0xFFE5EAF1);

  static const Color textPrimary = Color(0xFF0A0D12);
  static const Color textSecondary = Color(0xFF27313F);
  static const Color textTertiary = Color(0xFF64748B);
  static const Color onPrimary = Colors.white;
  static const Color onPrimaryMuted = Color(0xB3FFFFFF); // chữ phụ trên nền navy

  // ── Ưu tiên ────────────────────────────────────────────────────
  static const Color priorityCritical = error;
  static const Color priorityHigh = Color(0xFFC2410C);
  static const Color priorityMedium = accent;
  static const Color priorityLow = textTertiary;

  static const double radius = 8;

  // ── Hỗ trợ ─────────────────────────────────────────────────────

  /// Màu theo trạng thái công việc.
  static Color getStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
      case 'APPROVED':
        return completed;
      case 'IN_PROGRESS':
      case 'STARTED':
        return inProgress;
      case 'OVERDUE':
        return overdue;
      case 'PENDING_APPROVAL':
        return dueSoon;
      case 'RECTIFY':
      case 'REJECTED':
        return error;
      case 'DUE':
      case 'SCHEDULED':
      default:
        return pending;
    }
  }

  /// Màu theo mức ưu tiên.
  static Color getPriorityColor(String priority) {
    switch (priority.toUpperCase()) {
      case 'CRITICAL':
        return priorityCritical;
      case 'HIGH':
        return priorityHigh;
      case 'MEDIUM':
      case 'NORMAL':
        return priorityMedium;
      case 'LOW':
      default:
        return priorityLow;
    }
  }

  /// Nền nhạt cho chip/khung theo trạng thái.
  static Color getStatusBackground(String status, {double opacity = 0.12}) =>
      getStatusColor(status).withValues(alpha: opacity);

  // ── ThemeData ──────────────────────────────────────────────────

  static ThemeData get lightTheme {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: primary,
      onPrimary: onPrimary,
      primaryContainer: primarySoft,
      onPrimaryContainer: primary,
      secondary: accent,
      onSecondary: Colors.white,
      secondaryContainer: accentSoft,
      onSecondaryContainer: primary,
      tertiary: info,
      onTertiary: Colors.white,
      error: error,
      onError: Colors.white,
      errorContainer: errorSoft,
      onErrorContainer: error,
      surface: card,
      onSurface: textPrimary,
      onSurfaceVariant: textSecondary,
      surfaceContainerLowest: Colors.white,
      surfaceContainerLow: surfaceLight,
      surfaceContainer: surface,
      surfaceContainerHigh: surface,
      surfaceContainerHighest: Color(0xFFE8EDF3),
      outline: border,
      outlineVariant: divider,
      shadow: Color(0x1A0B2545),
      inverseSurface: primary,
      onInverseSurface: Colors.white,
      surfaceTint: Colors.transparent,
    );

    final base = GoogleFonts.interTextTheme();
    final text = base.copyWith(
      headlineSmall: base.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: textPrimary),
      titleLarge: base.titleLarge?.copyWith(fontSize: 20, fontWeight: FontWeight.w700, color: textPrimary),
      titleMedium: base.titleMedium?.copyWith(fontSize: 16, fontWeight: FontWeight.w600, color: textPrimary),
      titleSmall: base.titleSmall?.copyWith(fontSize: 14, fontWeight: FontWeight.w600, color: textPrimary),
      bodyLarge: base.bodyLarge?.copyWith(fontSize: 16, color: textPrimary),
      bodyMedium: base.bodyMedium?.copyWith(fontSize: 15, color: textPrimary),
      // Chữ nhỏ nhất vẫn đọc được trên tàu (rung, ánh sáng yếu).
      bodySmall: base.bodySmall?.copyWith(fontSize: 14, color: textTertiary),
      labelLarge: base.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w600),
      labelMedium: base.labelMedium?.copyWith(fontSize: 14, fontWeight: FontWeight.w500),
      labelSmall: base.labelSmall?.copyWith(fontSize: 13, fontWeight: FontWeight.w500),
    ).apply(bodyColor: textPrimary, displayColor: textPrimary);

    final shape8 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius));
    OutlineInputBorder inputBorder(Color c, [double w = 1]) =>
        OutlineInputBorder(borderRadius: BorderRadius.circular(radius), borderSide: BorderSide(color: c, width: w));

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      textTheme: text,
      dividerColor: divider,
      splashFactory: InkRipple.splashFactory,

      appBarTheme: AppBarTheme(
        backgroundColor: primary,
        foregroundColor: onPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: onPrimary),
        iconTheme: const IconThemeData(color: onPrimary),
        actionsIconTheme: const IconThemeData(color: onPrimary),
        systemOverlayStyle: SystemUiOverlayStyle.light.copyWith(statusBarColor: primaryDark),
      ),

      tabBarTheme: TabBarThemeData(
        labelColor: onPrimary,
        unselectedLabelColor: onPrimaryMuted,
        indicatorColor: Colors.white,
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
        labelStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
        unselectedLabelStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500),
      ),

      // Thanh điều hướng dưới: navy như thanh trên.
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: primary,
        surfaceTintColor: Colors.transparent,
        indicatorColor: primaryLight,
        height: 68,
        iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(
              color: s.contains(WidgetState.selected) ? Colors.white : onPrimaryMuted)),
        labelTextStyle: WidgetStateProperty.resolveWith((s) => GoogleFonts.inter(
              fontSize: 13,
              fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
              color: s.contains(WidgetState.selected) ? Colors.white : onPrimaryMuted)),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: primary,
        selectedItemColor: Colors.white,
        unselectedItemColor: onPrimaryMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        selectedLabelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontSize: 13),
      ),
      drawerTheme: const DrawerThemeData(backgroundColor: Colors.white, surfaceTintColor: Colors.transparent),

      cardTheme: CardThemeData(
        color: card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 6),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: const BorderSide(color: border),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: textSecondary,
        textColor: textPrimary,
        contentPadding: EdgeInsets.symmetric(horizontal: 16),
      ),
      dividerTheme: const DividerThemeData(color: divider, thickness: 1, space: 1),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: inputBorder(border),
        enabledBorder: inputBorder(border),
        focusedBorder: inputBorder(primary, 1.6),
        errorBorder: inputBorder(error),
        focusedErrorBorder: inputBorder(error, 1.6),
        labelStyle: GoogleFonts.inter(fontSize: 15, color: textSecondary),
        floatingLabelStyle: GoogleFonts.inter(fontSize: 14, color: primary, fontWeight: FontWeight.w600),
        hintStyle: GoogleFonts.inter(fontSize: 15, color: textTertiary),
        helperStyle: GoogleFonts.inter(fontSize: 13, color: textTertiary),
        prefixIconColor: textTertiary,
        suffixIconColor: textTertiary,
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: onPrimary,
          disabledBackgroundColor: const Color(0xFFCBD5E1),
          elevation: 0,
          minimumSize: const Size(64, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: shape8,
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: onPrimary,
          minimumSize: const Size(64, 48),
          shape: shape8,
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primary,
          side: const BorderSide(color: primary),
          minimumSize: const Size(64, 48),
          shape: shape8,
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primaryLight,
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: textSecondary)),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: primary,
        foregroundColor: onPrimary,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),

      chipTheme: ChipThemeData(
        backgroundColor: primarySoft,
        selectedColor: accentSoft,
        side: const BorderSide(color: border),
        shape: shape8,
        labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: textSecondary),
        secondaryLabelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600, color: primary),
        checkmarkColor: primary,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        titleTextStyle: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w700, color: textPrimary),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: primary,
        contentTextStyle: GoogleFonts.inter(fontSize: 14, color: Colors.white),
        actionTextColor: accentSoft,
        behavior: SnackBarBehavior.floating,
        shape: shape8,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: primary, linearTrackColor: primarySoft),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primary : null),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primary : textTertiary),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : null),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primaryLight : null),
      ),
    );
  }
}
