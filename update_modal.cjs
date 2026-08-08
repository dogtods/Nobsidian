const fs = require('fs');
let content = fs.readFileSync('src/components/ExternalAiExportModal.tsx', 'utf8');

content = content.replace(
  /onExport: \(options: { includeAll: boolean; taskBacklink: boolean; taskAnalysis: boolean }\) => void;/,
  "onExport: (options: { includeAll: boolean; taskBacklink: boolean; taskAnalysis: boolean; taskStructure: boolean }) => void;"
);

content = content.replace(
  /const \[taskAnalysis, setTaskAnalysis\] = useState\(true\);/,
  `const [taskAnalysis, setTaskAnalysis] = useState(true);
  const [taskStructure, setTaskStructure] = useState(false);`
);

const newCheckbox = `
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer accent-[var(--purple)]"
              checked={taskStructure}
              onChange={(e) => setTaskStructure(e.target.checked)}
            />
            <div className="flex-1">
              <span className="text-xs font-bold text-white block">図解（Mermaid）の抽出</span>
              <span className="text-[10px] text-[var(--subtle)] mt-0.5 block">
                比較・時系列・因果関係をMermaid記法の図として抽出する指示を含めます。
              </span>
            </div>
          </label>
`;

content = content.replace(
  /<\/div>\s*<div className="bg-\[rgba\(163,113,247,0\.04\)\] border border-\[rgba\(163,113,247,0\.15\)\] rounded-lg p-3">/,
  newCheckbox + '        </div>\n\n        <div className="bg-[rgba(163,113,247,0.04)] border border-[rgba(163,113,247,0.15)] rounded-lg p-3">'
);

content = content.replace(
  /disabled=\{\!taskAnalysis && \!taskBacklink\}/,
  "disabled={!taskAnalysis && !taskBacklink && !taskStructure}"
);

content = content.replace(
  /onClick=\{\(\) => onExport\(\{ includeAll, taskBacklink, taskAnalysis \}\)\}/,
  "onClick={() => onExport({ includeAll, taskBacklink, taskAnalysis, taskStructure })}"
);

fs.writeFileSync('src/components/ExternalAiExportModal.tsx', content);
