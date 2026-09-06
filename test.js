const compressContent = (content, maxLength) => {
  if (!content) return "";
  let clean = content.replace(/```[\s\S]*?```/g, "[コードブロック省略/Token Saving]");
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength) + "\n...[長文のため後半をカット/Token Saving]";
  }
  return clean;
};
console.log(compressContent("this is a test\nthis is at the bottom", 100));
