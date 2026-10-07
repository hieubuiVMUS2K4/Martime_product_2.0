import { toast } from 'sonner';

interface FormTL1501Props {
  formValues: Record<string, any>;
  onFieldChange: (fieldId: string, val: any) => void;
  recordStatus: string | null;
}

export function FormTL1501({ formValues, onFieldChange, recordStatus }: FormTL1501Props) {
  const handleFormFieldChange = onFieldChange;

  return (
    <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-6 shadow-md rounded-xl font-sans text-slate-800 dark:text-slate-200 text-xs">
      {/* Paper-like Header Table */}
      <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
        {/* Logo Box */}
        <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3">
          <div className="w-10 h-10 rounded-full border-2 border-accent flex items-center justify-center mb-1 text-accent text-base font-bold">⚓</div>
          <span className="text-[9px] font-extrabold tracking-tight leading-tight text-primary dark:text-blue-300 uppercase">HP SHIPPING</span>
          <span className="text-[7px] text-slate-500 font-medium">Hòa Phát Sea Transport</span>
        </div>
        {/* Document Title Box */}
        <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3 bg-slate-50/30 dark:bg-slate-900/30">
          <h3 className="font-extrabold text-[11px] leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
            KẾ HOẠCH NHẬN NHIÊN LIỆU
          </h3>
          <div className="w-16 h-0.5 bg-accent my-1"></div>
          <span className="italic text-[9px] text-slate-500 font-semibold tracking-wide uppercase leading-tight">
            BUNKERING PLAN
          </span>
        </div>
        {/* Document Meta Box */}
        <div className="col-span-3 flex flex-col justify-center p-3 text-left text-[9px] space-y-1 bg-slate-50/10">
          <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-accent dark:text-blue-400 font-bold">TL-15-01</span></div>
          <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
          <div><strong>Lần sửa đổi:</strong> <span className="font-mono">0</span></div>
          <div><strong>Trang:</strong> <span className="font-mono">1 / 3</span></div>
        </div>
      </div>

      {/* Metadata Inputs Row */}
      <div className="grid grid-cols-3 gap-4 border-x border-b border-slate-300 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-xs">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tàu / Vessel <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={formValues['vessel'] || ''}
            onChange={(e) => handleFormFieldChange('vessel', e.target.value)}
            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vị trí / Location <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={formValues['location'] || ''}
            onChange={(e) => handleFormFieldChange('location', e.target.value)}
            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Xà lan/Cảng / Supply Barge/Terminal <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={formValues['supplyBarge'] || ''}
            onChange={(e) => handleFormFieldChange('supplyBarge', e.target.value)}
            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ngày / Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={formValues['bunkerDate'] || ''}
            onChange={(e) => handleFormFieldChange('bunkerDate', e.target.value)}
            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-mono font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mớn nước mũi / Fore Draft</label>
          <input
            type="text"
            value={formValues['foreDraft'] || ''}
            onChange={(e) => handleFormFieldChange('foreDraft', e.target.value)}
            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mớn nước lái / Aft Draft</label>
          <input
            type="text"
            value={formValues['aftDraft'] || ''}
            onChange={(e) => handleFormFieldChange('aftDraft', e.target.value)}
            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
          />
        </div>
      </div>

      {/* Section 1: Product to be Handled */}
      <div className="mt-6">
        <h4 className="font-extrabold text-[11px] uppercase text-primary dark:text-blue-400 mb-2 border-b border-accent/30 dark:border-blue-800 pb-1">
          1. Loại nhiên liệu nhận / Product to be Handled
        </h4>
        <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-bold text-[10px] border-b border-slate-300 dark:border-slate-700 text-center">
                <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[40px]">STT</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Chủng loại / Grade</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Tỷ trọng / Density</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Lượng nhận / Stemmed Qty (Mts)</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Lượng có sẵn / Qty onboard (Mts)</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Thời gian dự kiến / Expected Duration</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Lượng dự kiến hoàn thành / ROB on completion</th>
                {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px]">Xóa</th>}
              </tr>
            </thead>
            <tbody>
              {(formValues['products'] || []).map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.grade || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['products']];
                        newArr[idx] = { ...newArr[idx], grade: e.target.value };
                        handleFormFieldChange('products', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.density || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['products']];
                        newArr[idx] = { ...newArr[idx], density: e.target.value };
                        handleFormFieldChange('products', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.stemmedQty || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['products']];
                        newArr[idx] = { ...newArr[idx], stemmedQty: e.target.value };
                        handleFormFieldChange('products', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.qtyOnboard || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['products']];
                        newArr[idx] = { ...newArr[idx], qtyOnboard: e.target.value };
                        handleFormFieldChange('products', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.duration || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['products']];
                        newArr[idx] = { ...newArr[idx], duration: e.target.value };
                        handleFormFieldChange('products', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.robCompletion || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['products']];
                        newArr[idx] = { ...newArr[idx], robCompletion: e.target.value };
                        handleFormFieldChange('products', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const newArr = [...formValues['products']];
                          newArr.splice(idx, 1);
                          handleFormFieldChange('products', newArr);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        Xóa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
          <button
            type="button"
            onClick={() => {
              const newArr = [...(formValues['products'] || []), { grade: '', density: '', stemmedQty: '', qtyOnboard: '', duration: '', robCompletion: '' }];
              handleFormFieldChange('products', newArr);
            }}
            className="mt-2 text-xs text-accent hover:text-primary font-bold flex items-center gap-1"
          >
            + Thêm dòng / Add row
          </button>
        )}
      </div>

      {/* Section 2: Personnel Responsibilities */}
      <div className="mt-6">
        <h4 className="font-extrabold text-[11px] uppercase text-primary dark:text-blue-400 mb-2 border-b border-accent/30 dark:border-blue-800 pb-1">
          2. Trách nhiệm của thành viên tham gia / Responsibilities of Personnel
        </h4>
        <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-bold text-[10px] border-b border-slate-300 dark:border-slate-700">
                <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[40px] text-center">STT</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[180px]">Chức danh / Rank</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[200px]">Họ tên / Name</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Nhiệm vụ cụ thể / Specific Duty</th>
                {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px] text-center">Xóa</th>}
              </tr>
            </thead>
            <tbody>
              {(formValues['personnel'] || []).map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.rank || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['personnel']];
                        newArr[idx] = { ...newArr[idx], rank: e.target.value };
                        handleFormFieldChange('personnel', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white font-semibold"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.name || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['personnel']];
                        newArr[idx] = { ...newArr[idx], name: e.target.value };
                        handleFormFieldChange('personnel', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.duty || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['personnel']];
                        newArr[idx] = { ...newArr[idx], duty: e.target.value };
                        handleFormFieldChange('personnel', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const newArr = [...formValues['personnel']];
                          newArr.splice(idx, 1);
                          handleFormFieldChange('personnel', newArr);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        Xóa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
          <button
            type="button"
            onClick={() => {
              const newArr = [...(formValues['personnel'] || []), { rank: '', name: '', duty: '' }];
              handleFormFieldChange('personnel', newArr);
            }}
            className="mt-2 text-xs text-accent hover:text-primary font-bold flex items-center gap-1"
          >
            + Thêm chức danh / Add personnel
          </button>
        )}
      </div>

      {/* Section 3 to 6: Checklists */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <h5 className="font-extrabold text-[10px] uppercase text-slate-600 dark:text-slate-400">
            3. Thiết bị đo & Độ chính xác / Equipment calibration & Accuracy
          </h5>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_pressure_gauge']}
                onChange={(e) => handleFormFieldChange('chk_pressure_gauge', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Đồng hồ đo áp suất đã hiệu chuẩn / Pressure gauge calibrated</span>
            </label>
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_sounding_tape']}
                onChange={(e) => handleFormFieldChange('chk_sounding_tape', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Thước đo dầu có dán tem hiệu chuẩn / Sounding tape calibrated</span>
            </label>
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_calibration_table']}
                onChange={(e) => handleFormFieldChange('chk_calibration_table', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Bảng hiệu chuẩn két sẵn sàng / Tank calibration table ready</span>
            </label>
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_computer']}
                onChange={(e) => handleFormFieldChange('chk_computer', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Máy tính tính toán đã kiểm tra / Calculation computer checked</span>
            </label>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <h5 className="font-extrabold text-[10px] uppercase text-slate-600 dark:text-slate-400">
            4. Báo động mức cao / High-level alarms
          </h5>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_reset_alarm']}
                onChange={(e) => handleFormFieldChange('chk_reset_alarm', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Đã reset và thử hoạt động tốt còi/đèn báo động mức cao (95% & 98%) / High level and overfill alarms tested and operational</span>
            </label>
          </div>

          <h5 className="font-extrabold text-[10px] uppercase text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
            5. Phương pháp đo nhiệt độ / Temperature measuring
          </h5>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_temp_sensor']}
                onChange={(e) => handleFormFieldChange('chk_temp_sensor', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Sử dụng cảm biến nhiệt độ tự động / Remote temperature sensor</span>
            </label>
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_thermometer']}
                onChange={(e) => handleFormFieldChange('chk_thermometer', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Đo bằng nhiệt kế cầm tay tại lỗ đo / Portable thermometer through sounding pipe</span>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
        <h5 className="font-extrabold text-[10px] uppercase text-slate-600 dark:text-slate-400">
          6. Kiểm soát hơi thoát và đo khí độc / Vapor control and gas check
        </h5>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_ventilate_sounding']}
                onChange={(e) => handleFormFieldChange('chk_ventilate_sounding', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Thông gió khu vực lỗ đo và hộp van xả / Ventilate sounding pipe and air vent boxes</span>
            </label>
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_h2s_benzene']}
                onChange={(e) => handleFormFieldChange('chk_h2s_benzene', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Kiểm tra hàm lượng khí H2S và Benzene trong không khí / Check H2S and Benzene concentration</span>
            </label>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_hc_detector']}
                onChange={(e) => handleFormFieldChange('chk_hc_detector', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Máy đo khí cháy HC hoạt động tốt / Hydrocarbon gas detector calibrated and ready</span>
            </label>
            <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formValues['chk_respiratory_ready']}
                onChange={(e) => handleFormFieldChange('chk_respiratory_ready', e.target.checked)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="rounded mt-0.5"
              />
              <span>Thiết bị hỗ trợ hô hấp sẵn sàng khẩn cấp / Emergency breathing apparatus standby</span>
            </label>
          </div>
        </div>
      </div>

      {/* Section 7: Distribution of Bunker Oil */}
      <div className="mt-6">
        <h4 className="font-extrabold text-[11px] uppercase text-primary dark:text-blue-400 mb-2 border-b border-accent/30 dark:border-blue-800 pb-1">
          7. Phân phối nhiên liệu và sơ đồ đường ống / Distribution of Bunker Oil and Pipe Line-up
        </h4>
        <div className="mb-3">
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Thiết lập sơ đồ van nhận nhiên liệu / Piping line-up description <span className="text-red-500">*</span></label>
          <textarea
            rows={2}
            value={formValues['line_up_piping'] || ''}
            onChange={(e) => handleFormFieldChange('line_up_piping', e.target.value)}
            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
            placeholder="Ví dụ: Mở van tổng nhận mạn phải, đóng van nhận mạn trái. Mở van vào két 1P, 2P..."
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
        </div>
        <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-bold text-[10px] border-b border-slate-300 dark:border-slate-700 text-center">
                <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[40px]">STT</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Két nhận / Receiving Tank</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Các van mở / Valves opened</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Các van đóng cách ly / Valves closed & isolated</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Két chứa tràn / Overflow Tank</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-700">Van két tràn mở / Overflow valve opened</th>
                {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px]">Xóa</th>}
              </tr>
            </thead>
            <tbody>
              {(formValues['distribution'] || []).map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.recvTank || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['distribution']];
                        newArr[idx] = { ...newArr[idx], recvTank: e.target.value };
                        handleFormFieldChange('distribution', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.valveOpened || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['distribution']];
                        newArr[idx] = { ...newArr[idx], valveOpened: e.target.value };
                        handleFormFieldChange('distribution', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.valveClosed || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['distribution']];
                        newArr[idx] = { ...newArr[idx], valveClosed: e.target.value };
                        handleFormFieldChange('distribution', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.overflowTank || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['distribution']];
                        newArr[idx] = { ...newArr[idx], overflowTank: e.target.value };
                        handleFormFieldChange('distribution', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.overflowValveOpened || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['distribution']];
                        newArr[idx] = { ...newArr[idx], overflowValveOpened: e.target.value };
                        handleFormFieldChange('distribution', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const newArr = [...formValues['distribution']];
                          newArr.splice(idx, 1);
                          handleFormFieldChange('distribution', newArr);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        Xóa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
          <button
            type="button"
            onClick={() => {
              const newArr = [...(formValues['distribution'] || []), { recvTank: '', valveOpened: '', valveClosed: '', overflowTank: '', overflowValveOpened: '' }];
              handleFormFieldChange('distribution', newArr);
            }}
            className="mt-2 text-xs text-accent hover:text-primary font-bold flex items-center gap-1"
          >
            + Thêm dòng phân phối / Add row
          </button>
        )}
      </div>

      {/* Section 8: Loading Rates */}
      <div className="mt-6">
        <h4 className="font-extrabold text-[11px] uppercase text-primary dark:text-blue-400 mb-2 border-b border-accent/30 dark:border-blue-800 pb-1">
          8. Lưu lượng nhận nhiên liệu dự kiến / Expected Loading Rates
        </h4>
        <div className="grid grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Lưu lượng ban đầu / Initial Rate (Mts/Hr) <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formValues['rate_initial'] || ''}
              onChange={(e) => handleFormFieldChange('rate_initial', e.target.value)}
              disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Lưu lượng tối đa / Max Rate (Mts/Hr) <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formValues['rate_max'] || ''}
              onChange={(e) => handleFormFieldChange('rate_max', e.target.value)}
              disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Lưu lượng khi sắp đầy / Topping-off Rate (Mts/Hr) <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formValues['rate_topping'] || ''}
              onChange={(e) => handleFormFieldChange('rate_topping', e.target.value)}
              disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 font-semibold"
            />
          </div>
        </div>
      </div>

      {/* Section 9: Gauging of Tanks */}
      <div className="mt-6">
        <h4 className="font-extrabold text-[11px] uppercase text-primary dark:text-blue-400 mb-2 border-b border-accent/30 dark:border-blue-800 pb-1">
          9. Bảng đo các két trước và sau nhận / Gauging of Tanks (Pre-bunkering & Final Expected)
        </h4>
        <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-bold text-[9px] border-b border-slate-300 dark:border-slate-700 text-center">
                <th rowSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[35px]">STT</th>
                <th rowSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[90px]">Két / Tank</th>
                <th colSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-700 border-b">Dung tích 85% / 85% Capacity</th>
                <th colSpan={3} className="p-1.5 border-r border-slate-300 dark:border-slate-700 border-b">Đo trước nhận / Pre-bunkering</th>
                <th colSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-700 border-b">Dự kiến sau nhận / Final Expected</th>
                <th colSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-700 border-b">Mức giảm tốc / Reduce Rate</th>
                <th rowSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[55px]">Thứ tự / Seq</th>
                {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th rowSpan={2} className="p-1.5 w-[45px]">Xóa</th>}
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[8px] border-b border-slate-300 dark:border-slate-700 text-center">
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Chiều cao / Sound (m)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Thể tích / Vol (m³)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Chiều cao / Sound (m)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Thể tích / Vol (m³)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Nhiệt độ / Temp (°C)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Chiều cao / Sound (m)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Thể tích / Vol (m³)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Chiều cao / Sound (m)</th>
                <th className="p-1 border-r border-slate-300 dark:border-slate-700">Thể tích / Vol (m³)</th>
              </tr>
            </thead>
            <tbody>
              {(formValues['gauging'] || []).map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-800 text-center">
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800 font-mono">{idx + 1}</td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.tank || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], tank: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-bold"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.capSound || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], capSound: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.capVol || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], capVol: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.preSound || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], preSound: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.preVol || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], preVol: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.preTemp || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], preTemp: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.postSound || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], postSound: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.postVol || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], postVol: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.reduceSound || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], reduceSound: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.reduceVol || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], reduceVol: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                    />
                  </td>
                  <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.seq || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['gauging']];
                        newArr[idx] = { ...newArr[idx], seq: e.target.value };
                        handleFormFieldChange('gauging', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                    />
                  </td>
                  {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                    <td className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const newArr = [...formValues['gauging']];
                          newArr.splice(idx, 1);
                          handleFormFieldChange('gauging', newArr);
                        }}
                        className="text-red-500 hover:text-red-700 text-[10px]"
                      >
                        Xóa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg text-center font-semibold text-[10px]">
          <div className="text-slate-500">Tổng dung tích 85% / Total 85% Cap: <span className="text-slate-800 dark:text-white font-extrabold font-mono ml-1">{formValues['gauging']?.reduce((sum: number, r: any) => sum + (parseFloat(r.capVol) || 0), 0).toFixed(2)} m³</span></div>
          <div className="text-slate-500">Tổng thực tế trước nhận / Total Pre-bunkering: <span className="text-slate-800 dark:text-white font-extrabold font-mono ml-1">{formValues['gauging']?.reduce((sum: number, r: any) => sum + (parseFloat(r.preVol) || 0), 0).toFixed(2)} m³</span></div>
          <div className="text-slate-500">Tổng dự kiến sau nhận / Total Final Expected: <span className="text-slate-800 dark:text-white font-extrabold font-mono ml-1">{formValues['gauging']?.reduce((sum: number, r: any) => sum + (parseFloat(r.postVol) || 0), 0).toFixed(2)} m³</span></div>
        </div>
        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
          <button
            type="button"
            onClick={() => {
              const newArr = [...(formValues['gauging'] || []), { tank: '', capSound: '', capVol: '', preSound: '', preVol: '', preTemp: '', postSound: '', postVol: '', reduceSound: '', reduceVol: '', seq: '' }];
              handleFormFieldChange('gauging', newArr);
            }}
            className="mt-2 text-xs text-accent hover:text-primary font-bold flex items-center gap-1"
          >
            + Thêm dòng đo két / Add tank row
          </button>
        )}
      </div>

      {/* Section 10 to 12: Communication, Emergency Contacts, Spill Equipment */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 font-sans">
          <h5 className="font-extrabold text-[10px] uppercase text-slate-600 dark:text-slate-400">
            10. Thông tin liên lạc & Ngắt khẩn cấp / Communications & Emergency Stop
          </h5>
          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Phương thức liên lạc / Communication method (e.g. VHF Ch. 12) <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formValues['comm_ship_barge'] || ''}
                onChange={(e) => handleFormFieldChange('comm_ship_barge', e.target.value)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Tín hiệu dừng khẩn cấp / Emergency stop signal <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formValues['comm_stop_signal'] || ''}
                onChange={(e) => handleFormFieldChange('comm_stop_signal', e.target.value)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 font-sans">
          <h5 className="font-extrabold text-[10px] uppercase text-slate-600 dark:text-slate-400">
            12. Thiết bị ứng phó sự cố dầu tràn / Oil Spill Equipment Location
          </h5>
          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Vị trí SOPEP Box trên tàu / Ship's SOPEP Box Location <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formValues['spill_loc1'] || ''}
                onChange={(e) => handleFormFieldChange('spill_loc1', e.target.value)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Vị trí thiết bị trên xà lan / Barge SOPEP Box Location</label>
              <input
                type="text"
                value={formValues['spill_loc2'] || ''}
                onChange={(e) => handleFormFieldChange('spill_loc2', e.target.value)}
                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 font-sans">
        <h5 className="font-extrabold text-[10px] uppercase text-slate-600 dark:text-slate-400">
          11. Các địa chỉ liên lạc khẩn cấp tại địa phương / Local Emergency Contacts
        </h5>
        <textarea
          rows={2}
          value={formValues['local_contacts'] || ''}
          onChange={(e) => handleFormFieldChange('local_contacts', e.target.value)}
          disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
          placeholder="Cảng vụ Hàng hải, Đại lý tàu, Trung tâm ứng phó sự cố tràn dầu địa phương..."
          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 text-xs font-semibold"
        />
      </div>

      {/* Section 13: Crew Sign-off */}
      <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
        <h4 className="font-extrabold text-[11px] uppercase text-primary dark:text-blue-400 mb-2">
          13. Xác nhận hiểu rõ kế hoạch / Crew Sign-off List
        </h4>
        <p className="text-[10px] italic text-slate-500 mb-2">
          Chúng tôi xác nhận đã hiểu rõ kế hoạch nhận nhiên liệu và các biện pháp ứng phó sự cố dầu tràn. / We confirm that we understand the bunkering plan and spill response actions.
        </p>
        <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-bold text-[10px] border-b border-slate-300 dark:border-slate-700">
                <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[40px] text-center">STT</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[180px]">Chức danh / Rank</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[200px]">Họ tên / Name</th>
                <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[180px] text-center">Chữ ký điện tử / Signature</th>
                {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px] text-center">Xóa</th>}
              </tr>
            </thead>
            <tbody>
              {(formValues['signatures_list'] || []).map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800 font-semibold">{row.rank}</td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={row.name || ''}
                      onChange={(e) => {
                        const newArr = [...formValues['signatures_list']];
                        newArr[idx] = { ...newArr[idx], name: e.target.value };
                        handleFormFieldChange('signatures_list', newArr);
                      }}
                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                      className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center">
                    {row.signed ? (
                      <span className="inline-block bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-bold border border-green-200 dark:border-green-900/50 px-3 py-1 rounded text-[10px] tracking-wide shadow-sm">
                        ✓ ĐÃ KÝ / SIGNED
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const newArr = [...formValues['signatures_list']];
                          newArr[idx] = { ...newArr[idx], signed: true };
                          handleFormFieldChange('signatures_list', newArr);
                          toast.success(`Đã xác nhận chữ ký cho chức danh ${row.rank}`);
                        }}
                        disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                        className="px-3 py-1 bg-accent hover:bg-primary-hover text-white rounded text-[10px] font-bold shadow-sm transition"
                      >
                        Ký tên / Sign
                      </button>
                    )}
                  </td>
                  {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const newArr = [...formValues['signatures_list']];
                          newArr.splice(idx, 1);
                          handleFormFieldChange('signatures_list', newArr);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        Xóa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
          <button
            type="button"
            onClick={() => {
              const newArr = [...(formValues['signatures_list'] || []), { rank: 'Thành viên bổ sung / Custom rank', name: '', signed: false }];
              handleFormFieldChange('signatures_list', newArr);
            }}
            className="mt-2 text-xs text-accent hover:text-primary font-bold flex items-center gap-1"
          >
            + Thêm hàng ký xác nhận / Add sign-off row
          </button>
        )}
      </div>
    </div>
  );
}
