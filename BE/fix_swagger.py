import re
with open('src/config/swagger.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('role: \n', 'role: "MEMBER",\n')

with open('src/config/swagger.ts', 'w', encoding='utf-8') as f:
    f.write(content)
