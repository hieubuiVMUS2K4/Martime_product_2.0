/*
  Cấu hình các trường "Thông số tàu": tab con → nhóm → trường.
  Chế độ XEM và chế độ SỬA cùng đọc cấu hình này nên hai bên luôn khớp nhau.
  Khóa trường là tên camelCase do API GET /vessels/{id}/particulars trả về.

  Đồng bộ hai chiều: bờ sửa thì gửi các trường vừa đổi xuống tàu, tàu sửa thì gửi lên bờ.
*/

export type ParticularsTab =
  | 'basic-data' | 'dimensions' | 'class-flag-state' | 'machinery'
  | 'radio-comm' | 'tanks-cargo' | 'shipowner' | 'charterer' | 'insurance';

export type FieldKind = 'text' | 'email' | 'number' | 'date' | 'bool' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  kind?: FieldKind;
  unit?: string;
  options?: string[];
  /** Không sửa được (IMO là định danh tàu, gắn với gói kết nối). */
  readOnly?: boolean;
  required?: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  fields: FieldDef[];
}

export const VESSEL_TYPES = [
  'Bulk Carrier', 'Container Ship', 'Tanker', 'General Cargo',
  'RoRo', 'LNG Carrier', 'LPG Carrier', 'Passenger Ship', 'Tug', 'Other',
];

const m = (key: string, label: string): FieldDef => ({ key, label, kind: 'number', unit: 'm' });
const cbm = (key: string, label: string): FieldDef => ({ key, label, kind: 'number', unit: 'm³' });
const num = (key: string, label: string, unit?: string): FieldDef => ({ key, label, kind: 'number', unit });
const bool = (key: string, label: string): FieldDef => ({ key, label, kind: 'bool' });

/** Nhóm thông tin một tổ chức: tên, địa chỉ, liên lạc. `prefix` là tiền tố trường, vd. "shipowner". */
const org = (id: string, title: string, prefix: string, nameLabel = 'Tên công ty'): SectionDef => ({
  id, title,
  fields: [
    { key: `${prefix}Name`, label: nameLabel },
    { key: `${prefix}ContactPerson`, label: 'Người liên hệ' },
    { key: `${prefix}Street`, label: 'Địa chỉ' },
    { key: `${prefix}City`, label: 'Thành phố' },
    { key: `${prefix}Zip`, label: 'Mã bưu chính' },
    { key: `${prefix}Country`, label: 'Quốc gia' },
    { key: `${prefix}Phone`, label: 'Điện thoại' },
    { key: `${prefix}Fax`, label: 'Fax' },
    { key: `${prefix}Tlx`, label: 'Telex' },
    { key: `${prefix}Email`, label: 'Email', kind: 'email' },
  ],
});

/** Nhóm thông tin một người phụ trách (CSO, DPA, QI). */
const person = (id: string, title: string, prefix: string): SectionDef => ({
  id, title,
  fields: [
    { key: `${prefix}Title`, label: 'Danh xưng' },
    { key: `${prefix}LastName`, label: 'Họ' },
    { key: `${prefix}FirstName`, label: 'Tên' },
    { key: `${prefix}Phone24h`, label: 'Điện thoại 24/24' },
    { key: `${prefix}Fax`, label: 'Fax' },
    { key: `${prefix}Tlx`, label: 'Telex' },
    { key: `${prefix}Email`, label: 'Email', kind: 'email' },
    { key: `${prefix}Street`, label: 'Địa chỉ' },
    { key: `${prefix}City`, label: 'Thành phố' },
    { key: `${prefix}Zip`, label: 'Mã bưu chính' },
    { key: `${prefix}Country`, label: 'Quốc gia' },
  ],
});

