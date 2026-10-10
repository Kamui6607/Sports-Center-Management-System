# THIẾT KẾ NGHIỆP VỤ CỬA HÀNG (MUA SẢN PHẨM)

> Phạm vi: Backend `BE/` (Express 5 + Prisma + Zod) và Mobile `Mobile/` (Flutter).
> Web (`FE/`) **không** gọi API cửa hàng nào (đã kiểm tra `FE/src`: chỉ dùng `/payments`, `/payments/sepay/*`) ⇒
> mọi thay đổi dưới đây không làm hỏng Web. Endpoint cũ của `/products` được giữ nguyên (chỉ thêm field).

---

## 1. Khảo sát hiện trạng (trước khi sửa)

| Thành phần | Hiện có | Ghi chú |
|---|---|---|
| `Product` | `name, description, price, stockQuantity, imageUrl, rating, reviewCount, isActive, createdById` | `stockQuantity` = số còn bán được (đã trừ hàng đang giữ) |
| `ProductReview` | `productId, userId, rating, comment` — **UNIQUE(productId, userId)** | Điều kiện: từng có đơn `SUCCESS` chứa sản phẩm |
| `Order` | `userId, totalPrice, status (PENDING/SUCCESS/CANCELLED), cancelReason (BUYER/EXPIRED/MANAGER)` | Không có mã đơn, hình thức nhận hàng, người nhận |
| `OrderItem` | `orderId, productId, quantity, unitPrice, totalAmount` — UNIQUE(orderId, productId) | **Đây chính là chi tiết đơn** ⇒ không tạo `OrderDetail` |
| `Payment` | `orderId @unique`, `transactionCode` (mã CK SePay), `status`, `activationStatus/reviewReason` | Một đơn ↔ một giao dịch |
| SePay | `createOrderSepayCheckout` (giữ hàng bằng `updateMany stockQuantity >= qty`), webhook HMAC/API key, ledger `SepayBankTransaction`, `SepayWebhookEvent` (idempotent), đối soát API, mock-confirm | Lệch tiền ⇒ `MISMATCH`; tiền về muộn ⇒ `LATE` + `REQUIRES_REVIEW` |
| Job | `expireStaleOrders` mỗi 60s (server.ts) — `closePendingOrder` khóa advisory theo payment, đọc lại sau lock | Idempotent, an toàn nhiều instance |
| `Refund` | Chỉ cho khóa học (`memberId` bắt buộc, lý do `MEMBER_CANCEL_COURSE` / `SESSION_CANCELLED`) | Manager chuyển khoản tay rồi duyệt |
| Notification | Outbox `enqueueNotification` + `flushNotificationOutbox`, socket `notification:new` | |
| Endpoint | `GET /products`, `GET /products/:id`, `POST/PATCH/DELETE /products` (Manager), `POST /products/orders`, `POST /products/orders/:id/cancel`, `GET /products/my/orders`, `POST /products/:id/reviews` | |
| Mobile | `features/products` (S01 cửa hàng, S02 chi tiết + "Mua ngay" 1 sản phẩm, S03 đơn hàng), `features/payments` (màn VietQR polling), mock `ProductOrderRow` 1 sản phẩm/đơn | Không có giỏ, địa chỉ, màn Manager cửa hàng |

Vai trò hệ thống chỉ có `MEMBER`, `COACH`, `MANAGER` (không có STAFF) ⇒ chỉ **MANAGER** xử lý đơn / xác nhận nhận hàng.
Người mua: `MEMBER` và `COACH` (theo `Doc/PROJECT_OVERVIEW.md` §3.4).

---

## 2. Mô hình dữ liệu

Nguyên tắc: **mở rộng bảng có sẵn**, chỉ thêm bảng còn thiếu. Migration: `BE/prisma/migrations/20261011000000_shop_flow/migration.sql`.

### 2.1 Bảng mới

| Bảng | Field chính | Ràng buộc |
|---|---|---|
| `Cart` | `userId` | UNIQUE(userId) — một giỏ/người |
| `CartItem` | `cartId, productId, quantity, unitPriceSnapshot` | UNIQUE(cartId, productId). Giỏ **không giữ tồn kho**; `unitPriceSnapshot` = giá lúc thêm (phát hiện "giá đã đổi") |
| `UserAddress` | `userId, recipientName, phone, province, district, ward, street, isDefault` | Tối đa 10 địa chỉ/người; đúng 1 mặc định |
| `OrderStatusHistory` | `orderId, fromStatus?, toStatus, actorId?, reason?` | Ghi ở MỌI lần chuyển trạng thái (actor null = hệ thống) |
| `InventoryTransaction` | `productId, type (IN/RESERVE/RELEASE/SALE/RETURN/ADJUST), quantity, stockAfter, reservedAfter, orderId?, actorId?, note?` | Nhật ký kho bất biến |

