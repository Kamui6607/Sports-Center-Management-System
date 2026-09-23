import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type RecordData } from "./api";
import { at, money } from "./config";
import { refundEstimate } from "./businessRules";
import { ErrorState, Modal } from "./ui";

export function CancelSubscription({
  subscription,
  role,
}: {
  subscription: {
    id: string;
    endDate: string;
    status: string;
    plan?: { price: string | number; durationDays: number };
  };
  role: "MEMBER" | "MANAGER";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api<RecordData>(
        role === "MEMBER"
          ? "PATCH /subscriptions/{id}/cancel"
          : "PATCH /subscriptions/{id}/status",
        {
          params: { id: subscription.id },
          body:
            role === "MEMBER"
              ? { reason: reason.trim() }
              : { status: "CANCELLED" },
        },
      ),
  });
  const estimate = refundEstimate(
    subscription.endDate,
    Number(subscription.plan?.price || 0),
    subscription.plan?.durationDays || 0,
    role,
  );
  const close = () => {
    setOpen(false);
    if (mutation.isSuccess) void cache.invalidateQueries();
  };
  if (subscription.status !== "ACTIVE" && !open) return null;
  return (
    <>
      <button
        className="button small danger-text"
        onClick={() => {
          mutation.reset();
          setReason("");
          setOpen(true);
        }}
      >
        Hủy gói
      </button>
      {open && (
        <Modal
          title={mutation.isSuccess ? "Đã hủy gói tập" : "Xác nhận hủy gói tập"}
          onClose={close}
          dismissible={!mutation.isPending}
          maxWidth={520}
        >
          {mutation.isSuccess ? (
            <div className="confirm-copy">
              <p className="success" role="status">
                Gói tập và các lượt đặt lớp tương lai đã được hủy.
              </p>
              <p>
                {mutation.data.data.willRefund
                  ? `Số tiền hoàn: ${money(mutation.data.data.refundAmount)}. Vui lòng liên hệ quầy để nhận tiền.`
                  : "Không phát sinh hoàn tiền."}
              </p>
              <p>
                Còn {String(at(mutation.data.data, "daysLeft") ?? 0)} ngày tại
                thời điểm hủy.
              </p>
            </div>
          ) : (
            <div className="confirm-copy">
              <p>
                Hủy{" "}
                <strong>
                  {String(at(subscription, "plan.name") || "gói tập")}
                </strong>{" "}
                sẽ chấm dứt quyền lợi và hủy toàn bộ lượt đặt lớp trong tương
                lai.
              </p>
              <p>
                {role === "MEMBER"
                  ? "Còn trên 15 ngày: hoàn 30% khoản thanh toán gốc. Còn từ 15 ngày trở xuống: không hoàn tiền."
                  : "Hoàn tiền theo tỷ lệ số ngày còn lại trên thời hạn gói gốc."}
              </p>
              <p>
                Dự kiến còn {estimate.daysLeft} ngày · Hoàn khoảng{" "}
                <strong>{money(estimate.refundAmount)}</strong>.
              </p>
              <p className="field-note">
                Ước tính theo giá gói hiện tại. Số tiền chính thức được xác định
                theo khoản thanh toán gốc và thời điểm xác nhận.
              </p>
              {role === "MEMBER" && (
                <label>
                  Lý do hủy (không bắt buộc)
                  <textarea
                    maxLength={500}
                    disabled={mutation.isPending}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}
          {mutation.error && <ErrorState error={mutation.error} />}
          <div className="modal-footer">
            <button
              className="button"
              disabled={mutation.isPending}
              onClick={close}
            >
              {mutation.isSuccess ? "Đóng" : "Giữ gói tập"}
            </button>
            {!mutation.isSuccess && (
              <button
                className="button danger"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Đang hủy…" : "Xác nhận hủy gói"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
