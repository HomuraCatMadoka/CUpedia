import "server-only";

/* eslint-disable import/no-extraneous-dependencies -- local-only prototype reuses the repository's Playwright test tooling. */
import type {
  Browser,
  BrowserContext,
  Page,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from "@playwright/test";
import {
  parseCusisImportSnapshot,
  type CusisImportDataset,
  type CusisImportSnapshot,
} from "@/lib/cusis-import";

const CUSIS_LANDING_URL =
  "https://cusis.cuhk.edu.hk/psc/CSPRD/EMPLOYEE/HRMS/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL?";
const CURRENT_CLASSES_URL =
  "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SSR_STUDENT_FL.SSR_COMPONENT_FL.GBL?Page=SSR_VW_CLASS_FL";
const COURSE_HISTORY_URL =
  "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SSR_STUDENT_ACAD_REC_FL.SSR_CRSE_HIST_FL.GBL?Page=SSR_CRSE_HIST_FL";
const SHOPPING_CART_URL =
  "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SSR_STUDENT_FL.SSR_SHOP_CART_FL.GBL?Page=SSR_SHOP_CART_FL";
const ACADEMIC_REQUIREMENTS_URL =
  "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SAA_SS_DPR_ADB.GBL";
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

export const cusisPrototypeDatasets = [
  "current",
  "history",
  "cart",
  "requirements",
] as const;

export type CusisPrototypeDataset = CusisImportDataset;

type PrototypeSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  startedAt: string;
  timeout: ReturnType<typeof setTimeout>;
};

export type CusisPrototypeStatus = {
  phase: "idle" | "waiting-for-login" | "authenticated";
  startedAt: string | null;
  currentUrl: string | null;
  pageTitle: string | null;
  authenticated: boolean;
};

export type CusisCurrentCoursesPrototype = {
  schemaVersion: "cusis-course-codes-prototype.v0";
  capturedAt: string;
  dataset: CusisPrototypeDataset;
  sourceComponent:
    | "SSR_VW_CLASS_FL"
    | "SSR_CRSE_HIST_FL"
    | "SSR_SHOP_CART_FL"
    | "SAA_SS_DPR_ADB";
  courses: Array<{ courseCode: string }>;
  snapshot: CusisImportSnapshot;
  diagnostics: {
    frameCount: number;
    inspectedFrameUrls: string[];
    visibleTextCharacters: number;
    pageTitle: string;
    formCount: number;
    tableCount: number;
    statusSignal:
      | "not-authorized"
      | "no-courses"
      | "component-loaded"
      | "thin-page";
    network: {
      exchanges: NetworkExchange[];
      truncated: boolean;
      integrationBrokerSeen: boolean;
    };
  };
};

type NetworkExchange = {
  method: string;
  url: string;
  resourceType: string;
  queryFieldNames: string[];
  postFieldNames: string[];
  responseStatus: number | null;
  responseContentType: string | null;
};

let activeSession: PrototypeSession | null = null;

function assertLocalPrototype() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("CUSIS prototype is available only under pnpm dev");
  }
}

function looksAuthenticated(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "cusis.cuhk.edu.hk" &&
      parsed.pathname.includes("/EMPLOYEE/") &&
      !parsed.searchParams.has("cmd")
    );
  } catch {
    return false;
  }
}

function displayUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "unavailable";
  }
}

function fieldNamesFromRequest(request: PlaywrightRequest) {
  const queryFieldNames = (() => {
    try {
      return [...new Set(new URL(request.url()).searchParams.keys())].sort();
    } catch {
      return [];
    }
  })();
  const postData = request.postData();
  if (!postData) return { queryFieldNames, postFieldNames: [] };

  try {
    if (postData.trimStart().startsWith("{")) {
      const parsed = JSON.parse(postData) as unknown;
      return {
        queryFieldNames,
        postFieldNames:
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.keys(parsed).sort().slice(0, 200)
            : [],
      };
    }
    return {
      queryFieldNames,
      postFieldNames: [...new Set(new URLSearchParams(postData).keys())]
        .sort()
        .slice(0, 200),
    };
  } catch {
    return { queryFieldNames, postFieldNames: [] };
  }
}

function shouldRecordRequest(request: PlaywrightRequest) {
  try {
    const url = new URL(request.url());
    return (
      url.hostname === "cusis.cuhk.edu.hk" &&
      ["document", "xhr", "fetch"].includes(request.resourceType())
    );
  } catch {
    return false;
  }
}

async function closeSession(session: PrototypeSession) {
  clearTimeout(session.timeout);
  if (activeSession === session) activeSession = null;
  await session.context.close().catch(() => undefined);
  await session.browser.close().catch(() => undefined);
}

export async function startCusisPrototypeSession() {
  assertLocalPrototype();
  if (activeSession) await closeSession(activeSession);

  const { chromium } = await import("@playwright/test");
  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: false });
  } catch {
    browser = await chromium.launch({ headless: false });
  }

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  const startedAt = new Date().toISOString();
  const session = {
    browser,
    context,
    page,
    startedAt,
    timeout: setTimeout(() => {
      void closeSession(session);
    }, SESSION_TIMEOUT_MS),
  } satisfies PrototypeSession;

  activeSession = session;
  browser.on("disconnected", () => {
    clearTimeout(session.timeout);
    if (activeSession === session) activeSession = null;
  });

  await page.goto(CUSIS_LANDING_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  return getCusisPrototypeStatus();
}

