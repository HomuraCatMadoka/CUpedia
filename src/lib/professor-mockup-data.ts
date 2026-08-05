export type ProfessorDirectoryPreview = {
  slug: string;
  name: string;
  title: string;
  faculty: string;
  department: string;
  imageUrl: string | null;
  profileUrl: string;
  rating: number | null;
  ratingCount: number;
};

export const professorDirectoryPreview: ProfessorDirectoryPreview[] = [
  {
    slug: "liu-shengchao",
    name: "LIU Shengchao",
    title: "Assistant Professor",
    faculty: "工程学院",
    department: "计算机科学与工程学系",
    imageUrl:
      "https://www.cse.cuhk.edu.hk/wp-content/uploads/people/sclui_s.png",
    profileUrl: "https://www.cse.cuhk.edu.hk/people/faculty/shengchao-liu/",
    rating: 3,
    ratingCount: 2,
  },
  {
    slug: "qiu-shi",
    name: "QIU Shi",
    title: "Research Assistant Professor",
    faculty: "工程学院",
    department: "计算机科学与工程学系",
    imageUrl:
      "https://www.cse.cuhk.edu.hk/wp-content/uploads/people/QIU-Shi.jpg",
    profileUrl: "https://www.cse.cuhk.edu.hk/people/faculty/shi-qiu/",
    rating: null,
    ratingCount: 0,
  },
  {
    slug: "flores-castillo-luis-roberto",
    name: "FLORES CASTILLO Luis Roberto",
    title: "Professor",
    faculty: "理学院",
    department: "物理系",
    imageUrl: "https://wp.phy.cuhk.edu.hk/wp-content/uploads/castillo.jpg",
    profileUrl:
      "https://wp.phy.cuhk.edu.hk/teaching_staff/luis-roberto-flores-castillo",
    rating: null,
    ratingCount: 0,
  },
  {
    slug: "lin-shu",
    name: "LIN Shu",
    title: "Professor",
    faculty: "社会科学院",
    department: "经济学系",
    imageUrl:
      "https://www.econ.cuhk.edu.hk/wp-content/uploads/2025/04/p_0017_LIN_Shu.jpg",
    profileUrl:
      "https://www.econ.cuhk.edu.hk/en/about/people/faculty/regular-faculty-members/prof-lin-shu/",
    rating: null,
    ratingCount: 0,
  },
  {
    slug: "he-qian",
    name: "HE Qian",
    title: "Vice-Chancellor Assistant Professor",
    faculty: "社会科学院",
    department: "社会学系",
    imageUrl:
      "https://www.soc.cuhk.edu.hk/wp-content/uploads/2019/02/Qian-He-picture.jpg",
    profileUrl: "https://www.soc.cuhk.edu.hk/profile/he-qian/",
    rating: null,
    ratingCount: 0,
  },
  {
    slug: "huang-hui",
    name: "HUANG Hui",
    title: "Courtesy Joint Professor",
    faculty: "工商管理学院",
    department: "商学院",
    imageUrl:
      "https://www.bschool.cuhk.edu.hk/wp-content/uploads/Huang-Robin-Hui_thumbnail_202605-2048x2048.png",
    profileUrl: "https://www.bschool.cuhk.edu.hk/staff/huang-robin-hui/",
    rating: null,
    ratingCount: 0,
  },
  {
    slug: "ho-kwok-ming",
    name: "HO Kwok Ming",
    title: "Professor",
    faculty: "医学院",
    department: "麻醉及深切治疗学系",
    imageUrl:
      "https://www.med.cuhk.edu.hk/f/staff/5346/520p693/KMHo-AIC_20241009.jpg",
    profileUrl: "https://www.med.cuhk.edu.hk/staff/professor-kwok-ming-ho",
    rating: null,
    ratingCount: 0,
  },
  {
    slug: "chai-david",
    name: "CHAI David",
    title: "Associate Professor",
    faculty: "文学院",
    department: "哲学系",
    imageUrl: null,
    profileUrl: "https://www.phil.arts.cuhk.edu.hk/web/academic/chai-david/",
    rating: null,
    ratingCount: 0,
  },
];

export function filterProfessorDirectoryPreview(
  query: string | undefined,
  faculty: string | undefined,
) {
  const normalizedQuery = query?.trim().toLocaleLowerCase("en") ?? "";
  return professorDirectoryPreview.filter((professor) => {
    if (faculty && professor.faculty !== faculty) return false;
    if (!normalizedQuery) return true;
    return [
      professor.name,
      professor.title,
      professor.faculty,
      professor.department,
    ].some((value) => value.toLocaleLowerCase("en").includes(normalizedQuery));
  });
}
