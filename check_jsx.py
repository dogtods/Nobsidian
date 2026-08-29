import re
with open('src/components/ImportModal.tsx', 'r') as f:
    text = f.read()

m_tab2 = re.search(r'\{\s*/\*\s*TAB 2: Direct Sheet Extraction / File Import\s*\*/\s*\}.*?(?=\{\s*/\*\s*TAB 3: Prompts Configuration)', text, re.DOTALL)
if m_tab2:
    tab2_text = m_tab2.group(0)
    tags = re.findall(r'</?[a-zA-Z0-9]+[^>]*>', tab2_text)
    stack = []
    for tag in tags:
        tag_name = re.match(r'</?([a-zA-Z0-9]+)', tag).group(1)
        if tag.startswith('</'):
            if stack and stack[-1] == tag_name:
                stack.pop()
            else:
                pass
        elif re.search(r'/\s*>$', tag):
            pass
        else:
            stack.append(tag_name)
    print("Remaining stack:", stack)

