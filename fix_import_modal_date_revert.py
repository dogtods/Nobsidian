import re
from datetime import datetime

with open("src/components/ImportModal.tsx", "r") as f:
    content = f.read()

new_state = """const [gasSheetName, setGasSheetName] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  });"""

old_state = 'const [gasSheetName, setGasSheetName] = useState(() => localStorage.getItem("cn_gas_sheet_name") || "Notes");'

if new_state in content:
    content = content.replace(new_state, old_state)
    with open("src/components/ImportModal.tsx", "w") as f:
        f.write(content)
    print("Successfully reverted gasSheetName default state in ImportModal.tsx")
else:
    print("Could not find gasSheetName state definition.")