### 2.2 Mở rộng bảng có sẵn

**`Product`**: `reservedStock` (đang giữ cho đơn chờ thanh toán), `imageUrls String[]`, `maxPerOrder` (mặc định 10),
`maxPerDay` (mặc định 20/người/ngày), `lowStockThreshold` (mặc định 5). `isActive`, `imageUrl` đã có.
- **Đổi nghĩa** `stockQuantity` ⇒ *tồn thực tế trên kệ*. Có thể bán = `stockQuantity − reservedStock` (API trả thêm `availableStock`).
- Migration chuyển dữ liệu: với mỗi sản phẩm, `reservedStock = Σ qty đơn PENDING`, `stockQuantity += Σ qty đơn PENDING` (trước đây đã trừ khi giữ).

**`Order`** (giữ `totalPrice` = tổng tiền cuối cùng để tương thích):
`code` (UNIQUE, dạng `DH241011-7KQ3XM`), `fulfillmentType` (PICKUP | DELIVERY), `subtotal`, `shippingFee`,
`recipientName`, `recipientPhone`, `shippingAddress`, `shippingProvince` (snapshot), `note`, `paymentExpiresAt`,
`pickupCodeHash`, `pickupCodeNonce`, `pickupDeadline`, `pickupFailedAttempts`, `pickupLockedUntil`,
`trackingCode`, `carrier`, `cancelNote`, `cancelledById`, `idempotencyKey` + `idempotencyHash` (UNIQUE(userId, idempotencyKey)),
mốc thời gian `paidAt, processingAt, readyAt, shippedAt, deliveredAt, completedAt, cancelledAt, expiredAt, notPickedUpAt, refundedAt`.

**`OrderItem`**: thêm snapshot `productName`, `productImageUrl` (đã có `unitPrice`, `quantity`, `totalAmount`).

**`ProductReview`**: thêm `orderItemId` (UNIQUE — mỗi dòng đơn tối đa 1 đánh giá), `isHidden`, `hiddenReason`, `hiddenById`, `hiddenAt`.
Bỏ UNIQUE(productId, userId) (mua lại lần sau được đánh giá dòng mới). Đánh giá cũ giữ `orderItemId = null`.

**`Refund`**: thêm `orderId?`, `memberId` thành **nullable** (HLV mua hàng không có hồ sơ hội viên), lý do mới
`ORDER_CANCELLED`, `ORDER_NOT_PICKED_UP`, `ORDER_LATE_PAYMENT`.

**`User`**: `checkoutLockedUntil` (tạm khóa đặt hàng do để đơn hết hạn nhiều lần).

**Enum `OrderStatus`** (thay toàn bộ): `PENDING_PAYMENT, PAID, PROCESSING, READY_FOR_PICKUP, SHIPPING, DELIVERED, COMPLETED,
EXPIRED, CANCELLED, NOT_PICKED_UP, REFUND_REQUESTED, REFUNDED`.
Chuyển dữ liệu cũ: `PENDING → PENDING_PAYMENT`, `SUCCESS → COMPLETED` (luồng cũ không có giao hàng — đơn đã trả tiền
là kết thúc, giữ quyền đánh giá), `CANCELLED` có `cancelReason = EXPIRED → EXPIRED`, còn lại `CANCELLED`.
Đơn cũ được gán `code = 'DH' || 8 ký tự đầu id`, `fulfillmentType = PICKUP`, `subtotal = totalPrice`, `shippingFee = 0`.

**Enum `NotificationType`**: thêm `ORDER_UPDATED`.

### 2.3 Cấu hình cửa hàng (`BE/src/config/shop.ts`, đọc env, có mặc định)

