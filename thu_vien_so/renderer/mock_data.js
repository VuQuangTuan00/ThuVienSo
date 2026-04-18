// ═══════════════════════════════════════════════════════
//  mock_data.js — Dữ liệu mẫu dùng chung
//  Được load bởi: renderer/index.html và admin/sign_up_admin.html
//  Khi chạy trong Electron thật → SQLite thay thế hoàn toàn
// ═══════════════════════════════════════════════════════

const MOCK_DATA = [

  // ══════════════════════════════════════
  //  NGÀNH THAM MƯU
  // ══════════════════════════════════════
  {
    id: 1, linh_vuc: 'thammu',
    loai: 'THIẾT BỊ & PHẦN MỀM',
    ten: 'Báo bia tự động',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Hệ thống báo bia tự động phục vụ huấn luyện bắn súng, tăng hiệu quả kiểm tra kết quả bắn.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '4//', ho_ten: 'Hà Đình Hương',   chuc_vu: 'Lữ đoàn trưởng' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý xe máy' },
    ]
  },
  {
    id: 2, linh_vuc: 'thammu',
    loai: 'MÔ PHỎNG 3D',
    ten: 'Cấu tạo và nguyên lý mìn chống tăng',
    don_vi: 'Phòng Hậu cần - Kỹ thuật, Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Mô phỏng 3D cấu tạo, nguyên lý hoạt động và quy trình sử dụng mìn chống tăng phục vụ huấn luyện.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '4/', ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý xe máy' },
      { cap_bac: '4/', ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 3, linh_vuc: 'thammu',
    loai: 'MÔ PHỎNG 3D',
    ten: 'Quy trình khoan nổ đường hầm',
    don_vi: 'Phòng Hậu cần - Kỹ thuật, Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Mô phỏng quy trình khoan nổ mìn đào đường hầm theo tiêu chuẩn kỹ thuật công binh.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '4/', ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý xe máy' },
      { cap_bac: '4/', ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 4, linh_vuc: 'thammu',
    loai: 'MÔ PHỎNG 3D',
    ten: 'Trung đội ăn ở dã ngoại',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '5/2025',
    danh_gia: 5,
    mo_ta: 'Mô phỏng 3D bố trí khu vực ăn ở dã ngoại của trung đội trong điều kiện thực địa.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '4//', ho_ten: 'Tạ Duy Đĩnh',      chuc_vu: 'Phó Lữ đoàn trưởng' },
      { cap_bac: '2//', ho_ten: 'Phạm Hoàng Sỹ',    chuc_vu: 'Phó TMT' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý xe máy' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 5, linh_vuc: 'thammu',
    loai: 'MÔ HÌNH',
    ten: 'Mô hình bộc phá khối',
    don_vi: 'Tiểu đoàn 3/Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Mô hình trực quan bộc phá khối phục vụ huấn luyện kỹ thuật công binh cơ bản.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '2/', ho_ten: 'Võ Văn Tam', chuc_vu: 'Trung đội trưởng' },
    ]
  },
  {
    id: 6, linh_vuc: 'thammu',
    loai: 'THIẾT BỊ',
    ten: 'Balo phao vượt sông',
    don_vi: 'Tiểu đoàn 2/Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Thiết bị balo kiêm phao nổi hỗ trợ bộ đội vượt sông trong tình huống chiến đấu và cứu hộ.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '3/', ho_ten: 'Lê Văn Sinh', chuc_vu: 'Trung đội trưởng' },
    ]
  },

  // ══════════════════════════════════════
  //  NGÀNH CHÍNH TRỊ
  // ══════════════════════════════════════
  {
    id: 7, linh_vuc: 'chinhri',
    loai: 'PHẦN MỀM',
    ten: 'Phần mềm bổ trợ giáo dục CTĐ-CTCT',
    don_vi: 'Tiểu đoàn 2/Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Phần mềm hỗ trợ công tác đảng, công tác chính trị trong đơn vị, tổng hợp và quản lý tư liệu.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '1//', ho_ten: 'Lê Văn Hà', chuc_vu: 'Trợ lý thanh niên' },
    ]
  },
  {
    id: 8, linh_vuc: 'chinhri',
    loai: 'PHẦN MỀM',
    ten: 'Phần mềm quản lý tư tưởng',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '2025',
    danh_gia: 5,
    mo_ta: 'Hệ thống theo dõi, tổng hợp và phân tích diễn biến tư tưởng cán bộ chiến sĩ trong đơn vị.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: []
  },
  {
    id: 9, linh_vuc: 'chinhri',
    loai: 'THIẾT BỊ',
    ten: 'Thiết bị trả lời câu hỏi trắc nghiệm',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '2025',
    danh_gia: 5,
    mo_ta: 'Bộ thiết bị phần cứng hỗ trợ tổ chức thi trắc nghiệm nhanh, hiện thị kết quả tức thời.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: []
  },
  {
    id: 10, linh_vuc: 'chinhri',
    loai: 'THIẾT BỊ',
    ten: 'Thiết bị hỗ trợ giảng dạy chính trị và tuyên truyền phổ biến GDPL',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '2025',
    danh_gia: 5,
    mo_ta: 'Thiết bị tích hợp màn hình, loa, và phần mềm phục vụ giảng dạy chính trị và tuyên truyền pháp luật.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: []
  },

  // ══════════════════════════════════════
  //  NGÀNH HC-KT
  // ══════════════════════════════════════
  {
    id: 11, linh_vuc: 'hckt',
    loai: 'GIÁO ÁN ĐIỆN TỬ',
    ten: 'Mô phỏng 3D cấu tạo và NLLV của bộ xe bắc cầu cơ giới MS-20S',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Giáo án điện tử mô phỏng 3D đầy đủ cấu tạo và nguyên lý làm việc của bộ xe bắc cầu cơ giới MS-20S.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '4/', ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý Xe máy' },
      { cap_bac: '4/', ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
      { cap_bac: '4/', ho_ten: 'Vũ Văn Thơ',       chuc_vu: 'Phó Tiểu đoàn trưởng' },
    ]
  },
  {
    id: 12, linh_vuc: 'hckt',
    loai: 'MÔ PHỎNG 3D',
    ten: 'Máy khoan Sandvik DS311',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Mô phỏng 3D chi tiết máy khoan Sandvik DS311 phục vụ huấn luyện vận hành và bảo dưỡng.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '4//', ho_ten: 'Tạ Duy Đĩnh',      chuc_vu: 'Phó Lữ đoàn trưởng' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý Xe máy' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 13, linh_vuc: 'hckt',
    loai: 'THIẾT BỊ',
    ten: 'Thiết bị hạ thủy tự động PMP',
    don_vi: 'Tiểu đoàn 3/Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Thiết bị tự động hóa quy trình hạ thủy phao PMP, giảm thời gian và nhân lực thi công.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '1//CN', ho_ten: 'Đỗ Văn Phờn', chuc_vu: 'Lái xe' },
    ]
  },
  {
    id: 14, linh_vuc: 'hckt',
    loai: 'MÔ PHỎNG 3D',
    ten: 'Bếp Hoàng Cầm cấp 1',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Mô phỏng 3D cấu tạo và cách sử dụng bếp Hoàng Cầm cấp 1 trong điều kiện dã ngoại.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '2//', ho_ten: 'Vũ Đình Vinh',     chuc_vu: 'Chủ nhiệm Hậu cần - Kỹ thuật' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý Xe máy' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 15, linh_vuc: 'hckt',
    loai: 'MÔ PHỎNG 3D',
    ten: '5 cơ bản trong TGSX',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Mô phỏng 5 nội dung cơ bản trong tăng gia sản xuất phục vụ công tác hậu cần đơn vị.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '2//', ho_ten: 'Nguyễn Doãn Thụ',  chuc_vu: 'Phó Chủ nhiệm' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý Xe máy' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 16, linh_vuc: 'hckt',
    loai: 'MÔ PHỎNG 3D',
    ten: 'Bộ kho xăng dầu dã chiến DC-100',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '4/2025',
    danh_gia: 5,
    mo_ta: 'Mô phỏng 3D bố trí, lắp đặt và vận hành bộ kho xăng dầu dã chiến DC-100 trong điều kiện chiến đấu.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '2//', ho_ten: 'Nguyễn Doãn Thụ',  chuc_vu: 'Phó Chủ nhiệm' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý Xe máy' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 17, linh_vuc: 'hckt',
    loai: 'PHẦN MỀM',
    ten: 'Phần mềm quản lý trạm chế biến',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '8/2025',
    danh_gia: 5,
    mo_ta: 'Phần mềm quản lý toàn diện hoạt động trạm chế biến lương thực, thực phẩm trong đơn vị.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '4//', ho_ten: 'Tạ Duy Đĩnh',      chuc_vu: 'Phó Lữ đoàn trưởng' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý Xe máy' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 18, linh_vuc: 'hckt',
    loai: 'PHẦN MỀM',
    ten: 'Phần mềm quản lý kho SSCĐ',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '8/2025',
    danh_gia: 5,
    mo_ta: 'Phần mềm quản lý kho sẵn sàng chiến đấu, theo dõi xuất nhập kho và tình trạng trang bị.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: [
      { cap_bac: '2//', ho_ten: 'Vũ Đình Vinh',     chuc_vu: 'Chủ nhiệm Hậu cần - Kỹ thuật' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Đức Thiện', chuc_vu: 'Trợ lý Xe máy' },
      { cap_bac: '4/',  ho_ten: 'Nguyễn Văn Thành', chuc_vu: 'Phó Trạm trưởng' },
    ]
  },
  {
    id: 19, linh_vuc: 'hckt',
    loai: 'THIẾT BỊ',
    ten: 'Cảnh báo an toàn cửa kho, tủ súng',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '2025',
    danh_gia: 5,
    mo_ta: 'Hệ thống cảnh báo tự động khi cửa kho và tủ súng bị mở không đúng quy trình.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: []
  },
  {
    id: 20, linh_vuc: 'hckt',
    loai: 'PHẦN MỀM',
    ten: 'Quản lý tăng gia, chăn nuôi bằng mã QR',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '2025',
    danh_gia: 5,
    mo_ta: 'Ứng dụng quét mã QR để quản lý cây trồng, vật nuôi trong hoạt động tăng gia sản xuất.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: []
  },
  {
    id: 21, linh_vuc: 'hckt',
    loai: 'THIẾT BỊ',
    ten: 'Cải tiến xe téc nước',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '2025',
    danh_gia: 5,
    mo_ta: 'Cải tiến hệ thống xe téc nước tăng khả năng cung cấp nước sạch trong huấn luyện và chiến đấu.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: []
  },
  {
    id: 22, linh_vuc: 'hckt',
    loai: 'THIẾT BỊ',
    ten: 'Máy làm giá đỗ tự động',
    don_vi: 'Lữ đoàn 279/BCCB',
    ngay_ap_dung: '2025',
    danh_gia: 5,
    mo_ta: 'Máy tự động hóa quy trình ủ và làm giá đỗ phục vụ bữa ăn bộ đội, tiết kiệm nhân lực.',
    link_video: '',
    qr_noi_dung: '',
    file_thuyet_minh: '', file_quyet_dinh: '', file_anh: '', file_ban_ve: '', file_hieu_qua: '',
    authors: []
  },
];

// ── Helper thống kê từ mock ──
const MOCK_STATS = {
  get total()   { return MOCK_DATA.length; },
  get thammu()  { return MOCK_DATA.filter(d => d.linh_vuc === 'thammu').length;  },
  get chinhri() { return MOCK_DATA.filter(d => d.linh_vuc === 'chinhri').length; },
  get hckt()    { return MOCK_DATA.filter(d => d.linh_vuc === 'hckt').length;    },
};

if (typeof window !== 'undefined') {
  window.MOCK_DATA = MOCK_DATA;
  window.MOCK_STATS = MOCK_STATS;
  console.log(`[MOCK] Đã load ${window.MOCK_DATA.length} sáng kiến mẫu`);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MOCK_DATA, MOCK_STATS };
}
