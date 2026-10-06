import React, { useState, useMemo } from 'react';
import { Button, Input, Select, Modal, StatusBadge } from '../../components/common';
import { useToast } from '../../components/common/Toast';
import { useConfirmDialog } from '../../components/common/ConfirmDialog';
import type { WorkPlan, WorkFilter, WorkStatus } from '../../types/work.types';
import './WorkAssignmentPage.css';

// Mock data giống giao diện trong ảnh
const mockWorkPlans: WorkPlan[] = [
  {
    id: '1',
    stt: 1,
    createdDate: '26/04/2020',
    title: 'Kiểm tra tầng cường xạ thuật tàu',
    planType: 'Kế hoạch kiểm tra xỷ thuật tàu của Công ty',
    startDate: '01/06/2020',
    endDate: '31/12/2020',
    status: 'approved',
    priority: 'high',
  },
  {
    id: '2',
    stt: 2,
    createdDate: '26/04/2020',
    title: 'Kiểm tra định kỳ của P. KCS',
    planType: 'Kế hoạch kiểm tra xỷ thuật tàu của Công ty',
    startDate: '01/06/2020',
    endDate: '01/06/2021',
    status: 'pending',
    priority: 'medium',
  },
  {
    id: '3',
    stt: 3,
    createdDate: '14/04/2020',
    title: 'Kiểm tra định kỳ của P. KCS',
    planType: 'Kế hoạch kiểm tra xỷ thuật tàu của Công ty',
    startDate: '15/04/2020',
    endDate: '31/12/2020',
    status: 'completed',
    priority: 'low',
  },
  {
    id: '4',
    stt: 4,
    createdDate: '29/03/2020',
    title: 'Kế hoạch điểm tâp công ty và tàu',
    planType: 'Kế hoạch phối hợp điểm tâp khẩn cấp công ty và tàu',
    startDate: '01/04/2020',
    endDate: '30/06/2020',
    status: 'approved',
    priority: 'high',
  },
  {
    id: '5',
    stt: 5,
    createdDate: '01/03/2020',
    title: 'Thực tập tàu PIONEER',
    planType: 'Kế hoạch thực tập của tàu',
    startDate: '01/03/2020',
    endDate: '31/03/2020',
    status: 'overdue',
    priority: 'high',
  },
  {
    id: '6',
    stt: 6,
    createdDate: '31/12/2019',
    title: 'Kế hoạch soát xét hệ thống quản lý năm 2020',
    planType: 'Kế hoạch họp soát xét hệ thống quản lý',
    startDate: '01/01/2020',
    endDate: '31/12/2020',
    status: 'approved',
    priority: 'medium',
  },
  {
    id: '7',
    stt: 7,
    createdDate: '31/12/2019',
    title: 'Kế hoạch đánh giá nội bộ năm 2020',
    planType: 'Kế hoạch đánh giá nội bộ',
    startDate: '01/01/2020',
    endDate: '31/12/2020',
    status: 'approved',
    priority: 'medium',
  },
  {
    id: '8',
    stt: 8,
    createdDate: '01/12/2019',
    title: 'Plan 2020',
    planType: 'Kế hoạch đào tạo',
    startDate: '01/01/2020',
    endDate: '31/12/2020',
    status: 'approved',
    priority: 'low',
  },
  {
    id: '9',
    stt: 9,
    createdDate: '30/11/2019',
    title: 'Thực tập tàu PIONEER',
    planType: 'Kế hoạch thực tập của tàu',
    startDate: '01/11/2019',
    endDate: '31/12/2019',
    status: 'completed',
    priority: 'medium',
  },
  {
    id: '10',
    stt: 10,
    createdDate: '03/11/2019',
    title: 'Kiểm tra kỹ thuật tàu',
    planType: 'Kế hoạch kiểm tra xỷ thuật tàu của Công ty',
    startDate: '03/11/2019',
    endDate: '03/11/2019',
    status: 'overdue',
    priority: 'high',
  },
  {
    id: '11',
    stt: 11,
    createdDate: '30/10/2019',
    title: 'Kiểm tra kỹ thuật tàu sao sáng cẩm lập',
    planType: 'Kế hoạch kiểm tra xỷ thuật tàu của Công ty',
    startDate: '30/10/2019',
    endDate: '31/12/2020',
    status: 'approved',
    priority: 'medium',
  },
  {
    id: '12',
    stt: 12,
    createdDate: '27/10/2019',
    title: 'Kiểm tra kỹ thuật tàu',
    planType: 'Kế hoạch kiểm tra xỷ thuật tàu của Công ty',
    startDate: '27/10/2019',
    endDate: '31/12/2019',
    status: 'completed',
    priority: 'low',
  },
];

