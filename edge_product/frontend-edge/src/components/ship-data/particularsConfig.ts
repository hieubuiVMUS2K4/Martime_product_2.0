/*
  Cấu hình "Dữ liệu tàu": tab → nhóm → trường. Cùng thứ tự tab, nhóm và nhãn với
  trang "Thông số tàu" bên bờ để hai bên nhìn giống nhau; khóa trường là tên của API tàu.
  Chế độ XEM và SỬA cùng đọc cấu hình này nên hai bên luôn khớp nhau.

  Tàu có thêm các danh sách (máy chính, chân vịt, mạn khô...) — khai ở `lists`.
*/

import type { SaveShipData, ShipDataTabId } from '@/types/ship-data.types';

export type FieldKind = 'text' | 'email' | 'number' | 'date' | 'bool' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  kind?: FieldKind;
  unit?: string;
  options?: string[];
  /** Số nguyên (năm, số người, số lượng). */
  integer?: boolean;
  required?: boolean;
  /** Không sửa được khi đã có giá trị (IMO là định danh tàu, gắn với gói kết nối). */
  lockedOnceSet?: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  fields: FieldDef[];
}

/** Danh sách nhiều dòng (máy chính, chân vịt...). */
export interface ListDef {
  id: string;
  title: string;
  collection: keyof SaveShipData;
  columns: FieldDef[];
  /** Trường "không có" — bật thì ẩn danh sách. */
  naKey?: keyof SaveShipData;
  /** Cột tính sẵn, chỉ hiển thị. */
  computed?: { label: string; value: (row: Record<string, unknown>) => string };
}

export interface TabDef {
  id: ShipDataTabId;
  label: string;
  sections: SectionDef[];
  lists?: ListDef[];
}

export const VESSEL_TYPES = [
  'Bulk Carrier', 'Container Ship', 'Tanker', 'Chemical Tanker', 'LNG Carrier', 'LPG Carrier',
  'General Cargo', 'Ro-Ro', 'Car Carrier', 'Passenger Ship', 'Cruise Ship', 'Ferry',
  'Offshore Supply Vessel', 'Tug', 'Dredger', 'Fishing Vessel', 'Other',
];
const FUEL_GRADES = ['HFO', 'VLSFO', 'ULSFO', 'MGO', 'MDO', 'LNG', 'Methanol', 'Other'];
const LOAD_LINE_TYPES = ['Tropical (T)', 'Summer (S)', 'Winter (W)', 'Winter North Atlantic (WNA)', 'Tropical Fresh Water (TF)', 'Fresh Water (F)'];
const ENGINE_ORDERS = ['Dead Slow Ahead', 'Slow Ahead', 'Half Ahead', 'Full Ahead', 'Navigation Full', 'Sea Speed', 'Dead Slow Astern', 'Slow Astern', 'Half Astern', 'Full Astern'];
const PROPELLER_TYPES = ['Fixed Pitch', 'Controllable Pitch'];
const ROTATIONS = ['Clockwise', 'Counter-Clockwise'];
const RUDDER_TYPES = ['Conventional', 'Semi-Balanced', 'Balanced', 'Flap', 'Schilling', 'Becker'];
const BOILER_TYPES = ['Auxiliary', 'Composite', 'Exhaust Gas', 'Thermal Oil Heater', 'Incinerator'];

const m = (key: string, label: string): FieldDef => ({ key, label, kind: 'number', unit: 'm' });
const cbm = (key: string, label: string): FieldDef => ({ key, label, kind: 'number', unit: 'm³' });
const num = (key: string, label: string, unit?: string): FieldDef => ({ key, label, kind: 'number', unit });
const int = (key: string, label: string, unit?: string): FieldDef => ({ key, label, kind: 'number', unit, integer: true });
const bool = (key: string, label: string): FieldDef => ({ key, label, kind: 'bool' });
const sel = (key: string, label: string, options: string[]): FieldDef => ({ key, label, kind: 'select', options });

/** Nhóm thông tin một tổ chức: tên, địa chỉ, liên lạc. */
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

