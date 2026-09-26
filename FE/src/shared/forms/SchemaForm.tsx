import { classSports } from "../sports";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { api, ApiError, contract } from "../api";
import type { RecordData, Schema } from "../api";
import { at, label } from "../config";
import { ErrorState, Loading } from "../feedback";
import { allPages } from "../pagedApi";
const lookupPaths: Record<string, string> = {
  sportId: "/sports",
  sportIds: "/sports",
  roomId: "/rooms",
  classId: "/classes",
  coachId: "/coaches",
};
function Lookup({
  name,
  value,
  onChange,
  required,
}: {
  name: string;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  required: boolean;
}) {
  const path = lookupPaths[name];
  const q = useQuery({
    queryKey: ["lookup", path],
    queryFn: async ({ signal }) => {
      return (await allPages<RecordData>("GET " + path, { signal })).data;
    },
  });
  return (
    <>
      {q.isPending && <Loading variant="field" text="Đang tải lựa chọn…" />}
      <select
        hidden={q.isPending}
        required={required}
        multiple={name === "sportIds"}
        size={name === "sportIds" ? 4 : undefined}
        value={value}
        onChange={(e) =>
          onChange(
            name === "sportIds"
              ? Array.from(e.target.selectedOptions, (o) => o.value)
              : e.target.value,
          )
        }
        disabled={q.isPending || q.isError}
      >
        {name !== "sportIds" && (
          <option value="">
            {q.isPending ? "Đang tải…" : "Chọn " + label(name).toLowerCase()}
          </option>
        )}
        {q.data?.map((row) => {
          const id = name === "coachId" ? at(row, "coachProfile.id") : row.id;
          return id ? (
            <option
              key={String(id)}
              value={String(id)}
              disabled={row.isActive === false && String(id) !== value}
            >
              {String(row.name || row.fullName)}
              {row.isActive === false ? " (ngừng hoạt động)" : ""}
            </option>
          ) : null;
        })}
      </select>
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {name === "coachId" && q.data?.some((r) => !at(r, "coachProfile.id")) && (
        <p className="field-note">
          Một số hồ sơ chưa được API cung cấp mã huấn luyện viên nên chưa thể
          chọn.
        </p>
      )}
    </>
  );
}
export function SchemaForm({
  operation,
  params,
  initial = {},
  fixed = {},
  choices = {},
  onBusyChange,
  onSuccess,
  onCancel,
}: {
  operation: string;
  params?: Record<string, string>;
  initial?: RecordData;
  fixed?: RecordData;
  choices?: Record<string, { value: string; label: string }[]>;
  onBusyChange?: (busy: boolean) => void;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const errorId = useId();
  const schema = contract[operation]?.body;
  const [values, setValues] = useState<RecordData>(() => ({
    ...Object.fromEntries(
      Object.entries(schema?.properties || {}).map(([k, s]) => [
        k,
        k === "areaTypes" && /\/sports(?:\/|$)/.test(operation)
          ? Array.isArray(initial[k])
            ? String(initial[k][0] || "INDOOR")
            : String(initial[k] || "INDOOR")
          : initial[k] ??
          (k === "sportIds"
            ? classSports(initial).map((s) => s.id)
            : k === "areaType" && operation === "POST /rooms"
              ? "INDOOR"
            : (s.default ?? "")),
      ]),
    ),
    ...fixed,
  }));
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  if (!schema)
    return <p>Swagger chưa cung cấp hợp đồng cập nhật cho chức năng này.</p>;
  const change = (k: string, v: unknown) =>
    setValues((prev) => ({ ...prev, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(undefined);
    const body: RecordData = {};
    for (const [k, s] of Object.entries(schema!.properties || {})) {
      if (
        ["fitnessGoal", "trainingLevel", "trainingPreference"].includes(k) &&
        values.role &&
        values.role !== "MEMBER"
      )
        continue;
      let v = values[k];
      if (v === "" || v === undefined || v === null) continue;
      if (s.type === "number" || s.type === "integer") v = Number(v);
      if (k === "areaTypes" && /\/sports(?:\/|$)/.test(operation)) {
        v = [String(v)];
      }
      if (s.format === "date-time") {
        if (!Number.isFinite(Date.parse(String(v)))) {
          setError(new Error("Ngày giờ không hợp lệ."));
          return;
        }
        v = new Date(String(v)).toISOString();
      }
      body[k] = typeof v === "string" && !/password/i.test(k) ? v.trim() : v;
    }
    const missing =
      schema!.required?.filter(
        (k) =>
          body[k] === undefined ||
          body[k] === "" ||
          (Array.isArray(body[k]) && !body[k].length),
      ) || [];
    if (missing.length) {
      setError(
        new ApiError(
          "Vui lòng điền đầy đủ thông tin bắt buộc.",
          400,
          missing.map((field) => ({ field, message: "Không được để trống." })),
        ),
      );
      return;
    }
    for (const [k, s] of Object.entries(schema!.properties || {})) {
      const v = body[k];
      if (v === undefined) continue;
      if (k === "sportIds" && (!Array.isArray(v) || v.length === 0)) {
        setError(new Error("Vui lòng chọn ít nhất một bộ môn cho lớp học."));
        return;
      }
      if (
        (s.minLength && String(v).length < s.minLength) ||
        (s.enum && !s.enum.includes(String(v)))
      ) {
        setError(new Error(`${label(k)} chưa hợp lệ.`));
        return;
      }
      if (
        ["number", "integer"].includes(s.type) &&
        (!Number.isFinite(v) ||
          (s.type === "integer" && !Number.isInteger(v)) ||
          (["price", "amount", "capacity", "durationDays"].includes(k) &&
            Number(v) <= 0) ||
          (k === "experienceYears" && Number(v) < 0))
      ) {
        setError(
          new Error(
            `${label(k)} phải là số hợp lệ và lớn hơn 0 (kinh nghiệm có thể bằng 0).`,
          ),
        );
        return;
      }
      if (
        k === "dateOfBirth" &&
        (!Number.isFinite(Date.parse(String(v))) ||
          Date.parse(String(v)) > Date.now())
      ) {
        setError(new Error("Ngày sinh phải hợp lệ và không ở tương lai."));
        return;
      }
      if (k === "phone" && !/^[0-9+\-() ]+$/.test(String(v))) {
        setError(
          new Error(
            "Số điện thoại chỉ được chứa số và dấu +, -, ngoặc hoặc khoảng trắng.",
          ),
        );
        return;
      }
      if (
        k === "capacity" &&
        / \/classes(?:\/|$)/.test(operation) &&
        Number(v) > 200
      ) {
        setError(new Error("Sĩ số lớp tối đa 200 học viên."));
        return;
      }
    }
    if (
      operation === "POST /training-plans" &&
      Date.parse(String(body.endDate)) <= Date.parse(String(body.startDate))
    ) {
      setError(new Error("Ngày kết thúc phải sau ngày bắt đầu kế hoạch."));
      return;
    }
    if (operation === "PATCH /class-schedules/{id}") {
      // Lifecycle actions must use their dedicated endpoints and confirmations.
      delete body.status;
      if (initial.status !== "SCHEDULED") {
        setError(new Error("Chỉ chỉnh sửa lịch đang mở."));
        return;
      }
    }
    if (
      body.startTime &&
      body.endTime &&
      String(body.startTime) >= String(body.endTime)
    ) {
      setError(new Error("Thời gian kết thúc phải sau thời gian bắt đầu."));
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      await api(operation, { params, body });
      onSuccess();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={busy}>
      {/POST \/subscriptions/.test(operation) && (
        <p className="confirm-copy">
          Chỉ lưu sau khi đã nhận đủ tiền. Hệ thống sẽ ghi nhận thanh toán thành
          công và xuất hóa đơn ngay. Đăng ký gói mới tạm dừng các gói đang hoạt
          động và cộng ngày dư vào gói mới; gia hạn tạo thêm một kỳ gói.
        </p>
      )}
      {operation === "POST /payments" && (
        <p className="confirm-copy">
          Đối chiếu khoản đã thu trước khi ghi nhận. Đăng ký và gia hạn gói đã
          tự tạo thanh toán; không ghi trùng khoản này.
        </p>
      )}
      <fieldset className="form-grid" disabled={busy}>
        {Object.entries(schema.properties || {})
          .filter(
            ([k]) =>
              !(operation === "PATCH /class-schedules/{id}" && k === "status"),
          )
          .filter(([k]) => !(k in fixed))
          .filter(
            ([k]) =>
              !["fitnessGoal", "trainingLevel", "trainingPreference"].includes(
                k,
              ) ||
              values.role === undefined ||
              values.role === "MEMBER",
          )
          .map(([k, s]) => {
            const required = Boolean(schema.required?.includes(k));
            const value = values[k];
            return (
              <label
                key={k}
                className={["description", "bio"].includes(k) ? "wide" : ""}
              >
                {label(k)}
                {required && <b className="required"> *</b>}
                {k === "areaTypes" && /\/sports(?:\/|$)/.test(operation) ? (
                  <select
                    required={required}
                    value={String(value)}
                    onChange={(e) => change(k, e.target.value)}
                  >
                    <option value="INDOOR">Trong nhà</option>
                    <option value="OUTDOOR">Ngoài trời</option>
                    <option value="POOL">Hồ bơi</option>
                  </select>
                ) : choices[k] ? (
                  <select
                    aria-invalid={
                      (error instanceof ApiError &&
                        error.errors?.some((e) => e.field === k)) ||
                      undefined
                    }
                    aria-describedby={error ? errorId : undefined}
                    required={required}
                    value={String(value)}
                    onChange={(e) => change(k, e.target.value)}
                  >
                    <option value="">Chọn {label(k).toLowerCase()}</option>
                    {choices[k].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : lookupPaths[k] ? (
                  <Lookup
                    name={k}
                    required={required}
                    value={
                      k === "sportIds"
                        ? Array.isArray(value)
                          ? value.map(String)
                          : []
                        : String(value || "")
                    }
                    onChange={(v) => change(k, v)}
                  />
                ) : s.type === "boolean" ? (
                  <select
                    aria-invalid={
                      (error instanceof ApiError &&
                        error.errors?.some((e) => e.field === k)) ||
                      undefined
                    }
                    aria-describedby={error ? errorId : undefined}
                    value={String(value)}
                    onChange={(e) =>
                      change(
                        k,
                        e.target.value === "" ? "" : e.target.value === "true",
                      )
                    }
                  >
                    <option value="">Không thay đổi</option>
                    <option value="true">Có</option>
                    <option value="false">Không</option>
                  </select>
                ) : s.enum ? (
                  <select
                    aria-invalid={
                      (error instanceof ApiError &&
                        error.errors?.some((e) => e.field === k)) ||
                      undefined
                    }
                    aria-describedby={error ? errorId : undefined}
                    required={required}
                    value={String(value)}
                    onChange={(e) => change(k, e.target.value)}
                  >
                    <option value="">Chọn {label(k).toLowerCase()}</option>
                    {s.enum.map((v) => (
                      <option key={v} value={v}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                ) : ["description", "bio", "fitnessGoal"].includes(k) ? (
                  <textarea
                    aria-invalid={
                      (error instanceof ApiError &&
                        error.errors?.some((e) => e.field === k)) ||
                      undefined
                    }
                    aria-describedby={error ? errorId : undefined}
                    value={String(value)}
                    required={required}
                    onChange={(e) => change(k, e.target.value)}
                  />
                ) : (
                  <input
                    aria-invalid={
                      (error instanceof ApiError &&
                        error.errors?.some((e) => e.field === k)) ||
                      undefined
                    }
                    aria-describedby={error ? errorId : undefined}
                    type={
                      s.format === "date-time"
                        ? "datetime-local"
                        : /password/i.test(k)
                          ? "password"
                          : k === "email"
                            ? "email"
                            : ["startDate", "dateOfBirth"].includes(k)
                              ? "date"
                              : s.type === "integer" || s.type === "number"
                                ? "number"
                                : "text"
                    }
                    value={
                      s.format === "date-time" && value
                        ? localDateTime(String(value))
                        : ["dateOfBirth", "startDate"].includes(k)
                          ? String(value).slice(0, 10)
                          : String(value)
                    }
                    onChange={(e) => change(k, e.target.value)}
                    required={required}
                    minLength={s.minLength}
                    min={
                      ["capacity", "durationDays"].includes(k)
                        ? 1
                        : ["price", "amount"].includes(k)
                          ? 0.01
                          : ["experienceYears"].includes(k)
                            ? 0
                            : undefined
                    }
                    step={
                      s.type === "integer"
                        ? 1
                        : s.type === "number"
                          ? "any"
                          : undefined
                    }
                    autoComplete={
                      /password/i.test(k) ? "new-password" : undefined
                    }
                  />
                )}
              </label>
            );
          })}
      </fieldset>
      {error != null && (
        <div id={errorId}>
          <ErrorState error={error} />
        </div>
      )}
      <div className="modal-footer">
        <button
          className="button"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          Hủy
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Check size={17} />
          )}{" "}
          {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
function localDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function FilterField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: Schema;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="filter-field">
      <span>{label(name)}</span>
      {schema.enum ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Tất cả</option>
          {schema.enum.map((v) => (
            <option key={v} value={v}>
              {label(v)}
            </option>
          ))}
        </select>
      ) : lookupPaths[name] ? (
        <Lookup
          name={name}
          required={false}
          value={value}
          onChange={(v) => onChange(String(v))}
        />
      ) : (
        <input
          type={
            /date/i.test(name)
              ? "date"
              : schema.format === "date-time"
                ? "datetime-local"
                : "search"
          }
          placeholder={label(name)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