export const PARTICULARS: Record<ParticularsTab, SectionDef[]> = {
  'basic-data': [
    {
      id: 'identity', title: 'Nhận dạng',
      fields: [
        { key: 'name', label: 'Tên tàu', required: true },
        { key: 'imo', label: 'Số IMO', readOnly: true },
        { key: 'callSign', label: 'Hô hiệu', required: true },
        { key: 'vesselType', label: 'Loại tàu', kind: 'select', options: VESSEL_TYPES },
        { key: 'flag', label: 'Quốc tịch (cờ)' },
        { key: 'portOfRegistry', label: 'Cảng đăng ký' },
        { key: 'officialNumber', label: 'Số đăng ký chính thức' },
        { key: 'mmsiNumber', label: 'Số MMSI' },
        { key: 'previousName', label: 'Tên cũ' },
        { key: 'previousFlag', label: 'Quốc tịch cũ' },
      ],
    },
    {
      id: 'build', title: 'Đóng tàu',
      fields: [
        { key: 'shipyardName', label: 'Nhà máy đóng tàu' },
        { key: 'shipyardCountry', label: 'Quốc gia đóng tàu' },
        { key: 'yardNo', label: 'Số hiệu đóng mới' },
        { key: 'keelLaidDate', label: 'Ngày đặt ky', kind: 'date' },
        { key: 'buildDate', label: 'Ngày đóng xong', kind: 'date' },
        num('yearBuilt', 'Năm đóng'),
        { key: 'dateOfRegistry', label: 'Ngày đăng ký', kind: 'date' },
      ],
    },
    {
      id: 'codes', title: 'Mã số công ty & kênh đào',
      fields: [
        { key: 'companyImoNumber', label: 'Số IMO công ty' },
        { key: 'ownerImoNumber', label: 'Số IMO chủ tàu' },
        { key: 'suezCanalIdNumber', label: 'Mã kênh đào Suez' },
        { key: 'panamaCanalIdNumber', label: 'Mã kênh đào Panama' },
        { key: 'vrpNumber', label: 'Số VRP' },
        { key: 'vrpType', label: 'Loại VRP' },
      ],
    },
    {
      id: 'operation', title: 'Khai thác & định biên',
      fields: [
        num('serviceSpeedKts', 'Tốc độ khai thác', 'hải lý/giờ'),
        num('mainEnginePowerKw', 'Công suất máy chính', 'kW'),
        num('fuelCapacityTons', 'Sức chứa nhiên liệu', 't'),
        num('fuelConsumptionTonsPerDay', 'Tiêu hao nhiên liệu', 't/ngày'),
        num('cruisingRangeNm', 'Tầm hoạt động', 'hải lý'),
        num('noOfCrewSafeManning', 'Định biên an toàn', 'người'),
        num('maxPersonsAllowedOB', 'Số người tối đa', 'người'),
        num('maxPassengersAllowedOB', 'Số hành khách tối đa', 'người'),
      ],
    },
  ],

  dimensions: [
    {
      id: 'main', title: 'Kích thước chính',
      fields: [
        m('loa', 'Chiều dài toàn bộ (LOA)'), m('lbp', 'Chiều dài giữa hai trụ (LBP)'),
        m('breadthMoulded', 'Chiều rộng'), m('depthMoulded', 'Chiều cao mạn'),
        m('draftMoulded', 'Mớn nước thiết kế'), m('draftScantling', 'Mớn nước tối đa'),
        m('draftFullBallast', 'Mớn nước khi dằn đầy'), m('hMaxAirdraft', 'Tĩnh không tối đa'),
        m('airdraftReductionMastFouled', 'Giảm tĩnh không khi hạ cột'), m('dDistance', 'Khoảng cách D'),
        m('bridgeToAft', 'Lầu lái đến đuôi'), m('bridgeToBow', 'Lầu lái đến mũi'),
        m('bowToBulbousBow', 'Mũi đến mũi quả lê'), m('parallelBodyBallast', 'Thân song song (dằn)'),
        m('parallelBodyLoaded', 'Thân song song (đầy hàng)'),
      ],
    },
    {
      id: 'tonnage', title: 'Dung tích & trọng tải',
      fields: [
        num('grossTonnage', 'Tổng dung tích (GT)'), num('deadWeight', 'Trọng tải (DWT)', 't'),
        num('grossTonnageInternational', 'GT quốc tế'), num('nettTonnageInternational', 'NT quốc tế'),
        num('grossTonnageSuezCanal', 'GT kênh Suez'), num('nettTonnageSuezCanal', 'NT kênh Suez'),
        num('grossTonnagePanamaCanal', 'GT kênh Panama'), num('nettTonnagePanamaCanal', 'NT kênh Panama'),
      ],
    },
    {
      id: 'hydro', title: 'Lượng chiếm nước & hệ số',
      fields: [
        num('lightShip', 'Trọng lượng tàu không', 't'),
        num('blockCoefficient', 'Hệ số khối'),
        bool('blockCoefficientNA', 'Không áp dụng hệ số khối'),
        num('tpcAtSummerDraft', 'TPC tại mớn nước mùa hè', 't/cm'),
        num('freshWaterAllowanceFwa', 'Hiệu chỉnh nước ngọt (FWA)', 'mm'),
      ],
    },
    {
      id: 'manifold', title: 'Ống góp làm hàng (manifold)',
      fields: [
        m('manifoldToWaterlineBallast', 'Đến mặt nước (dằn)'), m('manifoldToWaterlineLoaded', 'Đến mặt nước (đầy hàng)'),
        m('deckToManifold', 'Mặt boong đến ống góp'), m('sternToManifold', 'Đuôi đến ống góp'),
        m('shipsideToManifold', 'Mạn đến ống góp'), m('bowToManifold', 'Mũi đến ống góp'),
        m('manifoldToKeel', 'Ống góp đến ky'), m('manifoldToBridge', 'Ống góp đến lầu lái'),
        num('maxLoadingRateShip', 'Tốc độ nhận hàng tối đa', 'm³/giờ'), num('numberOfLines', 'Số đường ống'),
        num('maxAllowablePressurePsi', 'Áp suất tối đa', 'psi'),
        { key: 'ventingSystemShip', label: 'Hệ thống thông hơi' },
      ],
    },
  ],

  'class-flag-state': [
    {
      id: 'class', title: 'Phân cấp',
      fields: [
        { key: 'classNotation', label: 'Ký hiệu phân cấp' },
        { key: 'classRegisterNumber', label: 'Số đăng bạ' },
      ],
    },
    org('class-society', 'Tổ chức đăng kiểm', 'classSociety', 'Tên tổ chức'),
    org('flag-state', 'Cơ quan quản lý cờ', 'flagState', 'Tên cơ quan'),
  ],

  machinery: [
    {
      id: 'anchor', title: 'Xích neo',
      fields: [
        num('anchorChainPort', 'Mạn trái', 'đường'), num('anchorChainStarboard', 'Mạn phải', 'đường'),
        num('anchorChainStern', 'Neo lái', 'đường'), bool('anchorChainSternNA', 'Không có neo lái'),
      ],
    },
    {
      id: 'generator', title: 'Máy phát & chân vịt phụ',
      fields: [
        { key: 'harbourGeneratorMaker', label: 'Hãng máy phát cảng / sự cố' },
        num('harbourGeneratorMaxPowerKW', 'Công suất máy phát', 'kW'),
        bool('shaftGeneratorNA', 'Không có máy phát trục'),
        bool('bowthrusterNA', 'Không có chân vịt mũi'),
        bool('sternthrusterNA', 'Không có chân vịt lái'),
      ],
    },
    {
      id: 'azimuth', title: 'Động cơ azimuth',
      fields: [
        num('azimuthEngFwdCount', 'Số động cơ phía mũi'), num('azimuthEngFwdMaxPowerKW', 'Công suất phía mũi', 'kW'),
        num('azimuthEngAftCount', 'Số động cơ phía lái'), num('azimuthEngAftMaxPowerKW', 'Công suất phía lái', 'kW'),
      ],
    },
  ],

  'radio-comm': [
    {
      id: 'contact', title: 'Liên lạc',
      fields: [
        { key: 'inmarsatPhone1', label: 'Inmarsat — điện thoại 1' }, { key: 'inmarsatPhone2', label: 'Inmarsat — điện thoại 2' },
        { key: 'inmarsatFax1', label: 'Inmarsat — fax 1' }, { key: 'inmarsatFax2', label: 'Inmarsat — fax 2' },
        { key: 'inmarsatTelex1', label: 'Inmarsat — telex 1' }, { key: 'inmarsatTelex2', label: 'Inmarsat — telex 2' },
        { key: 'gsmPhone', label: 'Điện thoại GSM' },
        { key: 'emailAddress1', label: 'Email 1', kind: 'email' }, { key: 'emailAddress2', label: 'Email 2', kind: 'email' },
      ],
    },
    {
      id: 'sea-area', title: 'Vùng biển hoạt động (GMDSS)',
      fields: [bool('seaAreaA1', 'Vùng A1'), bool('seaAreaA2', 'Vùng A2'), bool('seaAreaA3', 'Vùng A3'), bool('seaAreaA4', 'Vùng A4')],
    },
    {
      id: 'equipment', title: 'Thiết bị vô tuyến',
      fields: [
        bool('dscHF', 'DSC HF'), bool('dscMF', 'DSC MF'), bool('dscVHF', 'DSC VHF'), bool('ais', 'AIS'),
        bool('radiotelephoneHF', 'Vô tuyến thoại HF'), bool('radiotelephoneMF', 'Vô tuyến thoại MF'),
        bool('radiotelephoneVHF', 'Vô tuyến thoại VHF'), bool('navtex', 'NAVTEX'),
        bool('radiotelegraphHF', 'Vô tuyến điện báo HF'), bool('radiotelegraphMF', 'Vô tuyến điện báo MF'),
        bool('radiotelegraphVHF', 'Vô tuyến điện báo VHF'), bool('sartTransponder', 'SART'),
        bool('radiotelex', 'Radiotelex'),
        { key: 'otherRadioEquipment', label: 'Thiết bị khác' },
      ],
    },
    {
      id: 'epirb', title: 'Phao EPIRB',
      fields: [
        { key: 'epirbNumber', label: 'Số EPIRB' }, { key: 'epirbMaker', label: 'Hãng sản xuất' },
        { key: 'epirbModel', label: 'Model' }, { key: 'epirbFrequency', label: 'Tần số' },
        { key: 'epirbOperatingSystem', label: 'Hệ thống vận hành' },
      ],
    },
  ],

  'tanks-cargo': [
    {
      id: 'tanks', title: 'Dung tích két (100%)',
      fields: [
        cbm('hfoCbm', 'Dầu nặng (HFO)'), cbm('mdoCbm', 'Dầu diesel (MDO)'), cbm('lubOilCbm', 'Dầu bôi trơn'),
        cbm('freshWaterCbm', 'Nước ngọt'), cbm('ballastWaterCbm', 'Nước dằn'), num('noOfBallastTanks', 'Số két dằn'),
        cbm('sludgeCbm', 'Cặn dầu'), cbm('bilgeWaterCbm', 'Nước đáy tàu'), cbm('sewageCbm', 'Nước thải'),
      ],
    },
    {
      id: 'cargo', title: 'Sức chứa hàng',
      fields: [
        num('teuTotal', 'Tổng TEU'), num('teuOnDeck', 'TEU trên boong'), num('teuUnderDeck', 'TEU dưới hầm'),
        cbm('grainCbm', 'Dung tích hàng hạt'), cbm('balesCbm', 'Dung tích hàng kiện'),
        num('noOfCargoHolds', 'Số hầm hàng'), num('noOfHatches', 'Số nắp hầm'),
      ],
    },
  ],

  shipowner: [
    org('shipowner', 'Chủ tàu', 'shipowner'),
    org('managing-owner', 'Chủ tàu quản lý', 'managingOwner'),
    org('operator', 'Đơn vị khai thác', 'operator'),
    person('cso', 'Sĩ quan an ninh công ty (CSO)', 'cso'),
    person('dpa', 'Người được chỉ định trên bờ (DPA)', 'dpa'),
    person('qi-usa', 'Người đại diện đủ điều kiện (QI) — Hoa Kỳ', 'qiUsa'),
    person('qi-panama', 'Người đại diện đủ điều kiện (QI) — Panama', 'qiPanama'),
  ],

  charterer: [
    org('charterer', 'Người thuê tàu', 'charterer'),
    org('bareboat', 'Người thuê tàu trần', 'bareboatCharterer'),
  ],

  insurance: [
    org('pi', 'Hội bảo hiểm P&I', 'piClub', 'Tên hội'),
    org('hm', 'Bảo hiểm thân tàu & máy móc (H&M)', 'hmClub', 'Tên hội'),
  ],
};

export const PARTICULARS_TABS = Object.keys(PARTICULARS) as ParticularsTab[];
export const isParticularsTab = (tab: string): tab is ParticularsTab => (PARTICULARS_TABS as string[]).includes(tab);
