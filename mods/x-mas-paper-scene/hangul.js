// The scene takes the keystrokes itself, so macOS' 2-set input method never sees them
// and hands over compatibility jamo one key at a time (ㅎ, ㅏ, ㄴ). These two functions
// compose and uncompose them the way that input method would, so a typed search reads
// as Korean instead of ㅎㅏㄴ.

const CHO = [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"];
const JUNG = [..."ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"];
const JONG = [..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];

const CHO_INDEX = new Map(CHO.map((ch, i) => [ch, i]));
const JUNG_INDEX = new Map(JUNG.map((ch, i) => [ch, i]));
const JONG_INDEX = new Map(JONG.map((ch, i) => [ch, i + 1]));
const VOWELS = new Set(JUNG);

const COMPOUND_JUNG = {
  "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ",
  "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ",
  "ㅡㅣ": "ㅢ",
};
const SPLIT_JUNG = {
  "ㅘ": "ㅗ", "ㅙ": "ㅗ", "ㅚ": "ㅗ", "ㅝ": "ㅜ", "ㅞ": "ㅜ", "ㅟ": "ㅜ", "ㅢ": "ㅡ",
};
const COMPOUND_JONG = {
  "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ",
  "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ",
  "ㅂㅅ": "ㅄ",
};
const SPLIT_JONG = {
  "ㄳ": "ㄱ", "ㄵ": "ㄴ", "ㄶ": "ㄴ",
  "ㄺ": "ㄹ", "ㄻ": "ㄹ", "ㄼ": "ㄹ", "ㄽ": "ㄹ", "ㄾ": "ㄹ", "ㄿ": "ㄹ", "ㅀ": "ㄹ",
  "ㅄ": "ㅂ",
};
const BACK_JONG = {
  "ㄳ": "ㅅ", "ㄵ": "ㅈ", "ㄶ": "ㅎ",
  "ㄺ": "ㄱ", "ㄻ": "ㅁ", "ㄼ": "ㅂ", "ㄽ": "ㅅ", "ㄾ": "ㅌ", "ㄿ": "ㅍ", "ㅀ": "ㅎ",
  "ㅄ": "ㅅ",
};

const syllable = (cho, jung, jong = 0) => String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong);

function splitSyllable(ch) {
  const offset = ch.codePointAt(0) - 0xac00;
  if (offset < 0 || offset >= 11172) return null;
  return { cho: Math.floor(offset / 588), jung: Math.floor((offset % 588) / 28), jong: offset % 28 };
}

const isJamo = (ch) => {
  const code = ch.codePointAt(0);
  return code >= 0x3131 && code <= 0x3163;
};
const isVowel = (ch) => VOWELS.has(ch);
const isConsonant = (ch) => isJamo(ch) && !VOWELS.has(ch);

export function typeJamo(text, ch) {
  const base = String(text ?? "");
  const chars = Array.from(base);
  if (!isJamo(ch)) return base + ch;
  const head = chars.slice(0, -1).join("");
  const last = chars[chars.length - 1] ?? "";
  const ended = splitSyllable(last);

  if (ended) {
    const { cho, jung, jong } = ended;
    if (isConsonant(ch)) {
      if (jong === 0) {
        const index = JONG_INDEX.get(ch);
        if (index !== undefined) return head + syllable(cho, jung, index);
      } else {
        const compound = COMPOUND_JONG[JONG[jong - 1] + ch];
        if (compound) return head + syllable(cho, jung, JONG_INDEX.get(compound));
      }
      return base + ch;
    }
    if (jong > 0) {
      const final = JONG[jong - 1];
      const front = SPLIT_JONG[final];
      const kept = front ? JONG_INDEX.get(front) : 0;
      const back = BACK_JONG[final] ?? final;
      return head + syllable(cho, jung, kept) + syllable(CHO_INDEX.get(back), JUNG_INDEX.get(ch));
    }
    const compound = COMPOUND_JUNG[JUNG[jung] + ch];
    if (compound) return head + syllable(cho, JUNG_INDEX.get(compound));
    return base + ch;
  }

  if (isConsonant(last)) {
    if (isVowel(ch) && CHO_INDEX.has(last)) return head + syllable(CHO_INDEX.get(last), JUNG_INDEX.get(ch));
    return base + ch;
  }
  if (isVowel(last) && isVowel(ch)) {
    const compound = COMPOUND_JUNG[last + ch];
    if (compound) return head + compound;
  }
  return base + ch;
}

export function eraseJamo(text) {
  const chars = Array.from(String(text ?? ""));
  if (!chars.length) return "";
  const head = chars.slice(0, -1).join("");
  const last = chars[chars.length - 1];
  const ended = splitSyllable(last);
  if (!ended) return head + (SPLIT_JUNG[last] ?? "");
  const { cho, jung, jong } = ended;
  if (jong > 0) {
    const front = SPLIT_JONG[JONG[jong - 1]];
    return head + syllable(cho, jung, front ? JONG_INDEX.get(front) : 0);
  }
  const front = SPLIT_JUNG[JUNG[jung]];
  if (front) return head + syllable(cho, JUNG_INDEX.get(front));
  return head + CHO[cho];
}