export const WorkAssignmentPage: React.FC = () => {
  const [workPlans, setWorkPlans] = useState<WorkPlan[]>(mockWorkPlans);
  const toast = useToast();
  const { confirm } = useConfirmDialog();
  const [filters, setFilters] = useState<WorkFilter>({
    search: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkPlan | null>(null);
  const [formData, setFormData] = useState<Partial<WorkPlan>>({});

  // Filter logic
  const filteredPlans = useMemo(() => {
    return workPlans.filter((plan) => {
      const matchSearch =
        !filters.search ||
        plan.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        plan.planType.toLowerCase().includes(filters.search.toLowerCase());

      const matchStatus = !filters.status || plan.status === filters.status;

      return matchSearch && matchStatus;
    });
  }, [workPlans, filters]);

  const handleAddNew = () => {
    setFormData({
      title: '',
      planType: '',
      startDate: '',
      endDate: '',
      status: 'pending',
      priority: 'medium',
    });
    setSelectedPlan(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (plan: WorkPlan) => {
    setFormData(plan);
    setSelectedPlan(plan);
    setIsFormModalOpen(true);
  };

  const handleView = (plan: WorkPlan) => {
    setSelectedPlan(plan);
    setIsDetailModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const result = await confirm({
      title: 'Xóa kế hoạch',
      message: 'Bạn có chắc chắn muốn xóa kế hoạch này?',
      variant: 'danger',
      confirmLabel: 'Xóa',
    });
    if (result.confirmed) {
      setWorkPlans(workPlans.filter((p) => p.id !== id));
      toast.success('Đã xóa thành công!');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlan) {
      // Update
      setWorkPlans(
        workPlans.map((p) =>
          p.id === selectedPlan.id ? { ...p, ...formData } as WorkPlan : p
        )
      );
      toast.success('Đã cập nhật thành công!');
    } else {
      // Add new
      const newPlan: WorkPlan = {
        id: Date.now().toString(),
        stt: workPlans.length + 1,
        createdDate: new Date().toLocaleDateString('vi-VN'),
        ...(formData as Omit<WorkPlan, 'id' | 'stt' | 'createdDate'>),
      };
      setWorkPlans([newPlan, ...workPlans]);
      toast.success('Đã thêm mới thành công!');
    }
    setIsFormModalOpen(false);
  };

  const statusOptions = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'in-progress', label: 'Đang thực hiện' },
    { value: 'completed', label: 'Đã hoàn thành' },
    { value: 'overdue', label: 'Quá hạn' },
  ];

  return (
    <div className="work-assignment-page">
      <div className="page-header">
        <h1>Danh sách Kế hoạch</h1>
        <p>Quản lý kế hoạch và phân công công việc</p>
      </div>

      {/* Filters */}
      <div className="filters-toolbar">
        <div className="filters-left">
          <Input
            type="text"
            placeholder="Tìm kiếm theo nội dung, loại kế hoạch..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <Select
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value as WorkStatus | '' })
            }
            options={statusOptions}
          />
        </div>
        <div className="filters-right">
          <Button variant="primary" onClick={handleAddNew}>
            + Thêm kế hoạch mới
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="work-table">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>STT</th>
              <th style={{ width: '120px' }}>Ngày lập</th>
              <th style={{ minWidth: '200px' }}>Nội dung</th>
              <th style={{ minWidth: '200px' }}>Loại kế hoạch</th>
              <th style={{ width: '120px' }}>Thời gian bắt đầu</th>
              <th style={{ width: '140px' }}>Thời gian yêu cầu hoàn thành</th>
              <th style={{ width: '130px' }}>Status</th>
              <th style={{ width: '150px' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlans.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              filteredPlans.map((plan) => (
                <tr key={plan.id}>
                  <td className="text-center">{plan.stt}</td>
                  <td>{plan.createdDate}</td>
                  <td>{plan.title}</td>
                  <td>{plan.planType}</td>
                  <td>{plan.startDate}</td>
                  <td>{plan.endDate}</td>
                  <td>
                    <StatusBadge status={plan.status} />
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Button size="sm" onClick={() => handleView(plan)}>
                        Xem
                      </Button>
                      <Button size="sm" onClick={() => handleEdit(plan)}>
                        Sửa
                      </Button>
                      <Button size="sm" onClick={() => handleDelete(plan.id)}>
                        Xóa
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={selectedPlan ? 'Chỉnh sửa kế hoạch' : 'Thêm kế hoạch mới'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Nội dung"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
            fullWidth
          />
          <Input
            label="Loại kế hoạch"
            value={formData.planType || ''}
            onChange={(e) => setFormData({ ...formData, planType: e.target.value })}
            required
            fullWidth
          />
          <div className="form-row">
            <Input
              label="Ngày bắt đầu"
              type="date"
              value={formData.startDate || ''}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
              fullWidth
            />
            <Input
              label="Ngày kết thúc"
              type="date"
              value={formData.endDate || ''}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              required
              fullWidth
            />
          </div>
          <div className="form-row">
            <Select
              label="Trạng thái"
              value={formData.status || 'pending'}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as WorkStatus })
              }
              options={statusOptions.filter((opt) => opt.value !== '')}
              fullWidth
            />
            <Select
              label="Độ ưu tiên"
              value={formData.priority || 'medium'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  priority: e.target.value as 'low' | 'medium' | 'high',
                })
              }
              options={[
                { value: 'low', label: 'Thấp' },
                { value: 'medium', label: 'Trung bình' },
                { value: 'high', label: 'Cao' },
              ]}
              fullWidth
            />
          </div>
          <div className="form-actions">
            <Button type="button" onClick={() => setIsFormModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary">
              {selectedPlan ? 'Cập nhật' : 'Thêm mới'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      {selectedPlan && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title="Chi tiết kế hoạch"
          size="md"
        >
          <div className="detail-view">
            <div className="detail-row">
              <label>STT:</label>
              <span>{selectedPlan.stt}</span>
            </div>
            <div className="detail-row">
              <label>Ngày lập:</label>
              <span>{selectedPlan.createdDate}</span>
            </div>
            <div className="detail-row">
              <label>Nội dung:</label>
              <span>{selectedPlan.title}</span>
            </div>
            <div className="detail-row">
              <label>Loại kế hoạch:</label>
              <span>{selectedPlan.planType}</span>
            </div>
            <div className="detail-row">
              <label>Thời gian bắt đầu:</label>
              <span>{selectedPlan.startDate}</span>
            </div>
            <div className="detail-row">
              <label>Thời gian hoàn thành:</label>
              <span>{selectedPlan.endDate}</span>
            </div>
            <div className="detail-row">
              <label>Trạng thái:</label>
              <span>
                <StatusBadge status={selectedPlan.status} />
              </span>
            </div>
            <div className="detail-row">
              <label>Độ ưu tiên:</label>
              <span>
                {selectedPlan.priority === 'high'
                  ? 'Cao'
                  : selectedPlan.priority === 'medium'
                  ? 'Trung bình'
                  : 'Thấp'}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
