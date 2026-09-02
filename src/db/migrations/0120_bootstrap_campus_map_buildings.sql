-- Bootstrap the provider-neutral Building directory from CUHK's official campus map.
-- Provider candidates remain evidence only: an Admin must use the audited provider-mapping
-- registry to bind a confirmed AMap object to one of these canonical Buildings.
INSERT INTO "campus_map_provenance_sources" (
  "id", "source_kind", "source_ref", "source_url", "source_owner",
  "source_version", "snapshot_hash", "accessed_on", "rights_status",
  "limitations", "note"
) VALUES (
  '74628200-6fde-5f56-803f-2cc46659be41', 'official', 'cuhk-campus-map:buildings:20161006:sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda',
  'https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006', 'The Chinese University of Hong Kong',
  '20161006', 'sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda', '2026-09-02', 'unknown',
  'The official map warns that it is not to scale and is not updated in real time.',
  'Building names, codes, aliases, and representative anchors only; floors are not inferred.'
) ON CONFLICT ("source_kind", "source_ref") DO NOTHING;
--> statement-breakpoint
CREATE TEMP TABLE "campus_map_building_bootstrap_items" AS
SELECT *
FROM (VALUES
  ('1', '35b1dbbd-278f-501a-bd22-26f4f7eb2164', '范克廉楼', 'Benjamin Franklin Centre', 'H1', ARRAY['范克廉樓']::text[], 114.205184876919, 22.4184151397247, 'wgs84'),
  ('3', '56cb1f87-1e3c-5776-ae93-e157e0dd758d', '大学行政楼', 'University Administration Building', 'H2', ARRAY['大學行政樓']::text[], 114.205238521099, 22.4189953408264, 'wgs84'),
  ('4', 'dffa3753-569c-5b87-9276-310423fa1efc', '祖尧堂', 'Cho Yiu Hall', 'H2a', ARRAY['祖堯堂']::text[], 114.204951524734, 22.4190548484947, 'wgs84'),
  ('5', 'ac3af26f-9535-52db-bd10-35638547c7d7', '大学图书馆', 'University Library', 'H3', ARRAY['大學圖書館']::text[], 114.204911291599, 22.4194986757161, 'wgs84'),
  ('6', '9801b28e-9065-5ae0-b120-f6b6532a3624', '田家炳楼', 'Tin Ka Ping Building', 'H3a', ARRAY['田家炳樓']::text[], 114.2045545578, 22.4194837988489, 'wgs84'),
  ('7', '2448a68a-da8c-5ec3-a3f8-3d7604679f36', '中国文化研究所', 'Institute of Chinese Studies', 'H4', ARRAY['中國文化研究所', 'ICS']::text[], 114.205783009529, 22.4191862611717, 'wgs84'),
  ('8', '41b66763-b2ae-5ede-989e-846e2153bdaa', '文物馆', 'Art Museum', 'H4', ARRAY['文物館']::text[], 114.205804467201, 22.4193127147624, 'wgs84'),
  ('10', 'bfc43f45-ce80-533b-ad7a-479a7d4bc843', '香港中文大学文物馆──罗桂祥馆', 'Art Museum of CUHK—Lo Kwee Seong Pavilion', 'H5', ARRAY['香港中文大學文物館──羅桂祥館']::text[], 114.206305496854, 22.4187996595717, 'wgs84'),
  ('11', '997c7b39-c326-5014-8698-285d25086b56', '兆龙楼', 'Sui Loong Pao Building', 'H6', ARRAY['兆龍樓']::text[], 114.205750823021, 22.4197143901103, 'wgs84'),
  ('12', '53f7be2f-6d71-5c91-a188-9696690d9faf', '碧秋楼', 'Pi Ch''iu Building', 'H7', ARRAY['碧秋樓', 'HCA']::text[], 114.206397235394, 22.4197119106364, 'wgs84'),
  ('13', '9314a872-143d-5dc1-ba03-aa2023c63a62', '润昌堂', 'Y.C. Liang Hall', 'H8', ARRAY['潤昌堂', 'LHC']::text[], 114.206520617008, 22.4200515981473, 'wgs84'),
  ('14', '22b3997d-e8e1-5ff5-8f81-5cf22b6fbc8a', '邵逸夫堂', 'Sir Run Run Shaw Hall', 'H9', ARRAY['RRS']::text[], 114.207113385201, 22.4201259821629, 'wgs84'),
  ('15', 'd0f66212-4138-5ab3-b8e5-04980cf64fb3', '科学馆', 'University Science Centre', 'H10', ARRAY['科學館', 'SC']::text[], 114.207928776741, 22.4194639630236, 'wgs84'),
  ('16', 'e1cd9318-e98f-5fe8-b391-63b35a989441', '科学馆东座', 'Science Centre East Block', 'H10a', ARRAY['科學館東座', 'SCE']::text[], 114.208760261536, 22.419121794591, 'wgs84'),
  ('17', '367d9f99-13e6-5805-8447-5b523f7b36d3', '李卓敏基本医学大楼', 'Choh-Ming Li Basic Medical Sciences Building', 'H11', ARRAY['李卓敏基本醫學大樓', 'BMS']::text[], 114.208757579327, 22.4194466066741, 'wgs84'),
  ('18', 'ed9c87aa-47a8-5fb2-a596-d70cf9dc0d1b', '基本医学大楼新翼', 'Basic Medical Sciences Building Teaching Annex', 'H11a', ARRAY['基本醫學大樓新翼']::text[], 114.20899361372, 22.4192680840965, 'wgs84'),
  ('19', 'b6f55956-1040-574f-8b43-7d54037fb8de', '何东夫人堂', 'Lady Ho Tung Hall', 'H12', ARRAY['何東夫人堂']::text[], 114.209044575691, 22.4185564709856, 'wgs84'),
  ('20', 'a06b4710-ae59-5df1-a28c-5825bdc97b8f', '陈震夏馆', 'Chan Chun Ha Hall', 'H15', ARRAY['陳震夏館']::text[], 114.210157692432, 22.4181126407532, 'wgs84'),
  ('21', 'b00e071a-19aa-5b9a-a379-6ad6795fb24c', '营修楼偏楼', 'Estates and Maintenance Building Annex', 'H15a', ARRAY['營修樓偏樓']::text[], 114.209441542625, 22.4179489934939, 'wgs84'),
  ('22', 'a8bfebbd-87bf-5ac9-a089-446c4198e38d', '大学保健医疗中心', 'University Health Centre', 'H16', ARRAY['大學保健醫療中心']::text[], 114.210141599178, 22.4193077558003, 'wgs84'),
  ('23', '1868c7e7-733f-524d-a8d2-ac7c8b43a3fc', '雅礼宾馆', 'Yali Guest House', 'H17', ARRAY['雅禮賓館']::text[], 114.210729002953, 22.4196895953694, 'wgs84'),
  ('24', '46558a61-f4b3-5c5c-9ce7-483621e92dfb', '昆栋楼', 'Chan Kwan Tung Inter-University Hall', 'H17a', ARRAY['昆棟樓']::text[], 114.210683405399, 22.4198780352894, 'wgs84'),
  ('25', 'f382a966-9d93-5d39-99f4-7491cce84229', '曙光楼（研究生宿舍二座）', 'Chiangs Building (Postgraduate Hall No. 2)', 'H17b', ARRAY['曙光樓（研究生宿舍二座）']::text[], 114.210613667965, 22.4200739133562, 'wgs84'),
  ('26', '2433250b-13c0-5abc-b537-9b8d55921870', '职工宿舍第一座', 'Minor Staff Quarters 1', 'H18', ARRAY['職工宿舍第一座']::text[], 114.209519326687, 22.4196796774718, 'wgs84'),
  ('27', '608ce0c4-8d52-5a66-8aca-91d8a2241d36', '职工宿舍第二座', 'Minor Staff Quarters 2', 'H19', ARRAY['職工宿舍第二座']::text[], 114.209707081318, 22.4197515822134, 'wgs84'),
  ('29', '42f77f5d-7cfa-5f46-9fd7-b8d18c126d9f', '芝苑', 'Panacea Lodge', 'H20a', '{}'::text[], 114.210227429867, 22.420294585784, 'wgs84'),
  ('30', '18ccb280-bdf3-5cec-8fdc-0fd9f03ad0bc', '大学体育中心', 'University Sports Centre', 'H21', ARRAY['大學體育中心']::text[], 114.211050868034, 22.418529196543, 'wgs84'),
  ('31', '83a1f9e4-1d3e-50a0-9f01-945eceba29af', '汾阳体育馆', 'Kwok Sports Building', 'H22', ARRAY['汾陽體育館', 'KSB']::text[], 114.210696816444, 22.4185217580577, 'wgs84'),
  ('32', '9c77d3f7-37d1-504f-a0b6-51f536a3ff7d', '李兆基楼', 'Lee Shau Kee Building', 'H23a', ARRAY['李兆基樓', 'LSK']::text[], 114.203934967518, 22.4195581831686, 'wgs84'),
  ('33', '32585321-1cdb-59cf-a911-26032474d03b', '邵逸夫夫人楼', 'Lady Shaw Building', 'H24', ARRAY['邵逸夫夫人樓', 'LSB']::text[], 114.206853210926, 22.4188788049022, 'wgs84'),
  ('34', '53db00f9-33b3-5155-9cce-518fcf3090dd', '何善衡工程学大楼', 'Ho Sin-Hang Engineering Building', 'H25', ARRAY['何善衡工程學大樓', 'SHB']::text[], 114.207255542278, 22.4179688295356, 'wgs84'),
  ('35', 'd8bc4c31-3e36-50fd-b1bd-fb02a3ac6915', '保安交通中心', 'Security and Transport Building', 'H26', '{}'::text[], 114.203910827637, 22.4185192785625, 'wgs84'),
  ('36', '668613bd-aa64-5b4b-ae8a-3f8a3568fea6', '冯景禧楼', 'Fung King Hey Building', 'H27', ARRAY['馮景禧樓', 'KHB']::text[], 114.203216135502, 22.4195209910138, 'wgs84'),
  ('37', 'd9fa73d3-17d0-541e-ae47-0453b5572fea', '梁𨱇琚楼', 'Leung Kau Kui Building', 'H28', ARRAY['梁銶琚樓', 'KKB']::text[], 114.202781617641, 22.4200094471875, 'wgs84'),
  ('38', '68b326f6-075b-5403-ad82-701a0d239b2a', '富尔敦楼', 'John Fulton Centre', 'H29', ARRAY['富爾敦樓']::text[], 114.204535782337, 22.4182316568206, 'wgs84'),
  ('39', 'c1169ac3-52eb-519c-a762-a5678108e340', '蒙民伟楼', 'Mong Man Wai Building', 'H30', ARRAY['蒙民偉樓', 'MMW']::text[], 114.209197461605, 22.4200515981473, 'wgs84'),
  ('40', 'c2ddb931-ae2e-5804-a949-9d9a4432b139', '蒙民伟工程学大楼', 'William M.W. Mong Engineering Building', 'H32', ARRAY['蒙民偉工程學大樓', 'ERB']::text[], 114.207869768143, 22.4180506531777, 'wgs84'),
  ('41', '758ecd84-e451-5b72-b86f-1877eac9c18b', '教研楼一座', 'Academic Building No. 1', 'H33', ARRAY['教研樓一座']::text[], 114.207314550877, 22.4173861446302, 'wgs84'),
  ('42', 'f3d24964-3ada-5120-9b29-1de5a11e0fd3', '逸夫科学大楼', 'Run Run Shaw Science Building', 'H34', ARRAY['逸夫科學大樓']::text[], 114.207998514175, 22.418888722857, 'wgs84'),
  ('43', '02e1b73d-7b12-5d64-973c-31858b9f303d', '卫星遥感地面接收站', 'Satellite Remote Sensing Receiving Station', 'H40', ARRAY['衛星遙感地面接收站']::text[], 114.206646680832, 22.4211326419221, 'wgs84'),
  ('44', '4163731c-b233-5e71-ab85-ec5c0fb0c181', '利黄瑶璧楼', 'Esther Lee Building', 'C1', ARRAY['利黃瑤璧樓', 'ELB']::text[], 114.208443760872, 22.4139842077901, 'wgs84'),
  ('45', '8d0f16d8-ba27-5db2-a235-b7191bf2165b', '利希慎音乐厅', 'Lee Hysan Concert Hall', 'C1a', ARRAY['利希慎音樂廳']::text[], 114.208636879921, 22.4139296571038, 'wgs84'),
  ('46', 'ab461d2e-b51b-5583-8e19-19f2c0db999d', '崇基学院行政楼', 'Chung Chi College Administration Building', 'C2', ARRAY['崇基學院行政樓']::text[], 114.208108484745, 22.4145098769426, 'wgs84'),
  ('47', 'a867089b-2d94-5bd6-96b9-3ab5c0ffa5a1', '李慧珍楼', 'Li Wai Chun Building', 'C3', ARRAY['李慧珍樓']::text[], 114.207011461258, 22.4150801761317, 'wgs84'),
  ('48', '2a59baa1-53e6-5c4b-8ca8-fff23b60f01e', '许让成楼', 'Hui Yeung Shing Building', 'C3a', ARRAY['許讓成樓', 'HYS']::text[], 114.207698106766, 22.4146834465089, 'wgs84'),
  ('49', 'e54996c5-2124-5235-8c7b-612ab47fadd6', '王福元楼', 'Wong Foo Yuan Building', 'C3b', ARRAY['王福元樓', 'FYB']::text[], 114.207553267479, 22.4150008302978, 'wgs84'),
  ('50', '42186269-a5d4-57b4-ab6d-a75d13e379bc', '陈国本楼', 'Chen Kou Bun Building', 'C3c', ARRAY['陳國本樓', 'CKB']::text[], 114.207397699356, 22.4153454884348, 'wgs84'),
  ('51', '97a9e390-c3d6-558d-ae27-dc60ed677041', '信和楼', 'Sino Building', 'C3d', ARRAY['信和樓', 'SB']::text[], 114.207209944725, 22.4155884843051, 'wgs84'),
  ('52', 'd5525f65-acda-5af6-9291-dd318dfc84b9', '崇基教堂', 'Chung Chi College Chapel', 'C4', ARRAY['CCCC']::text[], 114.206930994987, 22.4159777727215, 'wgs84'),
  ('53', 'e1355bc3-6bfb-5daa-8171-a5d0ceafffa2', '神学楼', 'Theology Building', 'C5', ARRAY['神學樓', 'CCT']::text[], 114.20632481575, 22.4173464723775, 'wgs84'),
  ('54', 'b9c6604c-b079-505b-82c2-2d8e09bb61ac', '岭南体育馆', 'Lingnan Stadium', 'C6', ARRAY['嶺南體育館', 'LN']::text[], 114.208706617355, 22.4148917297021, 'wgs84'),
  ('55', 'e1f47035-39db-5cdf-9d69-ae5a16f12f14', '何添楼', 'Ho Tim Building', 'C8', ARRAY['何添樓', 'HTB']::text[], 114.207781255245, 22.4152859791772, 'wgs84'),
  ('56', '19361e44-c72d-5c61-85f4-2053f1128d83', '兰苑', 'Orchid Lodge', 'C9', ARRAY['蘭苑']::text[], 114.207623004913, 22.415548811539, 'wgs84'),
  ('57', '0a73489d-1d58-5acd-9e92-c8b4c7b53de2', '联谊会', 'Staff Club', 'C10', ARRAY['聯誼會']::text[], 114.207609593868, 22.4159653750181, 'wgs84'),
  ('58', '52bbd70c-af5c-5466-a63c-d6eda21e421e', '牟路思怡图书馆', 'Elisabeth Luce Moore Library', 'C11', ARRAY['牟路思怡圖書館']::text[], 114.208663702011, 22.4165356682314, 'wgs84'),
  ('59', '6be958bc-ce0c-55b2-b495-b42f73ba3e33', '众志堂', 'Chung Chi Tang', 'C12', ARRAY['眾志堂']::text[], 114.209699034691, 22.4166571651786, 'wgs84'),
  ('60', 'c1cb6a71-0ec3-5bdd-b455-1fa81985e525', '方润华堂', 'Fong Yun Wah Hall', 'C13', ARRAY['方潤華堂']::text[], 114.210568070412, 22.4156306366067, 'wgs84'),
  ('61', 'a2be9e9c-ce18-5cc8-8db3-4fef57f2a776', '方树泉楼', 'Fong Shu Chuen Building', 'C14', ARRAY['方樹泉樓']::text[], 114.210366904736, 22.4153628452967, 'wgs84'),
  ('62', 'b06da003-d644-54b9-a67b-bb78008c7280', '崇基教职员宿舍A座', 'Staff Quarters A', 'C15', ARRAY['崇基教職員宿舍A座']::text[], 114.207317233086, 22.4168406501628, 'wgs84'),
  ('63', '2bf3a5dc-2866-542d-8e0d-d043d4dd7883', '崇基教职员宿舍B座', 'Staff Quarters B', 'C16', ARRAY['崇基教職員宿舍B座']::text[], 114.207679331303, 22.4168406501628, 'wgs84'),
  ('64', '34d9b9cc-4ff4-55cc-aedc-bf8383143924', '崇基教职员宿舍C座', 'Staff Quarters C', 'C17', ARRAY['崇基教職員宿舍C座']::text[], 114.20801192522, 22.4170216553826, 'wgs84'),
  ('67', '85a63462-8560-5e92-989d-04c81c9dbc33', '华连堂', 'Hua Lien Tang', 'C20', ARRAY['華連堂']::text[], 114.209562242031, 22.417140672385, 'wgs84'),
  ('68', '0e8c823c-a493-5af6-a8e9-d3aa79508c4e', '明华堂', 'Ming Hua Tang', 'C21', ARRAY['明華堂']::text[], 114.210364222527, 22.4173985422068, 'wgs84'),
  ('69', '179ffa3e-3cf4-53ed-8332-8f2012680b2d', '应林堂', 'Ying Lin Tang', 'C22', ARRAY['應林堂']::text[], 114.210659265518, 22.4165852588349, 'wgs84'),
  ('70', 'e169469f-7737-5e2d-8337-9af23db641ef', '何善衡夫人宿舍', 'Madam S.H. Ho Hall', 'C23', '{}'::text[], 114.211187660694, 22.4174679686155, 'wgs84'),
  ('71', '2d9841f9-529c-5d6e-8638-ccbe1bf9e2c0', '文质堂', 'Wen Chih Tang', 'C24', ARRAY['文質堂']::text[], 114.211646318436, 22.4173613494736, 'wgs84'),
  ('72', '1176b999-704d-5fa0-ac30-1ea92c2cc1de', '崇基教职员宿舍S座', 'Staff Quarters S', 'C25', ARRAY['崇基教職員宿舍S座']::text[], 114.211329817772, 22.4169348720875, 'wgs84'),
  ('76', 'd6d48122-49fd-5d1e-a07d-531bfc267940', '崇基教职员宿舍E座', 'Staff Quarters E', 'C29', ARRAY['崇基教職員宿舍E座']::text[], 114.209245741367, 22.4133891082358, 'wgs84'),
  ('77', '0489925a-76f6-5c54-a1d4-48728779bf48', '博文苑（研究生宿舍三座）', 'Inter-University Hall (Postgraduate Hall No.3)', 'C30', '{}'::text[], 114.209454953671, 22.4131361901533, 'wgs84'),
  ('78', '3c005330-30d3-53cb-bdc9-df9df1e796dd', '文林堂', 'Wen Lin Tang', 'C31', '{}'::text[], 114.207671284676, 22.413309761436, 'wgs84'),
  ('79', 'd7446be9-04fa-5990-be20-633abc904e63', '利树培堂', 'Lee Shu Pui Hall', 'C32', ARRAY['利樹培堂']::text[], 114.210965037346, 22.4170315734701, 'wgs84'),
  ('80', '6d9e43cc-6769-5ac2-a445-2df3b8dbea79', '五旬节会楼（高座）', 'Pentecostal Mission Hall Complex (High Block)', 'C34a', ARRAY['五旬節會樓（高座）']::text[], 114.209318161011, 22.418531676038, 'wgs84'),
  ('81', '3c780f2a-ff5b-5be3-965e-050e6e83f5c2', '五旬节会楼（低座）', 'Pentecostal Mission Hall Complex (Low Block)', 'C34b', ARRAY['五旬節會樓（低座）']::text[], 114.209774136543, 22.4187969817481, 'wgs84'),
  ('82', '631f84c4-9daa-5a40-bafc-886dbb59121a', '诚明馆', 'Cheng Ming Building', 'N1', ARRAY['誠明館', 'NAA']::text[], 114.207990467548, 22.4212714909714, 'wgs84'),
  ('83', '9746c02f-3bd9-50a5-9b1c-261d6c52e01a', '人文馆', 'Humanities Building', 'N2', ARRAY['人文館', 'NAH']::text[], 114.208111166954, 22.4216508457018, 'wgs84'),
  ('84', '27e65cd1-21a4-51b6-9fae-f3469a0813b0', '钱穆图书馆', 'Ch''ien Mu Library', 'N3', ARRAY['錢穆圖書館', 'CML']::text[], 114.208526909351, 22.4214301754291, 'wgs84'),
  ('85', '0e13b23c-9630-59c2-96a4-ba504850e59a', '乐群馆—梁雄姬楼', 'Staff Student Centre - Leung Hung Kee Building', 'N4', ARRAY['樂群館—梁雄姬樓']::text[], 114.209259152412, 22.4208822173929, 'wgs84'),
  ('86', '6818a51c-7f9a-5b51-a28e-8881e6ec85a1', '知行楼', 'Chih Hsing Hall', 'N5', ARRAY['知行樓']::text[], 114.210122823715, 22.421174792541, 'wgs84'),
  ('87', 'b8911134-e551-5526-9806-60542df74ec7', '会友楼', 'Friendship Lodge', 'N6', ARRAY['會友樓']::text[], 114.208784401417, 22.4218516801395, 'wgs84'),
  ('88', '8b72611f-a8e9-5b18-8dfb-dbe102db3adf', '学思楼', 'Xuesi Hall', 'N7', ARRAY['學思樓']::text[], 114.209597110748, 22.4215243942401, 'wgs84'),
  ('89', '61fe2186-7d00-5a24-9cb2-2861862dd125', '志文楼', 'Grace Tien Hall', 'N8', ARRAY['志文樓']::text[], 114.21057343483, 22.4215392708886, 'wgs84'),
  ('90', '4afbdeac-f8dd-5819-b066-18305e58251a', '紫霞楼', 'Daisy Li Hall', 'N9', ARRAY['紫霞樓']::text[], 114.210672676563, 22.4211103268834, 'wgs84'),
  ('91', '7c948162-da21-5549-ba39-349fd4b04b3e', '曾肇添楼', 'Tsang Shiu Tim Building', 'U1', ARRAY['曾肇添樓', 'UCA']::text[], 114.204589426517, 22.4204979016431, 'wgs84'),
  ('92', 'eba56619-605b-5b13-abb3-5e26d23a3e03', '联合书院胡忠图书馆', 'United College Wu Chung Library', 'U2', ARRAY['聯合書院胡忠圖書館']::text[], 114.204804003239, 22.4209045324683, 'wgs84'),
  ('93', '8f18bbbd-2982-59bb-b130-60e295f78cd1', '郑栋材楼', 'T.C. Cheng Building', 'U3', ARRAY['鄭棟材樓', 'UCC']::text[], 114.204573333263, 22.4212194225942, 'wgs84'),
  ('94', '0b718c3b-b8b1-533b-90d9-522333bf578f', '张祝珊师生康乐大楼', 'Cheung Chuk Shan Amenities Building', 'U4', ARRAY['張祝珊師生康樂大樓']::text[], 114.20589029789, 22.4209516420601, 'wgs84'),
  ('95', '9e509e35-8e63-54a6-b613-be91a4c55e7b', '汤若望宿舍', 'Adam Schall Residence', 'U5', ARRAY['湯若望宿舍']::text[], 114.205651581287, 22.4218070502895, 'wgs84'),
  ('96', 'ded4ddd7-75a5-53e3-aab1-7bca63ba4a01', '伯利衡宿舍', 'Bethlehem Hall', 'U6', '{}'::text[], 114.206171929836, 22.4214698465152, 'wgs84'),
  ('97', 'be8952b1-0dea-501c-b0dc-09db5657d4c9', '联合苑', 'U.C. Staff Residence', 'U7', ARRAY['聯合苑']::text[], 114.205445051193, 22.4232897454042, 'wgs84'),
  ('98', '7f501cb9-bc73-5a2a-a908-2e7bedc7b842', '恒生楼', 'Hang Seng Hall', 'U8', ARRAY['恒生樓']::text[], 114.205040037632, 22.4228285743726, 'wgs84'),
  ('99', '86bf98c1-1430-5977-a562-730d462b430b', '陈震夏宿舍', 'Chan Chun Ha Hostel', 'U11', ARRAY['陳震夏宿舍']::text[], 114.204889833927, 22.4220326788283, 'wgs84'),
  ('100', '71f9dd52-c509-579c-bbda-3cf712f3a7d3', '国楙楼（高座）', 'Kuo Mou Hall (High Block)', 'S1', ARRAY['國楙樓（高座）']::text[], 114.200896024704, 22.4224764965325, 'wgs84'),
  ('101', '0f05f92b-a2b7-599f-8b71-18ca5c172e6a', '国楙楼（低座）', 'Kuo Mou Hall (Low Block)', 'S2', ARRAY['國楙樓（低座）']::text[], 114.201309084892, 22.4226971651423, 'wgs84'),
  ('102', 'b7a25b01-633e-5d76-b011-237b829c320f', '文澜堂', 'Wen Lan Tang', 'S3', ARRAY['文瀾堂', 'WLS']::text[], 114.201773107052, 22.4231657748473, 'wgs84'),
  ('103', '14348c93-4806-525a-b0c3-8f28e4fd6c6a', '雅群楼', 'Ya Qun Lodge', 'S4', ARRAY['雅群樓']::text[], 114.20191526413, 22.4228905598154, 'wgs84'),
  ('104', '75c0a95d-931e-595d-bb07-2f3f4efc73e7', '大讲堂', 'Shaw College Lecture Theatre', 'S5', ARRAY['大講堂', 'SWC LT']::text[], 114.201633632183, 22.4223376486881, 'wgs84'),
  ('105', '9aca4283-a8ad-5cc5-8248-6e00ade56034', '逸仙楼', 'Yat Sen Hall', 'S6', ARRAY['逸仙樓']::text[], 114.201223254204, 22.4232475954273, 'wgs84'),
  ('106', '50c2d277-3a47-557e-8f8d-2d80330f174c', '逸夫书院第二学生宿舍（低座）', 'Shaw College Student Hostel 2 (Low Block)', 'S8', ARRAY['逸夫書院第二學生宿舍（低座）']::text[], 114.20109719038, 22.4237409972966, 'wgs84'),
  ('107', 'ab788e79-4877-56f0-aa56-804e04bbb6a4', '国际生舍堂一座', 'International House 1', 'IH1', ARRAY['國際生舍堂一座']::text[], 114.204350709915, 22.4231930483793, 'wgs84'),
  ('108', 'a722ae61-c9e8-5ee5-9a50-9d757bf1ff8e', '国际生舍堂二座', 'International House 2', 'IH2', ARRAY['國際生舍堂二座']::text[], 114.204460680485, 22.4236393417785, 'wgs84'),
  ('109', 'b45a5430-1724-5a8a-837b-4ffafbf5a188', '赛马会研究生宿舍（一座）', 'Jockey Club Postgraduate Hall 1', 'PGH1', ARRAY['賽馬會研究生宿舍（一座）']::text[], 114.211978912354, 22.42032185988, 'wgs84'),
  ('110', '2abe37e9-7093-52cf-8eb3-d57752737c7a', '研究生宿舍四座', 'Postgraduate Hall No. 4', 'PGH4', '{}'::text[], 114.204916656017, 22.4238029823321, 'wgs84'),
  ('111', '17987e71-8911-5fe2-aee9-dfb1b34a83ce', '研究生宿舍五座', 'Postgraduate Hall No. 5', 'PGH5', '{}'::text[], 114.205031991005, 22.4242864646592, 'wgs84'),
  ('112', '33758331-ef12-555f-a496-5bb78924662a', '研究生宿舍六座', 'Postgraduate Hall No. 6', 'PGH6', '{}'::text[], 114.204712808132, 22.4244352281134, 'wgs84'),
  ('113', '3de85098-5bde-5436-b71b-4668b29c77e8', '汉园', 'Vice-Chancellor''s Residence', 'V1', ARRAY['漢園']::text[], 114.202808439732, 22.4167141943213, 'wgs84'),
  ('116', '2cdc1927-57b0-5a5c-af4b-11e05f183e45', '第三苑', 'University Residence No. 3', 'R3', '{}'::text[], 114.203039109707, 22.4214351343155, 'wgs84'),
  ('117', '4f381d71-5898-599b-8877-fc3a515d8758', '第四苑', 'University Residence No. 4', 'R4', '{}'::text[], 114.202524125576, 22.4216235718668, 'wgs84'),
  ('118', 'ea9fe28c-1927-59a1-8177-cb4acf87a5f1', '第十苑', 'University Residence No. 10', 'R10', '{}'::text[], 114.208111166954, 22.4248244917311, 'wgs84'),
  ('119', 'd56ec307-e596-5436-a380-3206492204c8', '第十一苑', 'University Residence No. 11', 'R11', '{}'::text[], 114.208306968212, 22.4243087791875, 'wgs84'),
  ('120', '6872cb1f-31d3-5041-87ba-06042d5caa3a', '第十二苑', 'University Residence No. 12', 'R12', '{}'::text[], 114.20700609684, 22.424474898341, 'wgs84'),
  ('121', 'd9f3ac0e-1efc-58ed-a164-8f87b84b639a', '第十三苑', 'University Residence No. 13', 'R13', '{}'::text[], 114.20738697052, 22.424437707503, 'wgs84'),
  ('122', '9c490706-eabb-51a4-b033-aecfd14c3037', '第十四苑', 'University Residence No. 14', 'R14', '{}'::text[], 114.207175076008, 22.4239567051007, 'wgs84'),
  ('123', 'ce933a79-217e-5d1f-a710-22c6140c4891', '第十五苑', 'University Residence No. 15', 'R15', '{}'::text[], 114.20681566, 22.4234657834048, 'wgs84'),
  ('124', '80fad5ec-b4bb-5ac3-a206-9b0fae942a45', '第十六苑', 'University Residence No. 16', 'R16', '{}'::text[], 114.20798510313, 22.4237261208839, 'wgs84'),
  ('125', '8c316886-cd77-5928-9215-7a4504d042f8', '第十七苑', 'University Residence No. 17', 'R17', '{}'::text[], 114.208347201347, 22.423436030519, 'wgs84'),
  ('126', '9d5f285e-3226-5168-825e-40f4f306bec6', '香港生物科技研究院', 'Hong Kong Institute of Biotechnology', 'E1', '{}'::text[], 114.213384389877, 22.4224343463087, 'wgs84'),
  ('127', '4a0389fb-3254-5041-93e0-0c39f32518c2', '教研楼二座', 'Academic Building No. 2', 'E2', ARRAY['教研樓二座']::text[], 114.213652610779, 22.4227814654176, 'wgs84'),
  ('128', '7ab2dbda-3b34-5633-b70b-ba3b6e25d52f', '李福善海洋科学研究中心李福善楼', 'Simon F.S. Li Marine Science Laboratory Simon F.S. Li Building', 'E3', ARRAY['李福善海洋科學研究中心李福善樓']::text[], 114.214374125004, 22.4220054050684, 'wgs84'),
  ('129', 'c5831fef-1bcc-5a20-944d-76201e63a286', '水上活动中心', 'Water Sports Centre', 'E4', ARRAY['水上活動中心']::text[], 114.214336574078, 22.4185068810859, 'wgs84'),
  ('130', 'a3fea3ae-0461-541e-bd7b-34210834629f', '上海总会科研技术中心', 'Shanghai Fraternity Association Research Services Centre', 'E5', ARRAY['上海總會科研技術中心']::text[], 114.21234369278, 22.4159257023596, 'wgs84'),
  ('131', '9cca551f-b560-59a5-b638-e2629925822a', '自然地理实验站', 'Physical Geography Experimental Station', 'E5a', ARRAY['自然地理實驗站']::text[], 114.212099611759, 22.415444670474, 'wgs84'),
  ('133', '92dcbdea-6bd7-5c9d-ba52-a8b0e26b10dd', '运动场一号室', 'Sports Field Annex 1', 'H21a', ARRAY['運動場一號室']::text[], 114.21247780323, 22.4186333352952, 'wgs84'),
  ('135', 'bfd6b8c3-e574-57d8-bb4f-ff6483f65ebf', '郑裕彤楼', 'Cheng Yu Tung Building', 'E8', ARRAY['鄭裕彤樓', 'CYT']::text[], 114.210632443428, 22.4122633712731, 'wgs84'),
  ('136', '79581ba8-3d9c-5d98-95fb-c84d52091add', '香港凯悦酒店—沙田', 'Hyatt Regency Hong Kong, Shatin', 'E9', ARRAY['香港凱悅酒店—沙田']::text[], 114.211163520813, 22.411792245167, 'wgs84'),
  ('138', '7de39d8f-0818-5bdc-9cf8-8cd4d981650e', '贮物库', 'Nissen Huts', 'H31', ARRAY['貯物庫']::text[], 114.211876988411, 22.4197565411597, 'wgs84'),
  ('139', '00c82a5d-6f94-5016-b9ca-5979c0a55589', '李达三楼', 'Li Dak Sum Building', 'H23', ARRAY['李達三樓', 'LDS']::text[], 114.20379281044, 22.4193796607344, 'wgs84'),
  ('140', '82737a9a-a5f2-59e7-8ba8-073407717995', '文物馆西翼', 'West Wing of the Art Museum', 'H4a', ARRAY['文物館西翼']::text[], 114.206133835477, 22.4192261312316, 'wgs84'),
  ('141', '8bc86eff-9ba8-5ba6-b457-cfa94b0714ac', '文物馆东翼', 'East Wing of the Art Museum', 'H4b', ARRAY['文物館東翼', 'AMEW']::text[], 114.206345729989, 22.4192162133009, 'wgs84'),
  ('142', 'dc55cf10-14df-53fd-a143-137983bc4585', '物业管理处总部', 'Estates Management Office Headquarters', 'H46', ARRAY['物業管理處總部']::text[], 114.212713837624, 22.4191713842711, 'wgs84'),
  ('145', 'c25657cd-8d47-5e20-bdd5-8da984f77775', '庞万伦学生中心', 'Pommerenke Student Centre', 'C38', ARRAY['龐萬倫學生中心']::text[], 114.208800494671, 22.417165467581, 'wgs84'),
  ('147', '34c21f7e-9bdb-5367-b90c-20d9d0506106', '容启东校长纪念楼', 'President Chi-tung Yung Memorial Building', 'C5a', ARRAY['容啟東校長紀念樓']::text[], 114.206367731094, 22.4168009777543, 'wgs84'),
  ('149', '31106cb8-6bd4-50b9-b89c-8153a77ca437', '卫星遥感地面接收站', 'Satellite Remote Sensing Receiving Station', 'E13', ARRAY['衛星遙感地面接收站']::text[], 114.214408993721, 22.4193920581331, 'wgs84'),
  ('151', '14380791-ae0d-561c-8060-ca62ec7c0462', '霍英东遥感科学馆', 'Fok Ying Tung Remote Sensing Science Building', 'H40a', ARRAY['霍英東遙感科學館']::text[], 114.206941723824, 22.4213111621028, 'wgs84'),
  ('152', 'a3473c73-5642-5dd0-b1aa-7f58f0ef2d81', '罗桂祥综合生物医学大楼', 'Lo Kwee-Seong Integrated Biomedical Sciences Building', 'A8', ARRAY['羅桂祥綜合生物醫學大樓']::text[], 114.204071760178, 22.42746252978, 'wgs84'),
  ('153', '545893b6-b89b-5067-aba0-c86518aa8fa8', '康本国际学术园', 'Yasumoto International Academic Park', 'C39a', ARRAY['康本國際學術園', 'YIA']::text[], 114.210965037346, 22.4163546623782, 'wgs84'),
  ('154', 'ff31333b-7806-5d80-a94d-91f45877ae3e', '伍何曼原楼', 'Wu Ho Man Yuen Building', 'C39b', ARRAY['伍何曼原樓', 'WMY']::text[], 114.211614131927, 22.4166968376282, 'wgs84'),
  ('155', '9131487c-d363-576c-9dac-20e958e746f3', '李兆基建筑学大楼', 'Lee Shau Kee Architecture Building', 'C39c', ARRAY['李兆基建築學大樓']::text[], 114.211748242378, 22.4163596214458, 'wgs84'),
  ('156', 'e6090cf2-e4f4-52ea-b6d5-aa0a3d1fd009', '格林伯格楼', 'Maurice R. Greenberg Building', 'MC1', ARRAY['格林伯格樓']::text[], 114.210278391838, 22.4190325331221, 'wgs84'),
  ('157', 'b617bfb9-dbad-5f4c-beb6-7ea30408f826', '晨兴书院学生宿舍（高座）', 'Morningside College Student Hostel (High Block)', 'MC2', ARRAY['晨興書院學生宿舍（高座）']::text[], 114.210289120674, 22.4188292151176, 'wgs84'),
  ('158', 'a471edef-2a2f-593b-8182-e4c9fbac7888', '何添堂', 'Ho Tim Hall', 'SH1', '{}'::text[], 114.210058450699, 22.4185465530071, 'wgs84'),
  ('159', '48a7e77b-c560-5d8a-be39-86b669e463ef', '利国伟堂', 'Lee Quo Wei Hall', 'SH2', ARRAY['利國偉堂']::text[], 114.209763407707, 22.41827380832, 'wgs84'),
  ('160', '98ae5087-3521-5afc-acc7-546e9f728215', '国际生舍堂三座', 'International House 3', 'IH3', ARRAY['國際生舍堂三座']::text[], 114.210106730461, 22.4199846524992, 'wgs84'),
  ('161', 'e43423a1-b813-53f2-88a9-cbe8d72c9293', '禤永明楼', 'Huen Wing Ming Building', 'S4a', ARRAY['禤永明樓']::text[], 114.202065467834, 22.4226178236601, 'wgs84'),
  ('162', '11a13e06-43a6-5caa-b315-0843c0ce8d19', '何陈婉珍楼', 'Ina Ho Chan Un Chan Building', 'CW1', ARRAY['何陳婉珍樓']::text[], 114.206453561783, 22.4251319348362, 'wgs84'),
  ('163', '6ff656f5-07be-54aa-8e0e-fce36d2fddfe', '敬文书院学生宿舍', 'C.W. Chu College Student Hostel', 'CW2', ARRAY['敬文書院學生宿舍']::text[], 114.206153154373, 22.4249930896472, 'wgs84'),
  ('165', '0d871aeb-ceb7-5eb5-be2d-da694fdac737', '伍宜孙书院学生宿舍西座', 'Wu Yee Sun College Student Hostel West Block', 'YS1', ARRAY['伍宜孫書院學生宿舍西座']::text[], 114.202419519424, 22.4221566503968, 'wgs84'),
  ('167', '4c549c98-5896-5b9f-9de7-0411555d6a6c', '伍宜孙书院学生宿舍东座', 'Wu Yee Sun College Student Hostel East Block', 'YS2', ARRAY['伍宜孫書院學生宿舍東座']::text[], 114.202902317047, 22.422305416133, 'wgs84'),
  ('168', 'be721823-9325-52ef-b3d2-c248e700716b', '伍宜孙书院康体中心', 'Wu Yee Sun College Activity Centre', 'YS3', ARRAY['伍宜孫書院康體中心']::text[], 114.202805757523, 22.4224045932018, 'wgs84'),
  ('169', '7645547b-2ad2-5812-8a0a-89f56c21c00a', '顾铁华费肇芬伉俪楼', 'Dorothy and Ti-Hua Koo Building', 'WS1', ARRAY['顧鐵華費肇芬伉儷樓']::text[], 114.204103946686, 22.4222260744268, 'wgs84'),
  ('170', '3b6734d3-8b3d-5ced-bdaa-ab04244e9e83', '和声书院北座', 'Lee Woo Sing College North Block', 'WS2', ARRAY['和聲書院北座']::text[], 114.20444726944, 22.4226128648159, 'wgs84'),
  ('171', '88bd6fbc-3c98-5946-be1a-2cb94224e3cd', '李达三叶耀珍伉俪楼', 'Li Dak Sum Yip Yio Chin Building', 'H3b', ARRAY['李達三葉耀珍伉儷樓']::text[], 114.204694032669, 22.4198011716687, 'wgs84'),
  ('172', 'c79912bd-dd03-5ea3-80cd-b4d77b9c8c39', '朱谢玲玲楼', 'Marina Tse Chu Building', 'CW3', ARRAY['朱謝玲玲樓']::text[], 114.205992221832, 22.4250873060406, 'wgs84'),
  ('173', '3496ffcb-dbdb-580a-b522-626c723c86d8', '赛马会研究生宿舍（二座）', 'Jockey Club Postgraduate Hall 2', 'PGH2', ARRAY['賽馬會研究生宿舍（二座）']::text[], 114.206320187039, 22.4259951945579, 'wgs84'),
  ('174', 'bef54df7-d986-5424-8ca4-70eb7d9f8eab', '赛马会研究生宿舍（三座）', 'Jockey Club Postgraduate Hall 3', 'PGH3', ARRAY['賽馬會研究生宿舍（三座）']::text[], 114.205810567326, 22.4259406485894, 'wgs84'),
  ('177', '81524626-87b8-59ba-9285-737864208b22', '香港中文大学医院', 'CUHK Medical Centre', 'E10', ARRAY['香港中文大學醫院']::text[], 114.211399567048, 22.4133235273443, 'wgs84'),
  ('178', '3952622d-0280-5462-9efd-70fd5ccbcb7e', '梁凤仪楼', 'Leung Fung Yee Building', 'C41a', ARRAY['梁鳳儀樓']::text[], 114.208306424779, 22.4178971222057, 'wgs84'),
  ('179', '788bf8ca-7d1d-504d-af8b-f2eb02631fc1', '龚约翰学生中心', 'Kunkle Student Centre', 'C41b', ARRAY['龔約翰學生中心']::text[], 114.208687298459, 22.4173764249035, 'wgs84'),
  ('180', 'bb9e949f-50c4-5db4-9552-3219d8b4de17', '学生宿舍', 'Student Hostel', 'N12', ARRAY['學生宿舍']::text[], 114.208360068959, 22.4203270171372, 'wgs84')
) AS incoming (
  source_building_id, id, name, english_name, code, aliases,
  anchor_longitude, anchor_latitude, anchor_crs
);
--> statement-breakpoint
INSERT INTO "campus_map_buildings" (
  "id", "name", "english_name", "code", "aliases",
  "anchor_longitude", "anchor_latitude", "anchor_crs"
)
SELECT id::uuid, name, english_name, code, aliases, anchor_longitude, anchor_latitude, anchor_crs
FROM "campus_map_building_bootstrap_items"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "campus_map_building_provenance" ("building_id", "provenance_id")
SELECT existing."id", source."id"
FROM "campus_map_building_bootstrap_items" incoming
JOIN "campus_map_buildings" existing ON existing."id" = incoming.id::uuid
JOIN "campus_map_provenance_sources" source
  ON source."source_kind" = 'official'
 AND source."source_ref" = 'cuhk-campus-map:buildings:20161006:sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda'
