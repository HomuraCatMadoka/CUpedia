import { describe, expect, it } from "vitest";

import {
  PROFESSOR_RANKING_MIN_RATINGS,
  rankProfessorCandidates,
  searchProfessorCandidates,
  type ProfessorSearchCandidate,
} from "@/lib/professor-search";

describe("rankProfessorCandidates", () => {
  it("uses the direct average and excludes professors below the sample threshold", () => {
    const ranked = rankProfessorCandidates([
      {
        publicId: "small-sample",
        name: "Small Sample",
        rating: 5,
        ratingCount: PROFESSOR_RANKING_MIN_RATINGS - 1,
      },
      {
        publicId: "high",
        name: "High Rating",
        rating: 4.5,
        ratingCount: 5,
      },
      {
        publicId: "popular",
        name: "Popular",
        rating: 4.2,
        ratingCount: 20,
      },
    ]);

    expect(ranked.map((candidate) => candidate.publicId)).toEqual([
      "high",
      "popular",
    ]);
  });

  it("breaks equal averages by sample size, then name", () => {
    const ranked = rankProfessorCandidates([
      { publicId: "a", name: "Beta", rating: 4.5, ratingCount: 5 },
      { publicId: "b", name: "Alpha", rating: 4.5, ratingCount: 6 },
      { publicId: "c", name: "Aaron", rating: 4.5, ratingCount: 5 },
    ]);

    expect(ranked.map((candidate) => candidate.publicId)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

function professor(
  id: string,
  name: string,
  courseCode: string | null = null,
): ProfessorSearchCandidate {
  return { id, name, courseCode };
}

describe("searchProfessorCandidates", () => {
  it.each(["", "   ", "\n\t"])("查询“%s”时不返回推荐", (query) => {
    expect(
      searchProfessorCandidates([professor("p1", "Professor CHAN")], query),
    ).toEqual([]);
  });

  it("忽略查询前后空格和英文大小写", () => {
    expect(
      searchProfessorCandidates(
        [professor("p1", "Professor CHAN Wing Kai")],
        "  chan  ",
      ),
    ).toEqual([{ id: "p1", name: "Professor CHAN Wing Kai" }]);
  });

  it("返回未关联当前课程但姓名匹配的目录教授", () => {
    expect(
      searchProfessorCandidates(
        [
          professor("legacy", "Professor LEGACY Wong"),
          professor("other", "Professor CHAN", "CSCI3150"),
        ],
        "legacy wong",
      ),
    ).toEqual([{ id: "legacy", name: "Professor LEGACY Wong" }]);
  });

  it("支持多词姓名倒序输入", () => {
    expect(
      searchProfessorCandidates(
        [professor("p1", "Professor CHAN Wing Kai")],
        "kai chan",
      ),
    ).toEqual([{ id: "p1", name: "Professor CHAN Wing Kai" }]);
  });

  it("可通过人员别名找到以官方姓名展示的教授", () => {
    expect(
      searchProfessorCandidates(
        [
          {
            ...professor("shi", "Prof. SHI Ce Matthew"),
            searchText: "Prof. SHI Ce Matthew Shi Ce Ce Shi",
          },
        ],
        "shi ce",
      ),
    ).toEqual([{ id: "shi", name: "Prof. SHI Ce Matthew" }]);
  });

  it("可通过任教课程代码或名称找到教授", () => {
    expect(
      searchProfessorCandidates(
        [
          {
            ...professor("teacher", "Professor CHAN"),
            searchText: "Professor CHAN CSCI2100 Data Structures",
          },
        ],
        "CSCI2100",
      ),
    ).toEqual([{ id: "teacher", name: "Professor CHAN" }]);
  });

  it("容忍多词姓名中的轻微拼写错误", () => {
    expect(
      searchProfessorCandidates(
        [
          professor("target", "Professor CHAN Wing Kai"),
          professor("weak", "Professor KAI"),
        ],
        "kai chna",
      ),
    ).toEqual([{ id: "target", name: "Professor CHAN Wing Kai" }]);
  });

  it("支持中文姓名查询", () => {
    expect(
      searchProfessorCandidates(
        [professor("p1", "测试教授 陈伟文", "CSCI1130")],
        "陈伟文",
      ),
    ).toEqual([{ id: "p1", name: "测试教授 陈伟文" }]);
  });

  it("将全角拉丁字母视为普通拉丁字母", () => {
    expect(
      searchProfessorCandidates(
        [professor("p1", "Professor CHAN Wing Kai")],
        "ＣＨＡＮ",
      ),
    ).toEqual([{ id: "p1", name: "Professor CHAN Wing Kai" }]);
  });

  it("忽略拉丁姓名的重音符号差异", () => {
    expect(
      searchProfessorCandidates(
        [professor("p1", "Professor José García")],
        "jose garcia",
      ),
    ).toEqual([{ id: "p1", name: "Professor José García" }]);
  });

  it("支持连字符和撇号姓名", () => {
    expect(
      searchProfessorCandidates(
        [
          professor("p1", "Professor Anne-Marie O'Connor"),
          professor("p2", "Professor Anne Wong"),
        ],
        "oconnor anne-marie",
      ),
    ).toEqual([{ id: "p1", name: "Professor Anne-Marie O'Connor" }]);
  });

  it("支持常见教授称谓输入", () => {
    expect(
      searchProfessorCandidates(
        [
          professor("prof", "Professor Alice Lee"),
          professor("doctor", "Dr. Bob Lee"),
        ],
        "dr bob lee",
      ),
    ).toEqual([{ id: "doctor", name: "Dr. Bob Lee" }]);
  });

  it("姓名匹配分数相同时优先推荐关联当前课程的教授", () => {
    expect(
      searchProfessorCandidates(
        [
          professor("global", "Professor CHAN"),
          professor("course", "Professor CHAN", "CSCI3150"),
        ],
        "chan",
      ),
    ).toEqual([
      { id: "course", name: "Professor CHAN" },
      { id: "global", name: "Professor CHAN" },
    ]);
  });

  it("精确姓名匹配优先于本课教授的模糊匹配", () => {
    expect(
      searchProfessorCandidates(
        [
          professor("course", "Professor CHANG Wing Kay", "CSCI3150"),
          professor("exact", "Professor CHAN Wing Kai"),
        ],
        "chan wing kai",
      ),
    ).toEqual([
      { id: "exact", name: "Professor CHAN Wing Kai" },
      { id: "course", name: "Professor CHANG Wing Kay" },
    ]);
  });

  it("同名教授保留为不同目录选项", () => {
    expect(
      searchProfessorCandidates(
        [
          professor("p1", "Professor Alex Lee", "CSCI3150"),
          professor("p2", "Professor Alex Lee"),
        ],
        "alex lee",
      ),
    ).toEqual([
      { id: "p1", name: "Professor Alex Lee" },
      { id: "p2", name: "Professor Alex Lee" },
    ]);
  });

  it("保留院系说明以区分同名教授", () => {
    expect(
      searchProfessorCandidates(
        [
          {
            ...professor("cse", "Professor Alex Lee", "CSCI3150"),
            description: "Department of Computer Science and Engineering",
          },
          {
            ...professor("physics", "Professor Alex Lee"),
            description: "Department of Physics",
          },
        ],
        "alex lee",
      ),
    ).toEqual([
      {
        id: "cse",
        name: "Professor Alex Lee",
        description: "Department of Computer Science and Engineering",
      },
      {
        id: "physics",
        name: "Professor Alex Lee",
        description: "Department of Physics",
      },
    ]);
  });

  it("没有足够相似的姓名时返回空结果", () => {
    expect(
      searchProfessorCandidates(
        [professor("p1", "Professor CHAN Wing Kai")],
        "completely unrelated",
      ),
    ).toEqual([]);
  });

  it("最多返回十个推荐", () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      professor(`p${index}`, `Professor CHAN ${index}`),
    );
    expect(searchProfessorCandidates(candidates, "chan")).toHaveLength(10);
  });

  it("目录搜索可以显式提高结果上限", () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      professor(`p${index}`, `Professor CHAN ${index}`),
    );
    expect(
      searchProfessorCandidates(candidates, "chan", undefined, 15),
    ).toHaveLength(15);
  });
});
