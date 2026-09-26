import { useState } from "react";
import { ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { Modal } from "./ui";
import { ScanAttendanceQr } from "./QrAttendance";

export function AttendanceShortcut({
  role,
  base,
}: {
  role: string;
  base: string;
}) {
  const [open, setOpen] = useState(false);
  if (role !== "MEMBER") return null;
  return (
    <>
      <button
        className="attendance-shortcut"
        onClick={() => setOpen(true)}
        aria-label="Mở điểm danh nhanh"
      >
        <ScanLine size={22} />
        Điểm danh
      </button>
      {open && (
        <Modal title="Điểm danh nhanh" onClose={() => setOpen(false)}>
          <div className="attendance-quick-intro">
            <h2>Sẵn sàng cho buổi tập?</h2>
            <p>
              Quét mã QR do huấn luyện viên cung cấp để ghi nhận có mặt. Bạn
              cũng có thể nhập mã khi không dùng được camera.
            </p>
          </div>
          <ScanAttendanceQr />
          <Link
            className="button"
            to={`${base}/attendance`}
            onClick={() => setOpen(false)}
          >
            Xem lịch sử chuyên cần
          </Link>
        </Modal>
      )}
    </>
  );
}
