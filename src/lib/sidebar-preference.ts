export const SIDEBAR_PREFERENCE_STORAGE_KEY = "cupedia:wiki-sidebar-shell:v1";
export const SIDEBAR_COLLAPSED_ATTRIBUTE = "data-wiki-sidebar-collapsed";

const LEGACY_SIDEBAR_COOKIE = "wiki-sidebar-collapsed";
const COLLAPSED = "collapsed";

export const SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT = `try{var k=${JSON.stringify(SIDEBAR_PREFERENCE_STORAGE_KEY)},v=localStorage.getItem(k),c=document.cookie.split(";").some(function(c){return c.trim()===${JSON.stringify(`${LEGACY_SIDEBAR_COOKIE}=${COLLAPSED}`)}});if(v===null&&c){v=${JSON.stringify(COLLAPSED)};localStorage.setItem(k,v)}document.documentElement.toggleAttribute(${JSON.stringify(SIDEBAR_COLLAPSED_ATTRIBUTE)},v===${JSON.stringify(COLLAPSED)});document.cookie=${JSON.stringify(`${LEGACY_SIDEBAR_COOKIE}=; path=/; max-age=0; samesite=lax`)}}catch{}`;
