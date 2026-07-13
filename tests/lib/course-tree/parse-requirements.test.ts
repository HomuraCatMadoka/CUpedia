// 课程技能树 S4(#164):parseRequirements 单测。
// fixture 逐字取自 dev 库真实 courses.requirements_raw,不手编想象输入。

import { describe, it, expect } from "vitest";

import { parseRequirements } from "@/lib/course-tree/parse-requirements";

describe("parseRequirements (#164)", () => {
  it("单 OR 组 + 简写补全:裸课号继承前缀", () => {
    // CSCI3170 原文:'2520' 简写继承 CSCI 前缀
    const r = parseRequirements(
      "Prerequisite: CSCI2100 or 2520 or ESTR2102.",
      "CSCI",
    );
    expect(r.prerequisites).toEqual([
      { codes: ["CSCI2100", "CSCI2520", "ESTR2102"] },
    ]);
  });

  it("带括号的 AND of OR 组:组间 AND 拆成多组", () => {
    // CSCI3340 原文
    const r = parseRequirements(
      "Prerequisite: (ENGG1120 or ESTR1005 or MATH1030 or MATH1038 or MATH1550) AND (ENGG1130 or ESTR1006 or MATH1010 or MATH1020 or MATH1018 or MATH1510 or MATH1520)",
      "CSCI",
    );
    expect(r.prerequisites).toEqual([
      { codes: ["ENGG1120", "ESTR1005", "MATH1030", "MATH1038", "MATH1550"] },
      {
        codes: [
          "ENGG1130",
          "ESTR1006",
          "MATH1010",
          "MATH1020",
          "MATH1018",
          "MATH1510",
          "MATH1520",
        ],
      },
    ]);
  });

  it("简写主体中途切换:裸课号继承最近出现的 subject", () => {
    // CSCI2510 原文:'1100'/'1102' 紧跟 ESTR1002 → 归 ESTR 而非 CSCI
    const r = parseRequirements(
      "Prerequisite: CSCI1120 or 1130 or 1510 or 1520 or 1530 or 1540 or 1550 or ENGG1110 or ESTR1002 or 1100 or 1102 or MATH2221 or PHYS2061.",
      "CSCI",
    );
    expect(r.prerequisites).toEqual([
      {
        codes: [
          "CSCI1120",
          "CSCI1130",
          "CSCI1510",
          "CSCI1520",
          "CSCI1530",
          "CSCI1540",
          "CSCI1550",
          "ENGG1110",
          "ESTR1002",
          "ESTR1100",
          "ESTR1102",
          "MATH2221",
          "PHYS2061",
        ],
      },
    ]);
  });

  it("纯排斥、无先修:Not for students who have taken … → exclusions", () => {
    // CSCI1020 原文
    const r = parseRequirements(
      "Not for students who have taken CSCI1120 or 1520 or 1540 or ESTR1100.",
      "CSCI",
    );
    expect(r.exclusions).toEqual([
      "CSCI1120",
      "CSCI1520",
      "CSCI1540",
      "ESTR1100",
    ]);
    expect(r.prerequisites).toEqual([]);
  });

  it("旁路降级:'or equivalent' 记 warning,不当课号", () => {
    // CSCI3230 原文
    const r = parseRequirements(
      "Prerequisite: CSCI2100 or 2520 or ESTR2102 or equivalent.",
      "CSCI",
    );
    // equivalent 不进课号
    expect(r.prerequisites).toEqual([
      { codes: ["CSCI2100", "CSCI2520", "ESTR2102"] },
    ]);
    expect(r.warnings.some((w) => /equivalent/i.test(w))).toBe(true);
  });

  it("同修单独归类:Co-requisite 进 corequisites,不混进 prerequisites", () => {
    // CSCI4180 原文
    const r = parseRequirements(
      "Co-requisite: CSCI3150 or ESTR3102.\nNot for students who have taken ESTR4106.",
      "CSCI",
    );
    expect(r.corequisites).toEqual([{ codes: ["CSCI3150", "ESTR3102"] }]);
    expect(r.prerequisites).toEqual([]);
    expect(r.exclusions).toEqual(["ESTR4106"]);
  });

  it("真实多句共存:先修/同修/排斥各归其位,豁免落 notes", () => {
    // CSCI3150 原文:四类同现 + senior-year 豁免句
    const r = parseRequirements(
      "Prerequisite: ESTR2102 or CSCI2100 or 2520. \n" +
        "For senior-year entrants, the prerequisite will be waived.\n" +
        "Co-requisite: AIST3020 or CSCI2510 or CENG3420 or IERG3060 or equivalent.\n" +
        "Not for students who have taken ESTR3102.",
      "CSCI",
    );
    expect(r.prerequisites).toEqual([
      { codes: ["ESTR2102", "CSCI2100", "CSCI2520"] },
    ]);
    expect(r.corequisites).toEqual([
      { codes: ["AIST3020", "CSCI2510", "CENG3420", "IERG3060"] },
    ]);
    expect(r.exclusions).toEqual(["ESTR3102"]);
    // 豁免是自由文本限制,不建模成边,落 notes 供 UI 原样展示
    expect(r.notes.some((n) => /waived/i.test(n))).toBe(true);
  });

  it("非课号限制归 notes:「Not for students of Faculty …」不丢、不当排斥课", () => {
    // CSCI1550 原文:第二句是院系限制,无课号,不能进 exclusions,也不能静默丢
    const r = parseRequirements(
      "Not for students who have taken ENGG1110 or CSCI1040.\n" +
        "Not for students of Faculty of Engineering.",
      "CSCI",
    );
    expect(r.exclusions).toEqual(["ENGG1110", "CSCI1040"]);
    expect(r.notes.some((n) => /Faculty of Engineering/i.test(n))).toBe(true);
  });

  it("编号列表 + 分号分隔:1. Prerequisite / 2. Corequisite 各归其位", () => {
    // CSCI3270 原文:数字编号 + ';' 分隔 + Corequisite 无连字符
    const r = parseRequirements(
      "1. Prerequisite: CSCI2100 or ESTR2102;2. Corequisite: CSCI3160 or ESTR3104.",
      "CSCI",
    );
    expect(r.prerequisites).toEqual([{ codes: ["CSCI2100", "ESTR2102"] }]);
    expect(r.corequisites).toEqual([{ codes: ["CSCI3160", "ESTR3104"] }]);
  });

  it("年份区间不当课号:排斥句里的 '2008-09' 不产出 CENG2008", () => {
    // CENG4480 原文:排斥句含年份区间「in 2008-09 and before」,'2008' 紧跟 '-',是年份非课号。
    const r = parseRequirements(
      "Not for students who have taken CENG3480 in 2008-09 and before;" +
        "Prerequisite: CENG2400 or ESTR2100.\n" +
        "For 2nd-year entrants, the prerequisite will be waived.",
      "CENG",
    );
    expect(r.exclusions).toEqual(["CENG3480"]); // 不含 CENG2008
    expect(r.prerequisites).toEqual([{ codes: ["CENG2400", "ESTR2100"] }]);
  });

  it("等级词不当课号:'1000- or 2000-level' 不产出 EPIN1000/2000", () => {
    // EPIN4010 原文:'1000-'/'2000-level' 是课程等级,紧跟 '-',非课号;整句仅 permission 旁路。
    const r = parseRequirements(
      "Prerequisite: Any one of the 1000- or 2000-level of EPIN-coded course, " +
        "or with special permission granted by the instructor",
      "EPIN",
    );
    const codes = r.prerequisites.flatMap((g) => g.codes);
    expect(codes).not.toContain("EPIN1000");
    expect(codes).not.toContain("EPIN2000");
    expect(r.warnings.some((w) => /permission/i.test(w))).toBe(true);
  });

  it("跨 AND 段:裸数字继承的 subject 不被 'and' 重置", () => {
    // CLED4610 原文:'3520' 紧跟 LEDC2520,应继承 LEDC(→LEDC3520),
    // 不能被 'and' 分段重置回 subjectHint(CLED),否则造出查无此课的 CLED3520。
    const r = parseRequirements(
      "Prerequisites:LEDC2520 and 3520 or CLED2530 and 3530",
      "CLED",
    );
    const codes = r.prerequisites.flatMap((g) => g.codes);
    expect(codes).toContain("LEDC2520");
    expect(codes).toContain("LEDC3520"); // 3520 继承最近的 LEDC
    expect(codes).toContain("CLED2530");
    expect(codes).toContain("CLED3530"); // 3530 继承最近的 CLED
    expect(codes).not.toContain("CLED3520"); // 不得造出伪造码
  });

  it("多行先修:关键词后紧跟换行,内容在下一行仍捕获为边", () => {
    // ESTR3516 原文(简化):Pre-requisites: 后紧跟换行,课号在 (a) 行
    const r = parseRequirements(
      "1. Pre-requisites:\n" +
        "(a) ENGG1110/ESTR1002, ENGG1120/ESTR1005 & MATH1510; or (b) with course instructor's approval.\n" +
        "2. Not for students who have taken SEEM3650 or SEEM4480.",
      "ESTR",
    );
    // #164 自由模式只需先修边存在(组内 OR/AND 精确分组留给 #166),故只断言课号被捕获为边
    const preCodes = r.prerequisites.flatMap((g) => g.codes);
    expect(preCodes).toContain("ENGG1110");
    expect(preCodes).toContain("ESTR1002");
    expect(preCodes).toContain("MATH1510");
    // 排斥段仍各归其位
    expect(r.exclusions).toEqual(["SEEM3650", "SEEM4480"]);
  });
});