export async function getCusisPrototypeStatus(): Promise<CusisPrototypeStatus> {
  assertLocalPrototype();
  const session = activeSession;
  if (!session || session.page.isClosed()) {
    return {
      phase: "idle",
      startedAt: null,
      currentUrl: null,
      pageTitle: null,
      authenticated: false,
    };
  }

  const currentUrl = session.page.url();
  const authenticated = looksAuthenticated(currentUrl);
  return {
    phase: authenticated ? "authenticated" : "waiting-for-login",
    startedAt: session.startedAt,
    currentUrl: displayUrl(currentUrl),
    pageTitle: await session.page.title().catch(() => null),
    authenticated,
  };
}

export async function readCusisCoursesPrototype(
  dataset: CusisPrototypeDataset,
  closeAfterRead = true,
): Promise<CusisCurrentCoursesPrototype> {
  assertLocalPrototype();
  const session = activeSession;
  if (!session || session.page.isClosed()) {
    throw new Error("No active CUSIS browser session");
  }
  if (!looksAuthenticated(session.page.url())) {
    throw new Error("CUSIS login has not completed yet");
  }

  let succeeded = false;
  try {
    const targets = {
      current: {
        url: CURRENT_CLASSES_URL,
        component: "SSR_VW_CLASS_FL" as const,
      },
      history: {
        url: COURSE_HISTORY_URL,
        component: "SSR_CRSE_HIST_FL" as const,
      },
      cart: {
        url: SHOPPING_CART_URL,
        component: "SSR_SHOP_CART_FL" as const,
      },
      requirements: {
        url: ACADEMIC_REQUIREMENTS_URL,
        component: "SAA_SS_DPR_ADB" as const,
      },
    } satisfies Record<
      CusisPrototypeDataset,
      {
        url: string;
        component: CusisCurrentCoursesPrototype["sourceComponent"];
      }
    >;
    const target = targets[dataset];
    const exchanges: NetworkExchange[] = [];
    const exchangeIndexes = new WeakMap<PlaywrightRequest, number>();
    const pendingResponses = new Set<Promise<void>>();
    const onRequest = (request: PlaywrightRequest) => {
      if (!shouldRecordRequest(request) || exchanges.length >= 50) return;
      const fields = fieldNamesFromRequest(request);
      exchangeIndexes.set(request, exchanges.length);
      exchanges.push({
        method: request.method(),
        url: displayUrl(request.url()),
        resourceType: request.resourceType(),
        queryFieldNames: fields.queryFieldNames,
        postFieldNames: fields.postFieldNames,
        responseStatus: null,
        responseContentType: null,
      });
    };
    const recordResponse = async (response: PlaywrightResponse) => {
      const index = exchangeIndexes.get(response.request());
      if (index === undefined) return;
      exchanges[index].responseStatus = response.status();
      exchanges[index].responseContentType =
        (await response.headerValue("content-type")) ?? null;
    };
    const onResponse = (response: PlaywrightResponse) => {
      const pending = recordResponse(response);
      pendingResponses.add(pending);
      void pending.finally(() => pendingResponses.delete(pending));
    };
    session.page.on("request", onRequest);
    session.page.on("response", onResponse);
    await session.page.goto(target.url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await session.page.waitForTimeout(2_000);
    await Promise.all([...pendingResponses]);
    session.page.off("request", onRequest);
    session.page.off("response", onResponse);

    const inspectedFrameUrls: string[] = [];
    const visibleTexts: string[] = [];
    let visibleTextCharacters = 0;
    let formCount = 0;
    let tableCount = 0;

    for (const frame of session.page.frames()) {
      inspectedFrameUrls.push(displayUrl(frame.url()));
      const text = await frame
        .locator("body")
        .innerText()
        .catch(() => "");
      visibleTexts.push(text);
      visibleTextCharacters += text.length;
      formCount += await frame.locator("form").count();
      tableCount += await frame.locator("table").count();
    }

    const combinedText = visibleTexts.join("\n");
    const statusSignal =
      /not authorized|access denied|无权|沒有權限|没有权限/i.test(combinedText)
        ? "not-authorized"
        : /no (courses|classes|data|results)|沒有記錄|没有记录|無記錄|无记录/i.test(
              combinedText,
            )
          ? "no-courses"
          : visibleTextCharacters > 200 || tableCount > 0
            ? "component-loaded"
            : "thin-page";

    const capturedAt = new Date().toISOString();
    const snapshot = parseCusisImportSnapshot({
      capturedAt,
      pages: { [dataset]: await session.page.content() },
    });
    const courseCodes = new Set([
      ...snapshot.personalCourseRecords.map(({ courseCode }) => courseCode),
      ...snapshot.requirementSnapshot.items.flatMap(
        ({ candidateCourseCodes }) => candidateCourseCodes,
      ),
    ]);
    const result: CusisCurrentCoursesPrototype = {
      schemaVersion: "cusis-course-codes-prototype.v0",
      capturedAt,
      dataset,
      sourceComponent: target.component,
      courses: [...courseCodes].sort().map((courseCode) => ({ courseCode })),
      snapshot,
      diagnostics: {
        frameCount: session.page.frames().length,
        inspectedFrameUrls,
        visibleTextCharacters,
        pageTitle: await session.page.title().catch(() => ""),
        formCount,
        tableCount,
        statusSignal,
        network: {
          exchanges,
          truncated: exchanges.length >= 50,
          integrationBrokerSeen: exchanges.some(({ url }) =>
            url.includes("/PSIGW/RESTListeningConnector/"),
          ),
        },
      },
    };
    succeeded = true;
    return result;
  } finally {
    if (closeAfterRead || !succeeded) await closeSession(session);
  }
}

export async function closeCusisPrototypeSession() {
  assertLocalPrototype();
  if (!activeSession) return;
  await closeSession(activeSession);
}
