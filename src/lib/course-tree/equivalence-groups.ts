// 等价组(#165):把「多选一」的互斥课集从 exclusions 推出来。
// 边 = 同一类目内两门课**双向**互斥(A 排 B 且 B 排 A);组 = 类目内这些边的连通分量。
// 类目 kind 即角色,按类目求组天然满足「跨类目/不同角色不并组」。纯函数,无 IO。

import type { CategoryInput, CourseInfo, EquivalenceGroup } from "./types";

/** 组员超过此数视为疑似脏数据(真实「多选一」通常 2–4 门),打标待人工复核。 */
const OVERSIZED = 5;

export function buildEquivalenceGroups(
  courses: CourseInfo[],
  categories: CategoryInput[],
): EquivalenceGroup[] {
  const exclByCode = new Map<string, Set<string>>();
  for (const c of courses) exclByCode.set(c.code, new Set(c.exclusions ?? []));
  // 双向互斥:A 的排斥表含 B 且 B 的排斥表含 A。
  const mutuallyExcl = (a: string, b: string): boolean =>
    !!exclByCode.get(a)?.has(b) && !!exclByCode.get(b)?.has(a);

  const groups: EquivalenceGroup[] = [];
  for (const cat of categories) {
    const codes = [...new Set(cat.members.map((m) => m.courseCode))];
    // 类目内的连通分量(并查集式的 BFS 泛洪),分量 ≥2 才是「多选一」组。
    const seen = new Set<string>();
    for (const start of codes) {
      if (seen.has(start)) continue;
      const component: string[] = [];
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const cur = queue.shift()!;
        component.push(cur);
        for (const other of codes) {
          if (!seen.has(other) && mutuallyExcl(cur, other)) {
            seen.add(other);
            queue.push(other);
          }
        }
      }
      if (component.length >= 2) {
        component.sort((a, b) => a.localeCompare(b));
        groups.push({
          categoryId: cat.id,
          categoryName: cat.name,
          kind: cat.kind,
          codes: component,
          oversized: component.length > OVERSIZED,
        });
      }
    }
  }
  return groups;
}