| Env | Mặc định | Ý nghĩa |
|---|---|---|
| `SHOP_HOLD_MINUTES` | `VIETQR_PAYMENT_TTL_MINUTES` (15) | Thời gian giữ hàng chờ thanh toán |
| `SHOP_MAX_PENDING_ORDERS` | 2 | Số đơn chờ thanh toán tối đa / người |
| `SHOP_PICKUP_DAYS` | 3 | Số ngày giữ hàng tại quầy |
| `SHOP_SHIPPING_FEE` | 30000 | Phí giao hàng |
| `SHOP_FREE_SHIPPING_THRESHOLD` | 500000 | Miễn phí ship khi tạm tính ≥ ngưỡng (0 = tắt) |
| `SHOP_DELIVERY_PROVINCES` | `Hồ Chí Minh` | Khu vực giao (phân tách `,`, so khớp không dấu) |
| `SHOP_EXPIRE_LOCK_THRESHOLD` | 3 | Số đơn để hết hạn trong 24h ⇒ khóa |
| `SHOP_EXPIRE_LOCK_HOURS` | 24 | Thời gian khóa đặt hàng |
| `SHOP_NOT_PICKED_UP_REFUND_PERCENT` | 100 | % tiền hoàn khi khách không đến lấy |
| `SHOP_AUTO_COMPLETE_DAYS` | 3 | DELIVERED quá N ngày ⇒ tự COMPLETED |
| `SHOP_PICKUP_MAX_ATTEMPTS` / `SHOP_PICKUP_LOCK_MINUTES` | 5 / 15 | Khóa xác nhận nhận hàng sau N lần sai |

`GET /shop/config` trả các giá trị này cho app hiển thị.

---

## 3. Máy trạng thái

```
                    ┌────────────► EXPIRED (job, nhả hàng)
                    ├────────────► CANCELLED (khách/Manager, nhả hàng)
PENDING_PAYMENT ────┤
                    └─(SePay đủ tiền)─► PAID ──┬─ PICKUP ──► READY_FOR_PICKUP ──(quét mã + 4 số SĐT)──► COMPLETED
                                               │                 └──(quá hạn N ngày)──► NOT_PICKED_UP ──(duyệt hoàn)──► REFUNDED
                                               ├─ DELIVERY ─► PROCESSING ─► SHIPPING (bắt buộc trackingCode) ─► DELIVERED ─► COMPLETED
                                               │                                                     (khách xác nhận / Manager / tự động N ngày)
                                               └─ khách yêu cầu hoàn (hoặc Manager hủy) ─► REFUND_REQUESTED ─┬─(duyệt)──► REFUNDED (trả kho)
                                                                                                             └─(từ chối)─► trạng thái trước đó
```

Bảng chuyển hợp lệ (mọi thứ khác ⇒ `409 ORDER_INVALID_TRANSITION`):

| Từ | Sang | Ai |
|---|---|---|
| PENDING_PAYMENT | PAID | Hệ thống (webhook/mock/đối soát, đủ tiền) |
| PENDING_PAYMENT | EXPIRED | Job hết hạn |
| PENDING_PAYMENT | CANCELLED | Khách / Manager |
| PAID | READY_FOR_PICKUP (PICKUP) / PROCESSING (DELIVERY) | Manager |
| PAID, PROCESSING, READY_FOR_PICKUP | REFUND_REQUESTED | Khách (chỉ từ PAID) / Manager ("hủy & hoàn tiền") |
| PROCESSING | SHIPPING (bắt buộc `trackingCode`) | Manager |
| SHIPPING | DELIVERED | Manager |
| DELIVERED | COMPLETED | Khách ("đã nhận hàng") / Manager / Job sau `SHOP_AUTO_COMPLETE_DAYS` |
| READY_FOR_PICKUP | COMPLETED | Manager — chỉ qua API xác nhận mã nhận hàng |
| READY_FOR_PICKUP | NOT_PICKED_UP | Job khi quá `pickupDeadline` / Manager |
| REFUND_REQUESTED, NOT_PICKED_UP | REFUNDED | Hệ thống khi Manager duyệt hoàn tiền |
| REFUND_REQUESTED | (trạng thái trước) | Hệ thống khi Manager từ chối hoàn tiền |

Mỗi lần chuyển: `UPDATE … WHERE id = ? AND status = <from>` (CAS, chống 2 thao tác đồng thời) + ghi `OrderStatusHistory` +
outbox notification `ORDER_UPDATED` cho người mua (socket `notification:new`).

