const STORAGE_KEY = "course-list-navigation";

type CourseListNavigation = {
  detailHref: string;
  returnTo: string;
};

export function rememberCourseListNavigation(
  detailHref: string,
  returnTo: string,
) {
  const navigation: CourseListNavigation = { detailHref, returnTo };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(navigation));
}

export function consumeCourseListNavigation(
  detailHref: string,
  returnTo: string,
) {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  sessionStorage.removeItem(STORAGE_KEY);
  try {
    const navigation = JSON.parse(raw) as CourseListNavigation;
    return (
      navigation.detailHref === detailHref && navigation.returnTo === returnTo
    );
  } catch {
    return false;
  }
}

export function clearCourseListNavigation() {
  sessionStorage.removeItem(STORAGE_KEY);
}
