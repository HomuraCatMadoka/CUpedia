UPDATE "course_ratings"
SET
	"workload" = CASE
		WHEN "tags" ? 'chur' THEN 'heavy'
		WHEN "tags" ? 'hea' THEN 'light'
		ELSE NULL
	END,
	"grade" = CASE
		WHEN "tags" ? '靓 grade' THEN 'good'
		WHEN "tags" ? '烂 grade' THEN 'bad'
		ELSE NULL
	END,
	"enrollment" = CASE
		WHEN "tags" ? '课难抢' THEN 'hard'
		WHEN "tags" ? '点击即送' THEN 'easy'
		ELSE NULL
	END,
	"attendance" = CASE
		WHEN "tags" ? '要 attendance' THEN 'required'
		WHEN "tags" ? '无 attendance' THEN 'not_required'
		ELSE NULL
	END,
	"tags" = "tags" - ARRAY[
		'chur',
		'hea',
		'靓 grade',
		'烂 grade',
		'课难抢',
		'点击即送',
		'要 attendance',
		'无 attendance'
	]::text[];
