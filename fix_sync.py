import re

with open("src/components/SyncManagerModal.tsx", "r") as f:
    content = f.read()

bad = """                className="bg-[#238636] hover:bg-[#2ea043] text-white font-bold text-[11px] px-4 py-1.5 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                入れ替える
              </button>
            </div>
          </div>
        </div>"""

good = """                className="bg-[#238636] hover:bg-[#2ea043] text-white font-bold text-[11px] px-4 py-1.5 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                入れ替える
              </button>
              </div>
            </div>
          </div>
        </div>"""

content = content.replace(bad, good)
with open("src/components/SyncManagerModal.tsx", "w") as f:
    f.write(content)
print("Fixed.")
