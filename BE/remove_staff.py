import os
import re

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return
    
    original = content
    # Remove "STAFF" from authorize(...) calls
    content = re.sub(r',\s*"STAFF"', '', content)
    content = re.sub(r'"STAFF"\s*,', '', content)
    # Remove STAFF from types/enums in schemas
    content = re.sub(r',\s*"STAFF"', '', content)
    content = re.sub(r'"STAFF"\s*,', '', content)
    
    # Remove STAFF from role checks
    content = content.replace(' || user.role === "STAFF"', '')
    content = content.replace('user.role === "STAFF" || ', '')
    content = content.replace(' || actor.role === "STAFF"', '')
    content = content.replace('actor.role === "STAFF" || ', '')
    content = content.replace(' || role === "STAFF"', '')
    content = content.replace('role === "STAFF" || ', '')
    
    # Remove STAFF array elements in chat.service.ts
    content = re.sub(r'\s*STAFF:\s*\[[^\]]*\],?\n', '\n', content)
    content = content.replace('"STAFF",', '')
    content = content.replace(', "STAFF"', '')
    
    # Update comments (just in case)
    content = content.replace('STAFF/MANAGER', 'MANAGER')
    content = content.replace('MANAGER/STAFF', 'MANAGER')
    content = content.replace('STAFF, MANAGER', 'MANAGER')
    content = content.replace('MANAGER, STAFF', 'MANAGER')
    content = content.replace('MEMBER, COACH, STAFF, MANAGER', 'MEMBER, COACH, MANAGER')
    content = content.replace('COACH/STAFF/MANAGER', 'COACH/MANAGER')
    
    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            process_file(os.path.join(root, file))

