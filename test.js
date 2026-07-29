const str = '{\n  "test": "line1\nline2"\n}';
const fixedStr = str.replace(/"([^"\\]|\\.)*"/g, match => {
    return match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
});
console.log(fixedStr);
console.log(JSON.parse(fixedStr));
