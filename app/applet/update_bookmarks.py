with open("src/App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Sidebar indicator bookmark
old_sidebar_ind = '''                           {bookmarkedIds.includes(n.id) && (
                             <Bookmark className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                           )}'''
new_sidebar_ind = '''                           {bookmarkedIds.includes(n.id) && (
                             <span className="text-amber-400 shrink-0 text-xs select-none">🔖</span>
                           )}'''

# 2. Sidebar button
old_sidebar_btn = '''                             <button
                               onClick={(e) => toggleBookmark(n.id, e)}
                               className="border-0 bg-transparent text-[var(--muted)] hover:text-amber-400 p-0.5 cursor-pointer"
                               title={bookmarkedIds.includes(n.id) ? "しおりを外す" : "しおりを挟む"}
                             >
                               <Bookmark className={`w-3.5 h-3.5 ${bookmarkedIds.includes(n.id) ? "fill-amber-400 text-amber-400" : ""}`} />
                             </button>'''

new_sidebar_btn = '''                             <button
                               onClick={(e) => toggleBookmark(n.id, e)}
                               className={`border-0 bg-transparent p-0.5 cursor-pointer text-xs transition-opacity ${
                                 bookmarkedIds.includes(n.id) ? "opacity-100" : "opacity-30 group-hover:opacity-100"
                               }`}
                               title={bookmarkedIds.includes(n.id) ? "しおりを外す (🔖)" : "しおりを挟む (🔖)"}
                             >
                               🔖
                             </button>'''

# 3. Header button icon
old_header_icon = '''                      <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0 fill-amber-400" />'''
new_header_icon = '''                      <span className="text-amber-400 text-sm shrink-0 select-none">🔖</span>'''

# 4. Active note toolbar button icon
old_toolbar_icon = '''                        <Bookmark className={`w-3.5 h-3.5 shrink-0 ${bookmarkedIds.includes(activeNote.id) ? "text-amber-400 fill-amber-400" : "text-[var(--subtle)]"}`} />'''
new_toolbar_icon = '''                        <span className="text-amber-400 text-sm shrink-0 select-none">🔖</span>'''

# 5. Modal header icon
old_modal_h_icon = '''                <Bookmark className="w-4 h-4 text-amber-400 fill-amber-400" />'''
new_modal_h_icon = '''                <span className="text-amber-400 text-sm shrink-0 select-none">🔖</span>'''

# 6. Modal empty state icon
old_modal_empty = '''                   <Bookmark className="w-8 h-8 text-gray-600 stroke-1" />'''
new_modal_empty = '''                   <span className="text-2xl select-none">🔖</span>'''

# 7. Modal list item icon
old_modal_item = '''                           <Bookmark className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />'''
new_modal_item = '''                           <span className="text-amber-400 text-sm shrink-0 select-none">🔖</span>'''

replacements = [
    (old_sidebar_ind, new_sidebar_ind),
    (old_sidebar_btn, new_sidebar_btn),
    (old_header_icon, new_header_icon),
    (old_toolbar_icon, new_toolbar_icon),
    (old_modal_h_icon, new_modal_h_icon),
    (old_modal_empty, new_modal_empty),
    (old_modal_item, new_modal_item),
]

count = 0
for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        count += 1
    else:
        print(f"Warning: pattern not found:\n{old[:50]}...")

with open("src/App.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print(f"Successfully applied {count} bookmark replacements.")