ON CONFLICT ("building_id", "provenance_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "campus_map_provenance_sources" (
  "id", "source_kind", "source_ref", "source_url", "source_owner",
  "source_version", "snapshot_hash", "accessed_on", "rights_status",
  "limitations", "note", "source_coordinate_x", "source_coordinate_y",
  "source_coordinate_crs"
)
SELECT
  gen_random_uuid(),
  'official',
  dataset."source_ref" || ':building:' || incoming.source_building_id,
  dataset."source_url",
  dataset."source_owner",
  dataset."source_version",
  dataset."snapshot_hash",
  dataset."accessed_on",
  dataset."rights_status",
  dataset."limitations",
  'Official building item ' || incoming.source_building_id ||
    ' explicitly linked to canonical Building ' || incoming.id || '.',
  incoming.anchor_longitude,
  incoming.anchor_latitude,
  incoming.anchor_crs
FROM "campus_map_building_bootstrap_items" incoming
JOIN "campus_map_buildings" existing ON existing."id" = incoming.id::uuid
JOIN "campus_map_provenance_sources" dataset
  ON dataset."source_kind" = 'official'
 AND dataset."source_ref" = 'cuhk-campus-map:buildings:20161006:sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda'
ON CONFLICT ("source_kind", "source_ref") DO NOTHING;
--> statement-breakpoint
INSERT INTO "campus_map_building_provenance" ("building_id", "provenance_id")
SELECT incoming.id::uuid, item."id"
FROM "campus_map_building_bootstrap_items" incoming
JOIN "campus_map_buildings" existing ON existing."id" = incoming.id::uuid
JOIN "campus_map_provenance_sources" dataset
  ON dataset."source_kind" = 'official'
 AND dataset."source_ref" = 'cuhk-campus-map:buildings:20161006:sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda'
