import re
with open('src/server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'import \{ startSubscriptionLifecycleJob \} from "\./modules/subscriptions/subscription-lifecycle\.service\.js";\n', '', content)
content = re.sub(r'\s*startSubscriptionLifecycleJob\(\);\n', '\n', content)

with open('src/server.ts', 'w', encoding='utf-8') as f:
    f.write(content)
