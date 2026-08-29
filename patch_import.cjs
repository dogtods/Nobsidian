const fs = require('fs');
let code = fs.readFileSync('src/components/ImportModal.tsx', 'utf8');

code = code.replace(
  'const [activeTab, setActiveTab] = useState<"step_1" | "step_2" | "prompts">("step_1");',
  'const [activeTab, setActiveTab] = useState<"step_1" | "step_2" | "prompts" | "folders">("step_1");\n  const [driveSourceFolderInput, setDriveSourceFolderInput] = useState("");\n  const [driveProcessedFolderInput, setDriveProcessedFolderInput] = useState("");'
);

code = code.replace(
  'drive: boolean;',
  'drive: boolean;\n    driveSourceFolder?: string;\n    driveProcessedFolder?: string;'
);

code = code.replace(
  'setExternalSyncSheetName(storedExtSheet);',
  'setExternalSyncSheetName(storedExtSheet);\n      setDriveSourceFolderInput(localStorage.getItem("cn_drive_source_folder") || "");\n      setDriveProcessedFolderInput(localStorage.getItem("cn_drive_processed_folder") || "");'
);

code = code.replace(
  'if (finalExtSheet) {',
  'if (driveSourceFolderInput) localStorage.setItem("cn_drive_source_folder", driveSourceFolderInput.trim());\n    else localStorage.removeItem("cn_drive_source_folder");\n\n    if (driveProcessedFolderInput) localStorage.setItem("cn_drive_processed_folder", driveProcessedFolderInput.trim());\n    else localStorage.removeItem("cn_drive_processed_folder");\n\n    if (finalExtSheet) {'
);

code = code.replace(
  'drive: syncDrive,',
  'drive: syncDrive,\n      driveSourceFolder: driveSourceFolderInput.trim(),\n      driveProcessedFolder: driveProcessedFolderInput.trim(),'
);

code = code.replace(
  '<Sliders className="w-3.5 h-3.5" />\n            <span>⚙ 3. AIプロンプト設定</span>\n          </button>',
  '<Sliders className="w-3.5 h-3.5" />\n            <span>⚙ 3. AIプロンプト設定</span>\n          </button>\n          <button\n            type="button"\n            onClick={() => setActiveTab("folders")}\n            className={`pb-2.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${\n              activeTab === "folders"\n                ? "border-blue-500 text-blue-300"\n                : "border-transparent text-gray-400 hover:text-gray-200"\n            }`}\n          >\n            <Database className="w-3.5 h-3.5" />\n            <span>⚙ 4. フォルダ設定</span>\n          </button>'
);

const newTabCode = `
        {/* TAB 4: Folders Configuration */}
        {activeTab === "folders" && (
          <div className="flex flex-col gap-3">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-gray-100">Googleドライブ フォルダ設定</span>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">取り込み前（未処理）データフォルダ (URL または ID):</span>
                <input
                  type="text"
                  placeholder="未指定の場合は自動で「Connected Notes 取り込み」が作成・参照されます"
                  className="w-full text-xs p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-blue-500 transition"
                  value={driveSourceFolderInput}
                  onChange={(e) => {
                    setDriveSourceFolderInput(e.target.value);
                    saveAllSettings();
                  }}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">取り込み後（処理済み）データフォルダ (URL または ID):</span>
                <input
                  type="text"
                  placeholder="未指定の場合は対象フォルダ内に自動で「_processed」が作成・参照されます"
                  className="w-full text-xs p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-blue-500 transition"
                  value={driveProcessedFolderInput}
                  onChange={(e) => {
                    setDriveProcessedFolderInput(e.target.value);
                    saveAllSettings();
                  }}
                />
              </div>
              
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-200 text-xs leading-relaxed">
                <p>💡 <b>フォルダIDの指定方法:</b> Googleドライブのフォルダを開いた時のURL (<code>https://drive.google.com/drive/folders/〇〇〇</code>) の 〇〇〇 の部分、またはURL全体を貼り付けてください。</p>
              </div>
            </div>
          </div>
        )}
`;

code = code.replace(
  '{/* Footer */}',
  newTabCode + '\n        {/* Footer */}'
);

fs.writeFileSync('src/components/ImportModal.tsx', code);