JOIN "campus_map_provenance_sources" item
  ON item."source_kind" = 'official'
 AND item."source_ref" = dataset."source_ref" || ':building:' || incoming.source_building_id
ON CONFLICT ("building_id", "provenance_id") DO NOTHING;
--> statement-breakpoint
DROP TABLE "campus_map_building_bootstrap_items";
--> statement-breakpoint
INSERT INTO "campus_map_provenance_sources" (
  "id", "source_kind", "source_ref", "source_owner", "source_version",
  "accessed_on", "rights_status", "limitations", "note",
  "source_coordinate_x", "source_coordinate_y", "source_coordinate_crs",
  "conversion_method", "conversion_version"
) VALUES (
  '39515576-131d-4440-9fee-0ec2469c7a48',
  'provider-candidate',
  'amap:poi:B0J2RXUQB6:hotspotclick:2026-08-26',
  'AutoNavi',
  'AMap JavaScript API',
  '2026-08-26',
  'unknown',
  'Provider label, object ID, and GCJ-02 point are transient evidence; they do not establish canonical identity on their own.',
  'Live hotspotclick observed ScienceCentre科学馆 with provider object B0J2RXUQB6; the object was reviewed against the official Science Centre name and nearby official WGS84 anchor, then retained for an explicit audited registry decision.',
  114.20801,
  22.41966,
  'gcj02',
  'provider-adapter',
  'amap-jsapi-hotspotclick@2026-08-26'
) ON CONFLICT ("source_kind", "source_ref") DO NOTHING;
