# ADR 0020：教授卡片复用 canonical person，并优先院系主页

状态：Accepted

## 决议

教授卡片不是另一套教授身份库。公开卡片以 `course_instructors` 指向的
`staff_people` 为 canonical person；只为 `identity_kind = 'official'` 的人员建卡，
并以 `course_instructors.public_id` UUID 作为稳定公开路由。课表文字、短名候选和
其他 `unverified` identity 不自动生成卡片。

Research Portal 是 canonical identity 的来源，也是个人链接 fallback。离线 crawler
从逐个审核的 CUHK 院系 roster 抓取个人页、头像、原始职位和任命类型，只能通过唯一
校内邮箱加相容姓名，或 Research Portal 同一组织内的唯一完整姓名匹配，附着到已经存在
的 person；crawler 不创建 `staff_people`。无法唯一匹配的访问、兼职、名誉或新入职人员
留在 audit output，不能靠放宽姓名匹配自动建卡。

每个院系页面保存为独立 `staff_person_sources` source。个人主页必须是该 adapter 显式
allowlist 的 CUHK host，并在本次 crawl 中成功访问，才可成为卡片外链；否则卡片回退
`staff_people.profile_url` 的 Research Portal 页面。头像保留为经过 allowlist 和占位图
过滤的外部 URL，不复制进对象存储。图片缺失只影响展示，不影响 identity verification。

同一 person 可以保留多条院系 source 和多种任命。卡片不能无序 `limit 1`，primary
source 按以下顺序确定：有本次验证的个人页优先；`regular` 优先于 `visiting`、
`adjunct`、`part_time`、`courtesy`、`emeritus`、`honorary`；最后按 source 与
source key 稳定排序。原始 role label 和全部 affiliations 仍保留，primary 只用于卡片
头像与主链接。

教授总分直接聚合现有 `course_ratings`：对 canonical instructor 的全部评分做普通算术
平均，并显示评分数；按课程展示相同的课程内平均和计数。评论继续来自现有
`course_reviews`，不复制到教授表。首版不引入贝叶斯平滑、教师自定义维度或另一套评分。
教授目录可以按该普通平均分排序，但只让至少 5 份测评的教授进入“评分最高”结果；
低样本平均分仍可在卡片和详情展示，并明确提示样本较少。首版不另建排行榜页面。

院系 crawl 只有在 fresh run、分页数量达到人工审核基线且个人链接验证通过时，才允许
该 source 参与 missing-row lifecycle。首次缺失只增加 `missing_runs`，连续两次才失效；
失败或不完整 source 不清理旧数据。生成的 SQL 是 attach-only import，并在 person 不存在
或 source key 已属于另一人时中止事务。

## 后果

- 改名、院系换站和 Research Portal URL 变化不改变教授卡片 UUID。
- 课程测评与教授卡片共享同一 instructor identity，避免按姓名重复聚合。
- 院系主页是用户看到的主链接；没有可验证个人页时仍能安全使用 Research Portal。
- 荣休与多重任命不会覆盖正式任命；UI 可以展示全部 affiliation，但只有一个确定的主来源。
- Research Portal 不收录的大量 adjunct、part-time、visiting 和 honorary 人员首版不会有卡片。
  以后若要覆盖，必须增加人工审核或新的官方 identity 证据，而不是降低自动匹配门槛。
- 外链头像可能失效或受远端缓存策略影响；UI 必须有姓名首字母 fallback，且不能把图片
  是否存在当作 identity 证据。
- 院系 adapter 和数量基线需要维护；网站改版会让该 source 暂停更新，而不是误删链接。
