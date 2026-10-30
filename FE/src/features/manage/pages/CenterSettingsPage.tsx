import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api";
import { ErrorBox, Field, PageHead, Panel, Skeleton, fieldErrors, str } from "../kit";
import type { Row } from "../kit";

const FIELDS = ["name", "address", "mapUrl", "hotline", "email", "openingHours", "parkingNote", "description"] as const;
type Form = Record<(typeof FIELDS)[number], string>;

/** Cài đặt trung tâm: địa chỉ, bản đồ, giờ mở cửa, hotline — hiển thị cho hội viên/HLV trên ứng dụng di động. */
export default function CenterSettingsPage() {
  const cache = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "center"], queryFn: ({ signal }) => api<Row>("GET /center", { signal }) });
  const [f, setF] = useState<Form | null>(null);
  useEffect(() => {
    if (q.data && !f) setF(Object.fromEntries(FIELDS.map((k) => [k, str(q.data.data[k])])) as Form);
  }, [q.data, f]);
  const m = useMutation({
    mutationFn: (form: Form) =>
      api("PUT /center", {
        body: Object.fromEntries(FIELDS.map((k) => [k, form[k].trim() || (k === "name" || k === "address" ? form[k] : null)])),
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "center"] }),
  });
  const errs = fieldErrors(m.error);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((cur) => (cur ? { ...cur, [k]: e.target.value } : cur));
  const invalid = !f || f.name.trim().length < 2 || f.address.trim().length < 5;
  return (
    <>
      <PageHead eyebrow="Hệ thống" title="Cài đặt trung tâm" desc="Thông tin hiển thị ở mục “Địa điểm tập” trong chi tiết khóa học, buổi học và màn Thông tin trung tâm trên ứng dụng." />
      <Panel title="Địa chỉ & liên hệ">
        {q.isPending || !f ? (
          q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : <Skeleton rows={6} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!invalid) m.mutate(f);
            }}
            noValidate
          >
            <div className="cr-form">
              <Field label="Tên trung tâm" required error={errs.name}>
                <input value={f.name} onChange={set("name")} maxLength={120} />
              </Field>
              <Field label="Hotline" error={errs.hotline}>
                <input value={f.hotline} onChange={set("hotline")} maxLength={30} inputMode="tel" />
              </Field>
              <Field label="Địa chỉ" required wide error={errs.address} hint="Ghi theo địa giới mới: số nhà, đường, Phường/Xã, Tỉnh/Thành phố.">
                <input value={f.address} onChange={set("address")} maxLength={300} />
              </Field>
              <Field label="Link Google Maps" wide error={errs.mapUrl} hint="Bỏ trống ⇒ ứng dụng tự tìm theo địa chỉ.">
                <input value={f.mapUrl} onChange={set("mapUrl")} maxLength={500} placeholder="https://maps.app.goo.gl/…" />
              </Field>
              <Field label="Email liên hệ" error={errs.email}>
                <input type="email" value={f.email} onChange={set("email")} maxLength={120} />
              </Field>
              <Field label="Giờ mở cửa" error={errs.openingHours}>
                <input value={f.openingHours} onChange={set("openingHours")} maxLength={200} placeholder="05:30 – 22:00 hằng ngày" />
              </Field>
              <Field label="Gửi xe / lối vào" wide error={errs.parkingNote}>
                <textarea value={f.parkingNote} onChange={set("parkingNote")} maxLength={500} />
              </Field>
              <Field label="Giới thiệu" wide error={errs.description}>
                <textarea value={f.description} onChange={set("description")} maxLength={1000} />
              </Field>
            </div>
            {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
              <button className="cr-btn primary" disabled={m.isPending || invalid}>
                {m.isPending ? "Đang lưu…" : "Lưu thông tin"}
              </button>
              {q.data?.data.mapLink ? (
                <a className="cr-btn ghost" href={str(q.data.data.mapLink)} target="_blank" rel="noreferrer">
                  Xem trên bản đồ
                </a>
              ) : null}
            </div>
          </form>
        )}
      </Panel>
    </>
  );
}
