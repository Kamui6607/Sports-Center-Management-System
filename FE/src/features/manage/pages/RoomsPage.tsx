import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "../../../shared/api";
import { ActivePill, DataTable, Dialog, ErrorBox, Field, fieldErrors, PageHead, Pager, Panel, QueryView, SearchBox, Select, num, str, useUrlState } from "../kit";
import type { Row } from "../kit";

export default function RoomsPage() {
  const s = useUrlState();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const query = { search: s.value("search"), areaType: s.value("areaType"), isActive: s.value("isActive"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "rooms", query],
    queryFn: ({ signal }) => api<Row[]>("GET /rooms", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHead
        eyebrow="Đào tạo · Cơ sở vật chất"
        title="Phòng tập"
        actions={
          <button className="cr-btn primary" onClick={() => setEditing("new")}>
            <Plus size={17} /> Thêm phòng
          </button>
        }
      />
      <Panel>
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tìm theo tên phòng" />
          <Select
            label="Trạng thái"
            value={s.value("isActive")}
            onChange={(v) => s.set({ isActive: v })}
            options={[
              ["true", "Đang sử dụng"],
              ["false", "Ngừng sử dụng"],
            ]}
          />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                columns={[
                  {
                    key: "n",
                    title: "Phòng",
                    render: (r) => (
                      <div className="cr-cell-main">
                        <Link to={`/manager/rooms/${str(r.id)}`}>{str(r.name)}</Link>
                        <small>{[r.floor, r.location].filter(Boolean).map(str).join(" · ") || "Chưa ghi vị trí"}</small>
                      </div>
                    ),
                  },
                  { key: "a", title: "Chỉ dẫn", render: (r) => str(r.directions) || "—" },
                  { key: "c", title: "Sức chứa", className: "num", render: (r) => `${num(r.capacity)} người` },
                  { key: "s", title: "Trạng thái", render: (r) => <ActivePill active={r.isActive} on="Đang sử dụng" off="Ngừng sử dụng" /> },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (r) => (
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button className="cr-btn sm" onClick={() => setEditing(r)}>
                          Sửa
                        </button>
                        <Link className="cr-btn sm" to={`/manager/rooms/${str(r.id)}`}>
                          Lịch phòng
                        </Link>
                      </span>
                    ),
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      {editing && <RoomDialog room={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function RoomDialog({ room, onClose }: { room: Row | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: str(room?.name),
    capacity: room ? str(room.capacity) : "",
    location: str(room?.location),
    floor: str(room?.floor),
    directions: str(room?.directions),
    // Phạm vi Gym: phòng mới luôn là khu trong nhà; phòng cũ giữ nguyên khu vực.
    areaType: str(room?.areaType) || "INDOOR",
  });
  const cache = useQueryClient();
  const m = useMutation({
    mutationFn: () => {
      const opt = (v: string) => (v.trim() ? v.trim() : room ? null : undefined);
      const body = {
        name: f.name.trim(),
        capacity: Number(f.capacity),
        location: opt(f.location),
        floor: opt(f.floor),
        directions: opt(f.directions),
        areaType: f.areaType,
      };
      return room ? api("PATCH /rooms/{id}", { params: { id: str(room.id) }, body }) : api("POST /rooms", { body });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "rooms"] });
      onClose();
    },
  });
  const errs = fieldErrors(m.error);
  const capInvalid = !Number.isInteger(Number(f.capacity)) || Number(f.capacity) <= 0;
  const invalid = f.name.trim().length < 2 || capInvalid;
  return (
    <Dialog
      title={room ? `Sửa phòng ${str(room.name)}` : "Thêm phòng tập"}
      eyebrow="Phòng tập"
      onClose={onClose}
      busy={m.isPending}
      onSubmit={() => !invalid && m.mutate()}
      footer={
        <>
          <button type="button" className="cr-btn ghost" onClick={onClose} disabled={m.isPending}>
            Hủy
          </button>
          <button className="cr-btn primary" disabled={m.isPending || invalid}>
            {m.isPending ? "Đang lưu…" : room ? "Lưu thay đổi" : "Thêm phòng"}
          </button>
        </>
      }
    >
      <div className="cr-form">
        <Field label="Tên phòng" required error={errs.name}>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Sức chứa" required error={f.capacity && capInvalid ? "Nhập số nguyên lớn hơn 0." : errs.capacity} hint="Không giảm được dưới số chỗ đã giữ/sức chứa lớp đang xếp lịch.">
          <input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        </Field>
        <Field label="Tầng" error={errs.floor}>
          <input value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} placeholder="VD: Tầng 2" maxLength={40} />
        </Field>
        <Field label="Khu vực trong trung tâm" error={errs.location}>
          <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="VD: Khu tạ tự do" maxLength={120} />
        </Field>
        <Field label="Chỉ dẫn đường đi" wide error={errs.directions} hint="Hiển thị cho hội viên/HLV ở chi tiết buổi học trên ứng dụng.">
          <textarea value={f.directions} onChange={(e) => setF({ ...f, directions: e.target.value })} placeholder="VD: Thang máy lên tầng 2, rẽ trái, phòng kính đầu tiên." maxLength={500} />
        </Field>
      </div>
      {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
    </Dialog>
  );
}
