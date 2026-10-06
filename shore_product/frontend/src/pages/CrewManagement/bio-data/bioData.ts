import { crewApi, logbookApi } from '../../../services/crew.service';
import { fetchProtectedMediaObjectUrl, isProtectedMediaPath } from '../../../services/protectedMedia';
import type { CrewCertificate, CrewDocument, CrewMember } from '../../../types/crew.types';
import { formatDateVi } from '../../../utils/date';
import { MARITAL_OPTIONS, RELATION_OPTIONS, departmentLabel, optionLabel, calcAge } from '../profile/crewProfileFields';

/*
  Dữ liệu của bản "Hồ sơ thuyền viên / Seafarer bio-data" để xuất ra PDF và Excel.

  Cả hai định dạng đọc từ CÙNG một cấu trúc này nên luôn ra cùng nội dung, cùng thứ tự;
  sửa nội dung ở đây là cả hai cùng đổi. Nhãn song ngữ (Việt / Anh) vì hồ sơ thường gửi
  cho chủ tàu, người thuê tàu nước ngoài.
*/

export * from './bioDataTypes';
import type { BioData, BioDocRow, BioField, BioServiceRow, DocStatus } from './bioDataTypes';

/** Còn ≤ 90 ngày coi là sắp hết hạn — cùng mốc với màn theo dõi chứng chỉ. */
const statusOf = (expiry?: string | null): DocStatus => {
  if (!expiry) return 'none';
  const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
  if (Number.isNaN(days)) return 'none';
  return days < 0 ? 'expired' : days <= 90 ? 'expiring' : 'valid';
};

const f = (vi: string, en: string, value: unknown): BioField => ({
  vi, en, value: value === undefined || value === null || value === '' ? '' : String(value),
});

const yesNo = (v?: boolean | null) => (v === undefined || v === null ? '' : v ? 'Có / Yes' : 'Không / No');

/** Số tháng giữa hai ngày, dạng "5 tháng 12 ngày". */
const duration = (from?: string | null, to?: string | null) => {
  if (!from) return '';
  const a = new Date(from);
  const b = to ? new Date(to) : new Date();
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return '';
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  let days = b.getDate() - a.getDate();
  if (days < 0) { months -= 1; days += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  return [months > 0 ? `${months} tháng` : '', days > 0 ? `${days} ngày` : ''].filter(Boolean).join(' ') || '0 ngày';
};

const docRow = (d: CrewDocument): BioDocRow => ({
  name: d.documentType ?? '',
  number: d.documentNumber ?? '',
  issuedBy: d.countryName ?? '',
  issueDate: formatDateVi(d.issueDate),
  expiryDate: formatDateVi(d.expiryDate),
  status: statusOf(d.expiryDate),
  remark: d.notes ?? '',
});

const certRow = (c: CrewCertificate): BioDocRow => ({
  name: c.certificateName || c.certificateCode || '',
  number: c.certificateNumber ?? '',
  issuedBy: c.issuingAuthority || c.countryName || '',
  issueDate: formatDateVi(c.issueDate),
  expiryDate: formatDateVi(c.expiryDate),
  status: statusOf(c.expiryDate),
  remark: c.notes ?? '',
});

/** Ảnh đại diện dạng data URL để nhúng vào file (ảnh cần đăng nhập mới tải được). */
async function loadPhoto(path?: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const url = isProtectedMediaPath(path) ? await fetchProtectedMediaObjectUrl(path) : path;
    const blob = await (await fetch(url)).blob();
    if (isProtectedMediaPath(path)) URL.revokeObjectURL(url);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // Không có ảnh thì để khung trống, không làm hỏng cả bản xuất.
  }
}

interface BuildInput {
  crew: CrewMember;
  rankName?: string;
  vesselName?: string;
  certificates: CrewCertificate[];
  preparedBy: string;
}

/**
 * Gom đủ dữ liệu cho bản hồ sơ. Tài liệu và kỳ phục vụ tải mới ngay lúc xuất, để không phụ
 * thuộc việc người dùng đã mở tab Tài liệu / Sổ nhật ký hay chưa.
 */
