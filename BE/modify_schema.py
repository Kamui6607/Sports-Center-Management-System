import re

with open('prisma/schema.prisma', 'r', encoding='utf-8') as f:
    schema = f.read()

# 1. UserRole STAFF
schema = schema.replace('  STAFF\n', '')

# 2. Delete Membership models and enums
schema = re.sub(r'enum MemberTier \{[^}]+\}\n*', '', schema)
schema = re.sub(r'enum MembershipStatus \{[^}]+\}\n*', '', schema)
schema = re.sub(r'model MembershipPlan \{[^}]+\}\n*', '', schema)
schema = re.sub(r'model MembershipSubscription \{[^}]+\}\n*', '', schema)

# 3. Update Class model
class_additions = """
  price       Decimal   @db.Decimal(12, 2) @default(0)
  status      ClassApprovalStatus @default(PENDING)
  createdById String?
  createdBy   User?     @relation("ClassCreatedBy", fields: [createdById], references: [id])
"""
schema = re.sub(r'(model Class \{[\s\S]*?)(  capacity  Int)', r'\1' + class_additions + r'\2', schema)

# 4. Add ClassApprovalStatus enum
enum_class_approval = """
enum ClassApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  COMPLETED
}
"""
schema = schema.replace('enum UserRole {', enum_class_approval + '\nenum UserRole {')

# 5. Remove subscriptions from MemberProfile
schema = re.sub(r'  subscriptions\s+MembershipSubscription\[\]\n', '', schema)

# 6. Payment changes
# Safely remove these lines
schema = re.sub(r'\s*subscriptionId\s+String\?\n', '\n', schema)
schema = re.sub(r'\s*subscription\s+MembershipSubscription\?\s+@relation[^\n]+\n', '\n', schema)
schema = re.sub(r'\s*planId\s+String\?\n', '\n', schema)
schema = re.sub(r'\s*plan\s+MembershipPlan\?\s+@relation[^\n]+\n', '\n', schema)
schema = re.sub(r'\s*planNameSnapshot\s+String\?\n', '\n', schema)
schema = re.sub(r'\s*planTierSnapshot\s+MemberTier\?\n', '\n', schema)
schema = re.sub(r'\s*durationDaysSnapshot\s+Int\?\n', '\n', schema)
schema = re.sub(r'\s*maxConcurrentClassesSnapshot\s+Int\?\n', '\n', schema)
schema = re.sub(r'\s*@@index\(\[subscriptionId\]\)\n', '\n', schema)

schema = schema.replace('  method          PaymentMethod\n', """  method          PaymentMethod
  classId         String?
  class           Class?                  @relation(fields: [classId], references: [id])
  classNameSnapshot String?
""")

schema = schema.replace('  payments      Payment[]\n', '') # from membership plan (already deleted, but just in case)

# Update Invoice
schema = schema.replace('  planName      String? // Copied from plan.name at time of issue\n', '  className     String? // Copied from class.name at time of issue\n')
schema = schema.replace('  planTier      String? // Copied from plan.tier at time of issue\n', '')

# 7. Add Wallet models
wallet_models = """
// ─────────────────────────────────────────
// COACH WALLET
// ─────────────────────────────────────────

model CoachWallet {
  id          String   @id @default(uuid())
  coachId     String   @unique
  coach       CoachProfile @relation(fields: [coachId], references: [id], onDelete: Cascade)
  balance     Decimal  @default(0) @db.Decimal(12, 2)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  transactions WalletTransaction[]
}

enum TransactionType {
  DEPOSIT
  WITHDRAWAL
}

enum TransactionStatus {
  PENDING
  COMPLETED
  REJECTED
  FAILED
}

model WalletTransaction {
  id          String            @id @default(uuid())
  walletId    String
  wallet      CoachWallet       @relation(fields: [walletId], references: [id], onDelete: Cascade)
  amount      Decimal           @db.Decimal(12, 2)
  type        TransactionType
  status      TransactionStatus @default(PENDING)
  classId     String?
  class       Class?            @relation(fields: [classId], references: [id], onDelete: SetNull)
  bankInfo    Json?
  note        String?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@index([walletId])
  @@index([status])
}
"""
schema += wallet_models

# Link CoachWallet to CoachProfile
schema = schema.replace('  classes       ClassMember[]\n', '  classes       ClassMember[]\n  wallet        CoachWallet?\n')

# Link User to created classes
schema = schema.replace('  createdPayments            Payment[]              @relation("PaymentCreatedBy")\n', '  createdPayments            Payment[]              @relation("PaymentCreatedBy")\n  createdClasses             Class[]                @relation("ClassCreatedBy")\n')

# Link Class to WalletTransaction and Payment
schema = schema.replace('  penalties   AttendancePenalty[]\n', '  penalties   AttendancePenalty[]\n  walletTransactions WalletTransaction[]\n  payments    Payment[]\n')

# 8. Update NotificationType
schema = schema.replace('  SUBSCRIPTION_EXPIRING // Gói sắp hết hạn (5 ngày trước)\n', '')
schema = schema.replace('  SUBSCRIPTION_EXPIRED // Gói đã hết hạn\n', '')
schema = schema.replace('  SUBSCRIPTION_CANCELLED // Gói bị hủy (kèm lý do)\n', '')
schema = schema.replace('  // ── Lớp học ──\n', '  // ── Lớp học ──\n  CLASS_APPROVED\n  CLASS_REJECTED\n  WITHDRAWAL_APPROVED\n  WITHDRAWAL_REJECTED\n')

with open('prisma/schema.prisma', 'w', encoding='utf-8') as f:
    f.write(schema)
