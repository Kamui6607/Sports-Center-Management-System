export function Policies({ role }: { role: string }) {
  return (
    <div className="workflow-page">
      <div className="page-heading">
        <div>
          <h1>Chính sách sử dụng</h1>
          <p>Các điều kiện cần kiểm tra khi thao tác tại trung tâm.</p>
        </div>
      </div>
      <section className="panel workflow-card">
        <h2>Gói hội viên & đăng ký lớp</h2>
        <p>
          Gói chỉ có hiệu lực khi đang hoạt động, đã đến ngày bắt đầu và chưa
          hết hạn. Gói tạm dừng, đã hủy hoặc hết hạn không cấp quyền đăng ký
          lớp. Lớp Premium yêu cầu gói Premium còn hiệu lực. Gói phải còn hạn
          đến thời điểm buổi học bắt đầu.
        </p>
        <p>
          Chỉ đăng ký lịch còn mở, chưa bắt đầu và còn chỗ. Mỗi hội viên chỉ có
          một lượt đăng ký hợp lệ cho một buổi, không đặt các lớp trùng giờ. Có
          thể đặt lại sau khi hủy nếu vẫn đủ điều kiện.
        </p>
        <p>
          Chỉ được hủy lượt đã đặt trước giờ bắt đầu. Hội viên chỉ được hủy lượt
          của mình; huấn luyện viên không đăng ký hoặc hủy thay hội viên.
        </p>
      </section>
      <section className="panel workflow-card">
        <h2>Lịch học & điểm danh</h2>
        <p>
          Phòng và huấn luyện viên không được trùng lịch. Sức chứa phòng phải đủ
          cho sĩ số lớp. Khi hủy buổi học, các lượt đăng ký đang đặt sẽ bị hủy.
        </p>
        <p>
          Quản lý hoặc lễ tân chỉ hoàn tất buổi học sau giờ kết thúc. Hoàn tất
          lịch không xác nhận hội viên có mặt. Điểm danh có bốn kết quả: có mặt,
          vắng mặt, đi muộn và vắng có phép; do quản lý hoặc huấn luyện viên phụ
          trách ghi nhận.
        </p>
      </section>
      <section className="panel workflow-card">
        <h2>Thanh toán & quyền lợi</h2>
        <p>
          Mua và gia hạn gói thực hiện tại quầy. Khi nhân viên xác nhận đăng ký
          hoặc gia hạn, hệ thống ghi nhận đã thu tiền và phát hành hóa đơn ngay.
          Không ghi thêm một thanh toán trùng cho cùng khoản đã thu.
        </p>
        <p>
          Đăng ký gói mới sẽ tạm dừng các gói đang hoạt động. Gia hạn tạo kỳ gói
          tiếp theo. Mua gói mới không cho phép hạ hạng hoặc giảm số ngày cùng
          hạng; ngày dư được cộng vào gói mới.
        </p>
        <p>
          Chỉ thanh toán thành công mới được ghi nhận hoàn tiền, do quản lý xử
          lý. Cập nhật trạng thái hoàn tiền không tự chuyển tiền ngân hàng hay
          hủy gói. Hủy gói ACTIVE sẽ hủy các lượt đặt lớp tương lai: hội viên tự
          hủy được hoàn 30% khoản gốc khi còn trên 15 ngày, còn từ 15 ngày trở
          xuống không hoàn; quản lý hủy được tính theo tỷ lệ ngày còn lại. Tiền
          hoàn nhận tại quầy.
        </p>
      </section>
      <section className="panel workflow-card">
        <h2>Tài khoản & thông tin cá nhân</h2>
        <p>
          Không chia sẻ tài khoản hoặc thông tin hội viên trong phòng chat
          chung. Tin nhắn trong phòng chung hiển thị cho các tài khoản của trung
          tâm; chọn người nhận để trao đổi riêng.
        </p>
        <p>
          Khi tài khoản bị khóa hoặc thay đổi vai trò, phiên truy cập cũ không
          còn được sử dụng. Hãy đăng nhập lại hoặc liên hệ trung tâm.
        </p>
        {role === "MANAGER" && (
          <p>
            Không tự khóa hoặc đổi vai trò của chính mình. Luôn giữ ít nhất một
            quản lý đang hoạt động. Trước khi đổi vai trò hội viên, xử lý gói
            đang hoạt động và lớp đã đặt; trước khi đổi vai trò huấn luyện viên,
            xử lý lịch đang phụ trách.
          </p>
        )}
      </section>
    </div>
  );
}