// Thứ tự tab giống bên bờ
export const SHIP_DATA_TABS: TabDef[] = [
  {
    id: 'basic-data', label: 'Thông tin chung',
    sections: [
      {
        id: 'identity', title: 'Nhận dạng',
        fields: [
          { key: 'shipName', label: 'Tên tàu', required: true },
          { key: 'imoNumber', label: 'Số IMO', required: true, lockedOnceSet: true },
          { key: 'callSign', label: 'Hô hiệu' },
          sel('typeOfVessel', 'Loại tàu', VESSEL_TYPES),
          { key: 'flag', label: 'Quốc tịch (cờ)', required: true },
          { key: 'portOfRegistry', label: 'Cảng đăng ký', required: true },
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
          int('yearBuilt', 'Năm đóng'),
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
          int('noOfCrewSafeManning', 'Định biên an toàn', 'người'),
          int('maxPersonsAllowedOB', 'Số người tối đa', 'người'),
          int('maxPassengersAllowedOB', 'Số hành khách tối đa', 'người'),
        ],
      },
    ],
  },
  {
    id: 'dimensions', label: 'Kích thước',
    sections: [
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
          num('maxLoadingRateShip', 'Tốc độ nhận hàng tối đa', 'm³/giờ'), int('numberOfLines', 'Số đường ống'),
          num('maxAllowablePressurePsi', 'Áp suất tối đa', 'psi'),
          { key: 'ventingSystemShip', label: 'Hệ thống thông hơi' },
        ],
      },
    ],
    lists: [
      {
        id: 'load-lines', title: 'Mạn khô (load line)', collection: 'loadLines',
        columns: [
          sel('loadLineType', 'Loại', LOAD_LINE_TYPES), num('draftM', 'Mớn nước', 'm'), num('freeboardM', 'Mạn khô', 'm'),
          num('displacementMt', 'Lượng chiếm nước', 't'), num('deadweightMt', 'Trọng tải', 't'),
        ],
      },
      {
        id: 'pilot-card', title: 'Bảng tốc độ (pilot card)', collection: 'pilotCardData',
        columns: [
          sel('engineOrder', 'Lệnh máy', ENGINE_ORDERS), num('mainEngineRPM', 'Vòng quay máy chính', 'v/ph'),
          num('speedLoadedKts', 'Tốc độ đầy hàng', 'hải lý/giờ'), num('speedBallastKts', 'Tốc độ chạy dằn', 'hải lý/giờ'),
        ],
      },
    ],
  },
  {
    id: 'class-flag-state', label: 'Đăng kiểm & cờ',
    sections: [
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
  },
  {
    id: 'machinery', label: 'Máy móc',
    sections: [
      {
        id: 'anchor', title: 'Xích neo',
        fields: [
          { key: 'anchorChainPort', label: 'Mạn trái', unit: 'đường' },
          { key: 'anchorChainStarboard', label: 'Mạn phải', unit: 'đường' },
          { key: 'anchorChainStern', label: 'Neo lái', unit: 'đường' },
          bool('anchorChainSternNA', 'Không có neo lái'),
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
          int('azimuthEngFwdCount', 'Số động cơ phía mũi'), num('azimuthEngFwdMaxPowerKW', 'Công suất phía mũi', 'kW'),
          int('azimuthEngAftCount', 'Số động cơ phía lái'), num('azimuthEngAftMaxPowerKW', 'Công suất phía lái', 'kW'),
        ],
      },
    ],
    lists: [
      {
        id: 'main-engines', title: 'Máy chính', collection: 'mainEngines',
        columns: [{ key: 'meType', label: 'Kiểu máy' }, sel('meFuelGrade', 'Loại nhiên liệu', FUEL_GRADES), num('mePowerKW', 'Công suất', 'kW'), num('mcrKW', 'MCR', 'kW')],
      },
      {
        id: 'aux-engines', title: 'Máy phụ', collection: 'auxiliaryEngines',
        columns: [{ key: 'aeType', label: 'Kiểu máy' }, sel('aeFuelGrade', 'Loại nhiên liệu', FUEL_GRADES), num('aePowerKW', 'Công suất', 'kW')],
      },
      {
        id: 'propellers', title: 'Chân vịt', collection: 'propellers',
        columns: [
          sel('propellerType', 'Loại', PROPELLER_TYPES), int('numberOfBlades', 'Số cánh'), sel('rotation', 'Chiều quay', ROTATIONS),
          num('diameterMm', 'Đường kính', 'mm'), num('propellerPitchGeometricMm', 'Bước xoắn', 'mm'),
        ],
        computed: {
          label: 'Tỉ số bước',
          value: r => {
            const p = Number(r.propellerPitchGeometricMm), d = Number(r.diameterMm);
            return p && d ? (Math.round((p / d) * 10000) / 10000).toString() : '';
          },
        },
      },
      { id: 'bow-thrusters', title: 'Chân vịt mũi', collection: 'bowthrusters', naKey: 'bowthrusterNA', columns: [num('powerKW', 'Công suất', 'kW')] },
      { id: 'stern-thrusters', title: 'Chân vịt lái', collection: 'sternthrusters', naKey: 'sternthrusterNA', columns: [num('powerKW', 'Công suất', 'kW')] },
      { id: 'shaft-generators', title: 'Máy phát trục', collection: 'shaftGenerators', naKey: 'shaftGeneratorNA', columns: [num('maxPowerKW', 'Công suất tối đa', 'kW')] },
      { id: 'rudders', title: 'Bánh lái', collection: 'rudders', columns: [sel('rudderType', 'Loại bánh lái', RUDDER_TYPES)] },
      { id: 'boilers', title: 'Nồi hơi', collection: 'boilers', columns: [sel('boilerType', 'Loại', BOILER_TYPES), { key: 'model', label: 'Model' }] },
    ],
  },
  {
    id: 'radio-comm', label: 'Thông tin liên lạc',
    sections: [
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
  },
  {
    id: 'tanks-cargo', label: 'Két & hầm hàng',
    sections: [
      {
        id: 'tanks', title: 'Dung tích két (100%)',
        fields: [
          cbm('hfoCbm', 'Dầu nặng (HFO)'), cbm('mdoCbm', 'Dầu diesel (MDO)'), cbm('lubOilCbm', 'Dầu bôi trơn'),
          cbm('freshWaterCbm', 'Nước ngọt'), cbm('ballastWaterCbm', 'Nước dằn'), int('noOfBallastTanks', 'Số két dằn'),
          cbm('sludgeCbm', 'Cặn dầu'), cbm('bilgeWaterCbm', 'Nước đáy tàu'), cbm('sewageCbm', 'Nước thải'),
        ],
      },
      {
        id: 'cargo', title: 'Sức chứa hàng',
        fields: [
          int('teuTotal', 'Tổng TEU'), int('teuOnDeck', 'TEU trên boong'), int('teuUnderDeck', 'TEU dưới hầm'),
          cbm('grainCbm', 'Dung tích hàng hạt'), cbm('balesCbm', 'Dung tích hàng kiện'),
          int('noOfCargoHolds', 'Số hầm hàng'), int('noOfHatches', 'Số nắp hầm'),
        ],
      },
    ],
  },
  {
    id: 'shipowner', label: 'Chủ tàu',
    sections: [
      org('shipowner', 'Chủ tàu', 'shipowner'),
      org('managing-owner', 'Chủ tàu quản lý', 'managingOwner'),
      org('operator', 'Đơn vị khai thác', 'operator'),
      person('cso', 'Sĩ quan an ninh công ty (CSO)', 'cso'),
      person('dpa', 'Người được chỉ định trên bờ (DPA)', 'dpa'),
      person('qi-usa', 'Người đại diện đủ điều kiện (QI) — Hoa Kỳ', 'qiUsa'),
      person('qi-panama', 'Người đại diện đủ điều kiện (QI) — Panama', 'qiPanama'),
    ],
  },
  {
    id: 'charterer', label: 'Người thuê tàu',
    sections: [
      org('charterer', 'Người thuê tàu', 'charterer'),
      org('bareboat', 'Người thuê tàu trần', 'bareboatCharterer'),
    ],
  },
  {
    id: 'insurance', label: 'Bảo hiểm',
    sections: [
      org('pi', 'Hội bảo hiểm P&I', 'piClub', 'Tên hội'),
      org('hm', 'Bảo hiểm thân tàu & máy móc (H&M)', 'hmClub', 'Tên hội'),
    ],
  },
];

export const ALL_FIELDS: FieldDef[] = SHIP_DATA_TABS.flatMap(t => t.sections.flatMap(s => s.fields));
export const ALL_LISTS: ListDef[] = SHIP_DATA_TABS.flatMap(t => t.lists ?? []);
