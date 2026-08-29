const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'weeklyReportPrompt?: string;\n    targetSheetName?: string;\n  }) => {',
  'weeklyReportPrompt?: string;\n    targetSheetName?: string;\n    driveSourceFolder?: string;\n    driveProcessedFolder?: string;\n  }) => {'
);

fs.writeFileSync('src/App.tsx', code);
