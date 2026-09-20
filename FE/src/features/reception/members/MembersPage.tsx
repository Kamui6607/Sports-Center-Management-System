import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { RecordData } from "../../../shared/api";
import { Details, ErrorState, Loading, SchemaForm } from "../../../shared/ui";
import { Heading, MemberPicker } from "../components";
import { useReceptionDetail } from "../api";
export function MembersPage() {
  const [member, setMember] = useState<RecordData | null>(null);
  const detail = useReceptionDetail(
    "GET /members/{id}",
    { id: String(member?.id ?? "") },
    Boolean(member),
  );
  return (
    <>
      <Heading title="Hội viên">
        <Link className="button primary" to="/receptionist/members/create">
          Đăng ký hội viên mới
        </Link>
      </Heading>
      <MemberPicker value={member} onChange={setMember} />
      {member && (
        <section className="panel reception-section">
          <h2>Thông tin hội viên</h2>
          {detail.isPending ? (
            <Loading variant="details" />
          ) : detail.isError ? (
            <ErrorState error={detail.error} retry={() => detail.refetch()} />
          ) : (
            <Details value={detail.data.data} />
          )}
          <Link
            className="button"
            to={
              "/receptionist/membership?memberId=" +
              encodeURIComponent(String(member.id))
            }
          >
            Kiểm tra / đăng ký gói
          </Link>
        </section>
      )}
    </>
  );
}
export function CreateMemberPage() {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  return (
    <>
      <Heading title="Đăng ký hội viên mới" />
      <section className="panel reception-section">
        {done ? (
          <>
            <p className="success" role="status">
              Đã tạo tài khoản hội viên. Có thể tìm hội viên và đăng ký gói ngay
              tại quầy.
            </p>
            <Link className="button primary" to="/receptionist/members">
              Về danh sách hội viên
            </Link>
          </>
        ) : (
          <SchemaForm
            operation="POST /auth/register"
            onSuccess={() => {
              setDone(true);
              void cache.invalidateQueries({ queryKey: ["reception"] });
            }}
            onCancel={() => navigate("/receptionist/members")}
          />
        )}
      </section>
    </>
  );
}
