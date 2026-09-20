import { Link } from "react-router-dom";
import { Heading, ListState, Table } from "../components";
import { useReceptionList } from "../api";
export function DashboardPage() {
  const members = useReceptionList("GET /members", { page: "1", limit: "5" });
  return (
    <>
      <Heading title="Tổng quan lễ tân" />
      <section className="panel reception-section">
        <h2>Sẵn sàng đón hội viên</h2>
        <p>Tra cứu hội viên và xử lý đăng ký tại quầy.</p>
        <div className="reception-shortcuts">
          {[
            ["members/create", "Đăng ký hội viên mới"],
            ["membership", "Đăng ký / gia hạn gói"],
            ["classes", "Hỗ trợ đăng ký lớp"],
            ["payments", "Thanh toán & hóa đơn"],
          ].map(([path, name]) => (
            <Link className="button" key={path} to={"/receptionist/" + path}>
              {name}
            </Link>
          ))}
        </div>
      </section>
      <section className="panel reception-section">
        <h2>Danh sách hội viên</h2>
        <ListState result={members}>
          {(rows) => (
            <Table
              rows={rows}
              columns={[
                ["user.fullName", "Hội viên"],
                ["user.email", "Email"],
                ["user.phone", "Điện thoại"],
              ]}
            />
          )}
        </ListState>
        <Link className="button" to="/receptionist/members">
          Tra cứu tất cả hội viên
        </Link>
      </section>
    </>
  );
}