export async function buildBioData({ crew, rankName, vesselName, certificates, preparedBy }: BuildInput): Promise<BioData> {
  const [travel, seafarer, employment, health, logbook, photo] = await Promise.all([
    crewApi.getDocuments(crew.id, 'travel').catch(() => [] as CrewDocument[]),
    crewApi.getDocuments(crew.id, 'seafarer').catch(() => [] as CrewDocument[]),
    crewApi.getDocuments(crew.id, 'employment').catch(() => [] as CrewDocument[]),
    crewApi.getDocuments(crew.id, 'health').catch(() => [] as CrewDocument[]),
    logbookApi.getEntries(crew.id, { entryType: 'SEA_SERVICE' }).catch(() => []),
    loadPhoto(crew.avatarUrl),
  ]);

  const rank = crew.rankName || rankName || '';
  const vessel = crew.vesselName || vesselName || '';
  const age = calcAge(crew.dateOfBirth);

  const seaService: BioServiceRow[] = logbook
    .filter(e => e.entryType === 'SEA_SERVICE')
    .sort((a, b) => (b.signOnDate ?? '').localeCompare(a.signOnDate ?? ''))
    .map(e => ({
      vessel: e.vesselName ?? '',
      imo: e.imoNumber ?? '',
      flagType: [e.vesselFlag, e.vesselType].filter(Boolean).join(' · '),
      rank: e.rankAtTime ?? '',
      signOn: [formatDateVi(e.signOnDate), e.signOnPortName].filter(Boolean).join(' — '),
      signOff: e.signOffDate ? [formatDateVi(e.signOffDate), e.signOffPortName].filter(Boolean).join(' — ') : 'Đang trên tàu',
      duration: duration(e.signOnDate, e.signOffDate),
      remark: e.signOffReason ?? '',
    }));

  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  return {
    fileName: `Ho-so-thuyen-vien_${crew.crewId || crew.fullName}_${stamp}`,
    preparedBy,
    preparedAt: formatDateVi(today.toISOString()),
    crewCode: crew.crewId ?? '',
    fullName: crew.fullName ?? '',
    rank,
    vessel,
    photoDataUrl: photo,
    personal: [
      f('Họ và tên', 'Full name', crew.fullName),
      f('Ngày sinh', 'Date of birth', crew.dateOfBirth ? `${formatDateVi(crew.dateOfBirth)}${age !== null ? ` (${age} tuổi)` : ''}` : ''),
      f('Nơi sinh', 'Place of birth', crew.placeOfBirth),
      f('Quốc tịch', 'Nationality', crew.countryName),
      f('Số CMND/CCCD', 'ID number', crew.idCardNumber),
      f('Tình trạng hôn nhân', 'Marital status', optionLabel(MARITAL_OPTIONS, crew.maritalStatus)),
      f('Điện thoại', 'Phone', crew.phoneNumber),
      f('Email', 'Email', crew.emailAddress),
      f('Địa chỉ', 'Address', crew.address),
    ],
    employment: [
      f('Mã thuyền viên', 'Crew code', crew.crewId),
      f('Chức danh', 'Rank', rank),
      f('Bộ phận', 'Department', departmentLabel(crew.department)),
      f('Tàu hiện tại', 'Current vessel', vessel || (crew.isOnboard ? '' : 'Đang ở bờ')),
      f('Ngày gia nhập', 'Join date', formatDateVi(crew.joinDate)),
      f('Ngày lên tàu', 'Sign-on date', formatDateVi(crew.embarkDate)),
      f('Hết hạn hợp đồng', 'Contract end', formatDateVi(crew.contractEnd)),
      f('Số sổ thuyền viên', "Seaman's book", (crew as CrewMember & { seamanBookNumber?: string }).seamanBookNumber),
    ],
    physical: [
      f('Chiều cao', 'Height', crew.height ? `${crew.height} cm` : ''),
      f('Cân nặng', 'Weight', crew.weight ? `${crew.weight} kg` : ''),
      f('Nhóm máu', 'Blood group', crew.bloodGroup),
      f('Cỡ quần áo', 'Overall size', crew.clothingSize),
      f('Cỡ giày', 'Shoe size', crew.shoeSize),
      f('Cỡ bữa ăn', 'Catering size', crew.cateringSize),
      f('Hút thuốc', 'Smoker', yesNo(crew.isSmoker)),
      f('Đã tiêm COVID-19', 'COVID-19 vaccinated', yesNo(crew.isCovidVaccinated)),
    ],
    kin: [
      f('Họ và tên', 'Name', crew.nextOfKinName),
      f('Mối quan hệ', 'Relation', optionLabel(RELATION_OPTIONS, crew.nextOfKinRelation)),
      f('Điện thoại', 'Phone', crew.nextOfKinPhone),
      f('Địa chỉ', 'Address', crew.nextOfKinAddress),
    ],
    education: [
      f('Trường / cơ sở đào tạo', 'Institution', crew.educationInstitution),
      f('Chuyên ngành', 'Course', crew.educationCourse),
      f('Năm tốt nghiệp', 'Graduation year', crew.educationGraduationYear),
      f('Số năm học', 'Period', crew.educationPeriodYears ? `${crew.educationPeriodYears} năm` : ''),
    ],
    identityDocs: [...travel, ...seafarer, ...employment].map(docRow),
    certificates: certificates.map(certRow),
    healthDocs: health.map(docRow),
    seaService,
    notes: crew.notes ?? '',
  };
}
