import re

def clean_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = re.sub(r'import \{ ensureActiveFreeSubscription \} from "\.\./subscriptions/free-subscription\.service\.js";\n', '', content)
    content = re.sub(r'await ensureActiveFreeSubscription\(tx, memberProfile\.id\);\n', '', content)
    content = re.sub(r'await ensureActiveFreeSubscription\(tx, updatedUser\.memberProfile\.id\);\n', '', content)
    
    # Remove subscription check in users.service.ts
    content = re.sub(r'const activeSub = await tx\.membershipSubscription\.findFirst\(\{[\s\S]*?\}\);', 'const activeSub = null;', content)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

clean_file('src/modules/users/users.service.ts')
clean_file('src/modules/auth/auth.service.ts')