**Thanh toán**: bắt buộc trả trước VietQR/SePay cho cả PICKUP và DELIVERY. **Không** COD, **không** "đặt trước trả tại quầy".

**Hủy**: trước PAID ⇒ khách hủy tự do, nhả hàng. PAID (chưa PROCESSING/READY) ⇒ khách gửi yêu cầu hoàn tiền (luồng `Refund`
có sẵn, Manager chuyển khoản tay rồi duyệt). Từ PROCESSING/READY trở đi khách không tự hủy; từ SHIPPING không ai hủy được.

---

## 4. Tồn kho

| Sự kiện | `stockQuantity` | `reservedStock` | `InventoryTransaction` |
|---|---|---|---|
| Manager nhập hàng / tạo sản phẩm | +q | | IN |
| Manager điều chỉnh (kiểm kê, hư hỏng) | ±q (không thấp hơn `reservedStock`) | | ADJUST |
| Tạo đơn | | +q (điều kiện `stock − reserved ≥ q`) | RESERVE |
| Hết hạn / hủy trước PAID | | −q | RELEASE |
| Thanh toán thành công (PAID) | −q | −q | SALE |
| Hoàn tiền đơn đã PAID (hàng chưa giao) / không đến lấy | +q | | RETURN |

Giữ hàng chạy trong transaction bằng **một câu UPDATE có điều kiện** (`$executeRaw`), theo thứ tự `productId` cố định (chống deadlock) ⇒
hai người cùng mua món cuối: chỉ một câu UPDATE khớp, người kia nhận `409 OUT_OF_STOCK`.
`PATCH /products/:id` với `stockQuantity` (API cũ) vẫn dùng được: tự ghi ADJUST và chặn thấp hơn `reservedStock`.

---

## 5. Chống phá & gian lận

| Rủi ro | Biện pháp | Mã lỗi |
|---|---|---|
| Giữ hàng ảo | Chỉ giữ khi tạo đơn; giỏ không giữ; hết hạn 15 phút ⇒ job nhả hàng | — |
| Spam đơn chờ | Tối đa `SHOP_MAX_PENDING_ORDERS` đơn PENDING_PAYMENT / người (đếm sau `lockUserOrder`) | 409 `PENDING_ORDER_LIMIT` |
| Gom hàng | `maxPerOrder` mỗi sản phẩm mỗi đơn; `maxPerDay` mỗi sản phẩm / người / ngày (giờ VN, tính đơn chưa EXPIRED/CANCELLED) | 400 `MAX_PER_ORDER_EXCEEDED`, `DAILY_LIMIT_EXCEEDED` |
| Để đơn hết hạn liên tục | ≥ 3 đơn EXPIRED trong 24h ⇒ `User.checkoutLockedUntil = now + 24h` | 403 `CHECKOUT_LOCKED` (+ `lockedUntil`) |
| Sửa giá phía client | Server tự tính đơn giá/tạm tính/phí ship/tổng; bỏ qua giá client. Client gửi `expectedTotal` (tổng đã xem) — lệch ⇒ báo lại | 409 `PRICE_CHANGED` (+ `preview`) |
| Sản phẩm ngừng bán / hết hàng | Kiểm tra lại lúc checkout | 400 `PRODUCT_INACTIVE`, 409 `OUT_OF_STOCK` |
| Bấm đặt 2 lần / retry mạng | Header `Idempotency-Key` bắt buộc; cùng key ⇒ trả lại đơn cũ; cùng key khác nội dung ⇒ lỗi | 409 `IDEMPOTENCY_KEY_REUSED` |
| Spam API | Rate limit theo user (bộ nhớ tiến trình): giỏ 60/phút, checkout 10/phút, đánh giá 5/phút, tra mã nhận hàng 30/phút | 429 `RATE_LIMITED` |
| Webhook giả / lặp | HMAC hoặc API key; `sepayId` UNIQUE + ledger `externalId` UNIQUE (có sẵn) | 401 |
| Chuyển thiếu/thừa tiền | Không chuyển PAID; `MISMATCH` + ghi chú đối soát thủ công (có sẵn) | — |
| Tiền về sau khi đơn EXPIRED/CANCELLED | Không khôi phục đơn; `LATE` + `REQUIRES_REVIEW` + **tự tạo Refund `ORDER_LATE_PAYMENT`** để Manager hoàn | — |
| Đoán mã nhận hàng | Mã 8 ký tự ngẫu nhiên (`crypto`), DB chỉ lưu `SHA-256`; mã hiển thị cho chủ đơn được tính lại bằng HMAC(secret, id:nonce); dùng một lần (đơn → COMPLETED); cần thêm 4 số cuối SĐT; sai 5 lần ⇒ khóa 15 phút | 400 `PICKUP_CODE_INVALID`, 423 `PICKUP_LOCKED`, 400 `PHONE_MISMATCH` |
| IDOR | Mọi endpoint theo id của khách lọc `userId = req.user.id` (404 nếu không phải của mình — không lộ tồn tại) | 404 |
| Đánh giá ảo | Chỉ `OrderItem` thuộc đơn COMPLETED của chính mình, 1 đánh giá/dòng; Manager ẩn/hiện; điểm TB không tính đánh giá ẩn | 403 `REVIEW_NOT_ALLOWED`, 409 `REVIEW_EXISTS` |
| Job chạy nhiều instance | Mỗi đơn xử lý trong transaction riêng: khóa advisory theo payment + đọc lại trạng thái + CAS `WHERE status = …` ⇒ chạy lặp/đồng thời vô hại | — |

