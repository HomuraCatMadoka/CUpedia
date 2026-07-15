# Test Cases: Course Review Professor Search

## Overview

- **Feature**: 课程测评教授姓名搜索与选择
- **Requirements Source**: 用户确认的“全目录可选、任教本课者优先、Fuse.js 模糊匹配”方案
- **Test Coverage**: 姓名召回、格式与词序、拼写容错、中文与 Unicode、推荐排序、边界、提交安全
- **Last Updated**: 2026-07-15

## Requirements

| ID      | Requirement                                              |
| ------- | -------------------------------------------------------- |
| REQ-001 | 姓名搜索覆盖整个官方教授目录，不以当前课程关联作为硬过滤 |
| REQ-002 | 使用模糊搜索支持大小写、词序变化及轻微拼写错误           |
| REQ-003 | 姓名匹配质量相同时，关联当前课程的教授优先               |
| REQ-004 | 支持中文、全角字符、重音符号及常见姓名标点               |
| REQ-005 | 空查询不推荐，弱匹配不展示，最多返回 10 项               |
| REQ-006 | 目录内教授可以提交测评，未知教授 ID 必须被拒绝           |

## Functional Tests

### TC-F-001: 搜索未关联当前课程的目录教授

- **Requirement**: REQ-001
- **Priority**: High
- **Preconditions**: 教授存在于官方目录，但不存在当前课程关联
- **Test Steps**:
  1. 进入课程测评表单。
  2. 输入该教授姓名。
  3. 选择推荐项并提交测评。
- **Expected Results**: 推荐项出现；选择后提交成功；发布结果显示该教授姓名。
- **Automated Coverage**: Unit + Playwright E2E

### TC-F-002: 当前课程教授推荐优先

- **Requirement**: REQ-003
- **Priority**: High
- **Preconditions**: 两名教授具有相同显示姓名，其中一名关联当前课程
- **Test Steps**: 搜索该姓名。
- **Expected Results**: 关联当前课程的目录项排在前面，两项均保留。
- **Automated Coverage**: Unit

### TC-F-003: 英文多词姓名倒序搜索

- **Requirement**: REQ-002
- **Priority**: High
- **Test Steps**: 对 `Professor CHAN Wing Kai` 搜索 `kai chan`。
- **Expected Results**: 返回目标教授。
- **Automated Coverage**: Unit

### TC-F-004: 多词姓名轻微拼写错误

- **Requirement**: REQ-002, REQ-005
- **Priority**: High
- **Test Steps**: 对 `Professor CHAN Wing Kai` 搜索 `kai chna`。
- **Expected Results**: 返回目标教授；只命中 `kai` 的弱匹配不出现。
- **Automated Coverage**: Unit

### TC-F-005: 中文教授姓名

- **Requirement**: REQ-004
- **Priority**: High
- **Test Steps**: 搜索中文姓名 `陈伟文`。
- **Expected Results**: 返回包含该中文姓名的教授。
- **Automated Coverage**: Unit + 既有 E2E seed 流程

### TC-F-006: 目录教授测评提交

- **Requirement**: REQ-006
- **Priority**: High
- **Test Steps**: 搜索并选择未关联当前课程、但存在于目录中的教授后提交。
- **Expected Results**: 提交成功并保存教授快照。
- **Automated Coverage**: Playwright E2E

## Edge Case Tests

| ID       | Scenario                           | Expected Result                | Priority | Automated |
| -------- | ---------------------------------- | ------------------------------ | -------- | --------- |
| TC-E-001 | 查询含前后空格和不同大小写         | 正常召回                       | High     | Yes       |
| TC-E-002 | 全角输入 `ＣＨＡＮ`                | 匹配 `CHAN`                    | Medium   | Yes       |
| TC-E-003 | 无重音输入 `jose garcia`           | 匹配 `José García`             | Medium   | Yes       |
| TC-E-004 | 连字符与撇号 `Anne-Marie O'Connor` | 忽略常见标点差异并召回         | Medium   | Yes       |
| TC-E-005 | 输入 `Dr.` 等称谓                  | 返回称谓与姓名均匹配的目标     | Medium   | Yes       |
| TC-E-006 | 两个不同 ID 使用同一显示姓名       | 两个选项均保留，课程关联项优先 | High     | Yes       |
| TC-E-007 | 超过 10 个合格候选                 | 只返回前 10 个                 | Medium   | Yes       |

## Error Handling Tests

| ID         | Scenario               | Expected Result           | Priority | Automated |
| ---------- | ---------------------- | ------------------------- | -------- | --------- |
| TC-ERR-001 | 空字符串、纯空格或换行 | 返回空推荐，不查找姓名    | High     | Yes       |
| TC-ERR-002 | 完全无关的查询         | 返回空推荐                | High     | Yes       |
| TC-ERR-003 | 提交不存在的教授 ID    | 拒绝提交且不写入评分/评论 | High     | Yes       |

## Ranking Tests

| ID       | Scenario                             | Expected Result                                  | Priority | Automated |
| -------- | ------------------------------------ | ------------------------------------------------ | -------- | --------- |
| TC-R-001 | 两个候选姓名匹配分数相同             | 当前课程关联项优先                               | High     | Yes       |
| TC-R-002 | 全局教授精确匹配，本课教授仅模糊匹配 | 精确匹配优先，课程关系不能覆盖明显的姓名质量差异 | High     | Yes       |
| TC-R-003 | 弱候选只匹配一个常见 token           | 弱候选被阈值过滤                                 | High     | Yes       |

## Test Coverage Matrix

| Requirement ID | Test Cases                                 | Coverage Status |
| -------------- | ------------------------------------------ | --------------- |
| REQ-001        | TC-F-001, TC-F-006                         | Complete        |
| REQ-002        | TC-F-003, TC-F-004, TC-E-001, TC-R-003     | Complete        |
| REQ-003        | TC-F-002, TC-R-001, TC-R-002               | Complete        |
| REQ-004        | TC-F-005, TC-E-002–TC-E-005                | Complete        |
| REQ-005        | TC-E-007, TC-ERR-001, TC-ERR-002, TC-R-003 | Complete        |
| REQ-006        | TC-F-006, TC-ERR-003                       | Complete        |

## Notes

- 自动化测试验证公开行为，不断言 Fuse.js 内部调用或 SQL 结构。
- “同名教授”目前只能用不同目录 ID 区分；UI 尚未展示院系等消歧信息。
- 教授必须先存在于官方目录；完全不在目录中的历史教授不属于本次搜索算法覆盖范围。
