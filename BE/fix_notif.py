import re
with open('src/modules/notifications/notifications.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('| "SUBSCRIPTION_EXPIRING"', '')
content = content.replace('| "SUBSCRIPTION_EXPIRED"', '')
content = content.replace('| "SUBSCRIPTION_CANCELLED"', '')

additions = '| "CLASS_APPROVED"\n  | "CLASS_REJECTED"\n  | "WITHDRAWAL_APPROVED"\n  | "WITHDRAWAL_REJECTED"'
content = content.replace('| "NEW_CLASS"', additions + '\n  | "NEW_CLASS"')

with open('src/modules/notifications/notifications.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)
