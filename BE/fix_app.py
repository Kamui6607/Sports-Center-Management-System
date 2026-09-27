import re

with open('src/app.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'import membershipPlanRoutes.*\n', '', content)
content = re.sub(r'import subscriptionRoutes.*\n', '', content)
content = re.sub(r'app\.use\(.*\$\{v1\}/membership-plans.*\n', '', content)
content = re.sub(r'app\.use\(.*\$\{v1\}/subscriptions.*\n', '', content)

with open('src/app.ts', 'w', encoding='utf-8') as f:
    f.write(content)