---

## 6. API

Module mới `BE/src/modules/shop` mount tại `/api/v1/shop`. Envelope chuẩn `{ success, message, data, pagination? }`; lỗi nghiệp vụ `errors: { code, … }`.

| Method & path | Quyền | Mô tả |
|---|---|---|
| `GET /shop/config` | công khai | Cấu hình hiển thị |
| `GET /shop/cart` | MEMBER, COACH | Giỏ + cảnh báo từng dòng (`OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `MAX_PER_ORDER_EXCEEDED`, `PRICE_CHANGED`, `PRODUCT_INACTIVE`) + `count` |
| `POST /shop/cart/items` `{productId, quantity}` | " | Thêm (cộng dồn) |
| `PATCH /shop/cart/items/:productId` `{quantity}` | " | Sửa số lượng |
| `DELETE /shop/cart/items/:productId` | " | Xóa dòng |
| `DELETE /shop/cart` | " | Xóa giỏ |
| `POST /shop/cart/accept-prices` | " | Chấp nhận giá hiện tại (xóa cảnh báo giá đổi) |
| `GET/POST /shop/addresses`, `PATCH/DELETE /shop/addresses/:id`, `POST /shop/addresses/:id/default` | " | Sổ địa chỉ |
| `POST /shop/checkout/preview` | " | Xem trước (không ghi): dòng, tạm tính, phí ship, tổng, cảnh báo, `canCheckout` |
| `POST /shop/checkout` + header `Idempotency-Key` | " | Tạo đơn (giỏ: `mode=CART, productIds?` — chỉ xóa các dòng đã đặt; mua ngay: `mode=BUY_NOW, items` — không đụng giỏ) ⇒ `{ order, checkout }` (VietQR) |
| `GET /shop/orders?status=&page=` | " | Đơn của tôi (lọc nhóm trạng thái) |
| `GET /shop/orders/:id` | " | Chi tiết: items (+ quyền đánh giá), history, payment, `pickup { code, qrPayload, deadline }` khi READY |
| `POST /shop/orders/:id/cancel` `{reason?}` | " | Hủy đơn PENDING_PAYMENT |
| `POST /shop/orders/:id/request-refund` `{reason}` | " | Đơn PAID ⇒ REFUND_REQUESTED + Refund PENDING |
| `POST /shop/orders/:id/confirm-received` | " | DELIVERED ⇒ COMPLETED |
| `POST /shop/order-items/:id/review` `{rating, comment?}` | " | Đánh giá dòng đơn COMPLETED |
| `GET /shop/manage/orders?status=&fulfillmentType=&search=&page=` | MANAGER | Danh sách đơn |
| `GET /shop/manage/orders/:id` | MANAGER | Chi tiết (không lộ mã nhận hàng) |
| `GET /shop/manage/summary` | MANAGER | Đếm theo trạng thái + số sản phẩm sắp hết |
| `POST /shop/manage/orders/:id/status` `{status, reason?, trackingCode?, carrier?}` | MANAGER | Chuyển trạng thái (theo bảng §3) |
| `POST /shop/manage/pickup/verify` `{code}` | MANAGER | Tra mã (QR/nhập tay) ⇒ tóm tắt đơn để đối chiếu, SĐT che |
| `POST /shop/manage/orders/:id/pickup` `{code, phoneLast4}` | MANAGER | Xác nhận giao tại quầy ⇒ COMPLETED |
| `GET /shop/manage/inventory?lowStock=&search=&page=` | MANAGER | Tồn kho (stock, reserved, available, cảnh báo) |
| `POST /shop/manage/inventory/:productId` `{type: IN\|ADJUST, quantity, note}` | MANAGER | Nhập / điều chỉnh (ghi nhật ký) |
| `GET /shop/manage/inventory/:productId/transactions` | MANAGER | Nhật ký kho |
| `GET /shop/manage/reviews?productId=&hidden=` / `PATCH /shop/manage/reviews/:id` `{isHidden, reason?}` | MANAGER | Ẩn/hiện đánh giá |

Endpoint cũ (giữ, chỉ thêm field):
- `POST /products/orders` `{items}` ⇒ vẫn chạy, tạo đơn **PICKUP** qua cùng service (áp đủ giới hạn), người nhận lấy từ hồ sơ.
- `POST /products/orders/:id/cancel`, `GET /products/my/orders` ⇒ giữ; response thêm field mới; `status` theo enum mới.
- `POST /products/:id/reviews` ⇒ giữ; điều kiện mới: có dòng đơn COMPLETED chưa đánh giá (tự chọn dòng cũ nhất, hoặc `orderItemId`).
- `GET /products`, `GET /products/:id` ⇒ thêm `availableStock`, `reservedStock`, `maxPerOrder`, `maxPerDay`, `imageUrls`; đánh giá ẩn không trả cho người không phải Manager.

Webhook/`mock-confirm`/`GET /payments/sepay/:id` không đổi hợp đồng; với đơn hàng `expiresAt` lấy từ `Order.paymentExpiresAt`,
`order` trong response thêm `code`, `fulfillmentType`.

---

## 7. Mobile

- **S01 Cửa hàng**: icon giỏ có badge (số dòng) trên header; thẻ sản phẩm hiển thị ảnh thật (placeholder khi thiếu), "Hết hàng"/"Còn N".
- **S02 Chi tiết**: ảnh, tồn kho khả dụng, "Tối đa N/đơn", stepper giới hạn theo `min(available, maxPerOrder)`, nút **Thêm vào giỏ** + **Mua ngay**.
- **S05 Giỏ hàng** (mới): dòng + stepper + xóa, cảnh báo từng dòng, chọn dòng để đặt, "Cập nhật giá", tổng tạm tính.
- **S06 Thanh toán** (mới): Nhận tại trung tâm / Giao hàng, sổ địa chỉ (chọn/thêm/sửa), người nhận + SĐT, ghi chú, phí ship, tổng ⇒ đặt ⇒ màn VietQR có sẵn.
- **S07 Sổ địa chỉ** (mới).
- **S03 Đơn của tôi** (viết lại): tab Chờ thanh toán / Đang xử lý / Hoàn tất / Đã hủy-hoàn; **S08 Chi tiết đơn**: timeline lịch sử, QR + mã nhận hàng, mã vận đơn, hủy / yêu cầu hoàn tiền / đã nhận hàng, đánh giá từng dòng.
- **Manager** (mở từ Tổng quan): **R10 Đơn hàng** (lọc trạng thái/hình thức), **R11 Chi tiết đơn** (chuyển trạng thái, nhập vận đơn), **R12 Quét mã nhận hàng** (camera + nhập tay, đối chiếu + 4 số SĐT), **R13 Tồn kho** (cảnh báo sắp hết, nhập/điều chỉnh, nhật ký), ẩn/hiện đánh giá ngay ở chi tiết sản phẩm.
- Mã lỗi nghiệp vụ §5 ⇒ thông điệp tiếng Việt trong `ShopErrors` (fallback `message` BE).
- Mock (`USE_MOCK=true`) mô phỏng đủ: giỏ, địa chỉ, checkout + giới hạn, hết hạn/khóa, thanh toán giả lập, xử lý của Manager, mã nhận hàng, tồn kho, đánh giá.

---

## 8. Quyết định & lý do

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Giữ tên `stockQuantity` nhưng đổi nghĩa thành tồn thực tế, thêm `reservedStock` | Không đổi tên cột/field API (tương thích); Web không dùng |
| D2 | `SUCCESS` cũ ⇒ `COMPLETED` | Luồng cũ không có giao hàng: đã thanh toán = kết thúc; giữ quyền đánh giá của người đã mua |
| D3 | SALE (trừ tồn thực) tại PAID, không đợi COMPLETED | Hàng đã thuộc khách; tồn thực khớp với kệ sau khi soạn; hoàn tiền trước khi giao ⇒ RETURN |
| D4 | Hoàn tiền đơn dùng bảng `Refund` có sẵn (thêm `orderId`, `memberId` nullable) | Không tạo luồng hoàn thứ hai; Manager duyệt ở cùng màn |
| D5 | Không làm RETURN_REQUESTED (đổi trả sau giao) | Hàng phụ trợ giá trị thấp; khiếu nại qua chat/Manager — tránh luồng chưa có yêu cầu cụ thể |
| D6 | Mã nhận hàng: DB lưu hash, mã hiển thị tính lại bằng HMAC(`JWT_ACCESS_SECRET`, id:nonce) | Đáp ứng "lưu hash" mà chủ đơn vẫn xem lại được mã; lộ DB không lộ mã |
| D7 | Rate limit trong bộ nhớ tiến trình | Không thêm package/hạ tầng; giới hạn nghiệp vụ quan trọng (đơn chờ, số lượng/ngày, khóa) đều kiểm tra trong DB nên vẫn đúng khi nhiều instance |
| D8 | `expectedTotal` thay vì so từng giá trong giỏ | Một cơ chế cho cả giỏ và mua ngay; bắt được cả đổi giá lẫn đổi phí ship |
| D9 | Phí ship phẳng + miễn phí theo ngưỡng + danh sách tỉnh | Đủ cho trung tâm một địa điểm; cấu hình qua env |

---

## 9. Kết quả triển khai (11/10/2026)

| Hạng mục | Kết quả |
|---|---|
| Migration | `BE/prisma/migrations/20261011000000_shop_flow/migration.sql` — sinh từ `prisma migrate diff` (DB local ↔ schema mới) rồi viết tay phần chuyển dữ liệu; **đã áp trên DB local** (kèm đơn cũ giả lập PENDING/SUCCESS/CANCELLED để kiểm tra chuyển đổi, sau đó xóa); `migrate diff` sau khi áp = 0; **chưa áp lên Render** (hướng dẫn: `BE_API_CHANGES.md` §12) |
| BE | Module `src/modules/shop`, `src/config/shop.ts`, `src/middlewares/rateLimit.ts`; products/payments(SePay)/refunds/notifications/server job nối vào máy trạng thái |
| Kiểm thử BE | `npm run test:local -- shop` **105/105**; `npm run test:smoke:shop:local` **23/23** (PICKUP, DELIVERY, hết hạn qua job thật của server); 3 bộ cũ **136/136**, smoke cũ **37/37**; `tsc` sạch |
| Mobile | Feature `lib/features/shop` (giỏ, thanh toán, sổ địa chỉ, đơn của tôi + chi tiết, Manager: đơn, chi tiết, quét mã, tồn kho), mock đầy đủ luồng |
| Kiểm thử Mobile | `flutter analyze` **0 issue**; `flutter test` **108 pass** (repository API + `cartProvider` + luồng mock + quét mọi màn mới ở 3 cỡ màn hình/cỡ chữ); test live với BE thật **5/5**; `flutter build apk --debug` **thành công** |
| Web | Không sửa `FE/`; `git diff -- FE` rỗng |

### Sai khác so với thiết kế ban đầu (đã chọn phương án an toàn)

| # | Điểm | Cách làm | Lý do |
|---|---|---|---|
| X1 | API cũ `POST /products/orders` không có SĐT người nhận | Cho phép thiếu SĐT; khi giao tại quầy chỉ đối chiếu mã (vẫn hash + dùng một lần + khóa sau 5 lần sai) | Giữ tương thích; app mới luôn gửi SĐT |
| X2 | Giới hạn số đơn chờ thanh toán | Kiểm tra trong transaction sau `lockUserOrder` (trả kèm danh sách đơn chờ để app mở lại) — xem trước chỉ cảnh báo | Tránh 2 request song song cùng lọt |
| X3 | Rate limit | Theo user, trong bộ nhớ; tắt được bằng `RATE_LIMIT_DISABLED=true` (chỉ dùng khi test tải) | D7 |
