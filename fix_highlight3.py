import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Replace reportNodes!.has(srcId) || reportNodes!.has(tgtId)
# with reportNodes!.has(srcId) && reportNodes!.has(tgtId)

content = content.replace(
    "return reportNodes!.has(srcId) || reportNodes!.has(tgtId);",
    "return reportNodes!.has(srcId) && reportNodes!.has(tgtId);"
)

content = content.replace(
    "return sf === selFolderClean || tf === selFolderClean || (hasReportNodes && (reportNodes!.has(srcId) || reportNodes!.has(tgtId)));",
    "return sf === selFolderClean || tf === selFolderClean || (hasReportNodes && (reportNodes!.has(srcId) && reportNodes!.has(tgtId)));"
)

content = content.replace(
    "return (hasReportNodes && (reportNodes!.has(srcId) || reportNodes!.has(tgtId)));",
    "return (hasReportNodes && (reportNodes!.has(srcId) && reportNodes!.has(tgtId)));"
)


with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed highlight logic!")
