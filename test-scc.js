const words = [
  "5b6d",
  "e5ec",
  "616e",
  "e368",
  "efec",
  "7920",
  "6d75",
  "73e9",
  "e320",
  "70ec",
  "6179",
  "e96e",
  "675d"
];

let output = "";

for (const word of words) {
  const high = parseInt(word.slice(0, 2), 16) & 0x7f;
  const low = parseInt(word.slice(2, 4), 16) & 0x7f;

  output += String.fromCharCode(high);
  output += String.fromCharCode(low);
}

console.log(output);
