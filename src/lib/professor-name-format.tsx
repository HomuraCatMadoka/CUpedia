import type { ReactNode } from "react";

export type ParsedProfessorName = {
  title: string | null;
  givenNames: string | null;
  familyName: string;
};

const TITLE_PATTERN = /^(Prof\.|Professor|Dr\.|Doctor|Mr\.|Ms\.|Miss)\s+/i;

const TITLE_ABBREVIATION: Record<string, string> = {
  professor: "Prof.",
  "prof.": "Prof.",
  doctor: "Dr.",
  "dr.": "Dr.",
};

function isAllCapsWord(word: string): boolean {
  return /^[A-Z-]+$/.test(word);
}

function toTitleCaseWord(word: string): string {
  return word
    .toLowerCase()
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join("-");
}

/** 将全大写姓氏（可含连字符/空格）转为 Title Case：SUN → Sun, VAN DER MEER → Van Der Meer */
export function toTitleCaseFamilyName(familyName: string): string {
  return familyName
    .split(/\s+/)
    .filter(Boolean)
    .map(toTitleCaseWord)
    .join(" ");
}

/**
 * 仅当姓氏的每个词都符合全大写规则时才做 Title Case；
 * 回退路径（familyName 为完整原始姓名）应原样保留，避免 McDonald → Mcdonald。
 */
function formatFamilyName(familyName: string): string {
  const words = familyName.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every(isAllCapsWord)
    ? toTitleCaseFamilyName(familyName)
    : familyName;
}

/**
 * 解析教授姓名：`{Title} {FAMILY} {Given} [Middle]`（CUHK 惯例，姓氏全大写）。
 * familyName 保持原始全大写，不做大小写转换；位序保持原数据不变。
 */
export function parseProfessorName(name: string): ParsedProfessorName {
  const trimmed = name.trim();
  if (!trimmed) return { title: null, givenNames: null, familyName: "" };

  let title: string | null = null;
  let rest = trimmed;
  const titleMatch = trimmed.match(TITLE_PATTERN);
  if (titleMatch) {
    const rawTitle = titleMatch[1].toLocaleLowerCase();
    title = TITLE_ABBREVIATION[rawTitle] ?? titleMatch[1];
    rest = trimmed.slice(titleMatch[0].length).trim();
  }

  if (!rest) return { title, givenNames: null, familyName: "" };

  const words = rest.split(/\s+/);
  let index = 0;
  while (index < words.length && isAllCapsWord(words[index]!)) {
    index += 1;
  }
  const familyName = index > 0 ? words.slice(0, index).join(" ") : rest;
  const givenNames =
    index > 0 && index < words.length ? words.slice(index).join(" ") : null;

  return { title, givenNames, familyName };
}

/** 返回 React 元素：title + 加粗姓氏(Title Case) + 名字，位序与原数据一致 */
export function formatProfessorName(name: string): ReactNode {
  const { title, givenNames, familyName } = parseProfessorName(name);
  if (!familyName) return null;
  const displayFamily = formatFamilyName(familyName);
  return (
    <>
      {title ? `${title} ` : null}
      <strong>{displayFamily}</strong>
      {givenNames ? ` ${givenNames}` : null}
    </>
  );
}

/** 纯文本版本（alt、metadata、<option> 等不能嵌套 JSX 的场景） */
export function formatProfessorNameText(name: string): string {
  const { title, givenNames, familyName } = parseProfessorName(name);
  const displayFamily = formatFamilyName(familyName);
  return [title, displayFamily, givenNames].filter(Boolean).join(" ");
}

/** 头像占位缩写：姓首字母 + 名首字母，不含 title */
export function getProfessorInitials(name: string): string {
  const { familyName, givenNames } = parseProfessorName(name);
  return [familyName?.[0], givenNames?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();
}
