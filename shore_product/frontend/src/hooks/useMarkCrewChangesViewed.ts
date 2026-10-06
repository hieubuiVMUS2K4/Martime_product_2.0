import { useState } from 'react';
import { toast } from 'sonner';
import { crewApi } from '../services/crew.service';

/**
 * Đánh dấu "đã xem" thay đổi từ tàu cho nhiều thuyền viên một lúc, dùng ở bảng thuyền viên
 * của công ty và của chi tiết tàu. Cách xem từng hồ sơ rồi bấm "✓ Đã xem" vẫn giữ nguyên;
 * đây là lối tắt khi có quá nhiều người cần xác nhận.
 *
 * `onMarked` nhận danh sách id đã đánh dấu thành công để trang cập nhật bảng tại chỗ,
 * không phải tải lại cả danh sách.
 */
export function useMarkCrewChangesViewed(onMarked: (ids: string[]) => void) {
  const [marking, setMarking] = useState(false);

  const markViewed = async (ids: string[]) => {
    if (ids.length === 0) return;
    setMarking(true);
    const results = await Promise.allSettled(ids.map(id => crewApi.markChangesViewed(id)));
    setMarking(false);
    const done = ids.filter((_, i) => results[i].status === 'fulfilled');
    const failed = ids.length - done.length;
    if (done.length > 0) {
      onMarked(done);
      toast.success(`Đã đánh dấu đã xem ${done.length} thuyền viên`, {
        description: failed > 0 ? `${failed} người chưa đánh dấu được, hãy thử lại` : undefined,
      });
    } else {
      toast.error('Không đánh dấu được, vui lòng thử lại');
    }
  };

  return { markViewed, marking };
}
