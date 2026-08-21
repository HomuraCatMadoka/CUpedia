# CUSIS data integration feasibility research

Date: 2026-08-21

Scope: read-only import of a student's own CUSIS data into CUpedia

Method: public, first-party CUHK/CUSIS material and Oracle PeopleSoft documentation, plus one user-authorized, read-only authenticated UI spot-check. The user entered their own CUHK credentials and MFA directly in the CUHK login page. No credentials, session values, student identifiers, grades, course selections, or response payloads were recorded; no write operation or endpoint guessing was attempted.

## Executive conclusion

**The four requested data sets exist in CUSIS, but public evidence does not establish that CUHK exposes a supported student-facing API that CUpedia may call.** CUSIS is built on Oracle PeopleSoft Campus Solutions, and Oracle delivers web-service machinery that can technically retrieve enrolment and shopping-cart data. Whether CUHK has deployed those services, their actual URLs, allowed them for ordinary student identities, or authorized third-party use is unknown.

Therefore:

1. **Technically promising:** current-term enrolments and shopping cart. Oracle documents delivered Enrollment Web Services and shopping-cart service operations for these areas.
2. **Technically visible but API-unverified:** course history and academic requirements. CUHK/Oracle document authenticated UI pages, not a CUHK external API contract.
3. **Operationally blocked pending authorization:** a production "one-click" integration should first obtain approval from the CUSIS system owner/RES and ITSC, including a read-only integration contract and data-steward approval. CUHK explicitly prohibits using CUHK IDs/OnePass passwords for another system's authentication without prior application, and requires approval and controls for systems handling personal data.
4. **Do not build a credential proxy:** CUpedia should never ask for or store a CUHK password, Duo response, or reusable CUSIS session token. Even with user consent, that approach conflicts with CUHK's published account rules and creates a high-impact credential/session theft surface.
5. **Graduation analysis must be advisory:** CUHK says its Academic Advisement report is only a general reference, and separately lists programmes whose requirements CUSIS cannot model accurately. CUpedia must not present imported output as a definitive graduation audit.

## What is verified about CUSIS

- CUHK states that CUSIS is based on Oracle PeopleSoft Campus Solutions. The 2020 upgrade introduced CUHK Login single sign-on, a mobile-responsive interface, and 2FA-related changes. Access is via MyCUHK/CUHK Login, not a public API portal. ([CUHK: About CUSIS](https://www.cuhk.edu.hk/cusis/about_cusis.htm), [ITSC: MyCUHK and CUSIS Upgrade Project](https://www.itsc.cuhk.edu.hk/project/mycuhk-and-cusis-upgrade-project/), [ITSC: CUSIS service page](https://www.itsc.cuhk.edu.hk/all-it/university-administrative-systems/cusis/))
- CUHK's student materials expose course enrolment, class schedules, grades, unofficial transcripts, and three academic-advisement report types through the logged-in UI. ([CUSIS training catalogue](https://www.cuhk.edu.hk/cusis/training.html), [RES: CUSIS functions](https://www.res.cuhk.edu.hk/cusis/))
- A public PeopleSoft expiry page for MyCUHK states that PeopleSoft connections expire after 30 minutes of inactivity. This demonstrates a stateful, time-limited browser session, but does not identify the authentication mechanism for any web service. ([MyCUHK PeopleSoft session-expired page](https://portal.cuhk.edu.hk/psc/EPPUB/CUHK/ENTP/?cmd=expire))
- A read-only request to `https://cusis.cuhk.edu.hk/` from the research environment on 2026-08-21 returned `403 Forbidden` and an HTTP-only secure F5 load-balancer cookie. This single observation neither proves nor disproves authenticated API availability; it only shows that the bare root is not a useful anonymous discovery endpoint from this environment.

## Authenticated UI spot-check (2026-08-21)

A user-authorized browser session confirmed the following without recording any personal academic content:

- Opening CUSIS redirected to CUHK ADFS with a SAML request. After the user completed login and MFA directly with CUHK, CUSIS landed on the PeopleSoft Fluid component `NUI_FRAMEWORK.PT_LANDINGPAGE.GBL` under `/psc/CSPRD/EMPLOYEE/HRMS/c/`.
- Homepage tiles included **Manage Classes**, **Academic Records**, and **Applications**. Navigation used PeopleSoft component URLs such as `NUI_FRAMEWORK.PT_AGSTARTPAGE_NUI.GBL` with navigation-collection parameters, not a visible versioned JSON API.
- The loaded page contained a POST form targeting the current `.GBL` component and the standard PeopleSoft interaction-control fields (`ICAction`, `ICStateNum`, `ICSID`, and related `IC*` fields). This is direct evidence that at least the inspected shell uses stateful PeopleSoft component transactions. No hidden-field values were retained.
- The Applications collection exposed links to additional CUHK-specific `.GBL` components. This further supports a server-rendered/component-transaction model, although it does not rule out separate Integration Broker services.
- Under this particular account/session, **Manage Classes** returned PeopleSoft's “Navigation Collection not found” error (which may mean the collection is invalid for the current deployment or unavailable to the account), while **Academic Records** opened an empty navigation collection. Therefore this session did not expose the requested cart, enrolment, history, or advisement views, and no response schema for those data sets was verified.

Interpretation: the spot-check strengthens the warning that browser UI calls are not automatically a supported API. It does **not** disprove the Oracle service capabilities described below, nor establish whether CUHK has enabled them for currently enrolled students. A sanctioned test account with the relevant student role and proper network inspection is still required.

### Loaded JavaScript bundle inspection

The authenticated landing page loaded nine PeopleSoft JavaScript assets totaling approximately 994 KB, including `PT_AJAX_NET_MIN_1.js`, `PT_COMMON_FMODE_MIN_1.js`, and page/navigation scripts. The assets were fetched as static code with ordinary browser headers; no session credential was copied from the browser and the downloaded temporary files were not added to the repository.

The code establishes two distinct mechanisms:

1. The generic PeopleSoft runtime explicitly recognizes URLs containing `/PSIGW/RESTListeningConnector/`, which is the Integration Broker REST listener path. This confirms that the deployed front-end runtime knows how to handle PeopleSoft REST URLs.
2. The observed component interaction path is still stateful PIA AJAX: `XMLHttpRequest` posts URL-encoded form state to the current component action, adds `ICAJAX=1`, carries the `IC*` interaction fields, and enables credentials for asynchronous requests. The REST-listener branch found in this bundle redirects the top-level page to a supplied REST URL; it is not itself a call to a course-data service.

A case-insensitive search of all nine loaded assets found no occurrence of `SSR_GET_ENROLLMENT`, `SCC_SC_GETCART`, `SCC_SC_GETITEM`, `SSR_CRSE_HIST_FL`, `SSR_TERM_STA1_FL`, or `SSR_TERM_STA3_FL`. Therefore the landing-page bundle proves **generic REST capability**, but reveals no enabled endpoint for the four requested data sets. Feature-specific code may be loaded only after entering the relevant component; that could not be tested with this account because the corresponding navigation collections were unavailable.

## Feasibility by requested data set

| Requested data                                 | Verified data/UI availability                                                                                                                                                                              | Verified service capability                                                                                                                                                                                                              | CUHK API availability                                                                                  | Assessment                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Previously taken courses                       | Oracle's Fluid **Course History** component `SSR_CRSE_HIST_FL` shows courses taken, planned, transferred, and in progress. CUHK also offers grades and unofficial transcript functions.                    | No public first-party source found for a CUHK course-history API. The component name is a PeopleSoft page definition, not an API.                                                                                                        | **Unknown**                                                                                            | Import is possible in principle from an authorized institutional service or a user-side export; scraping internal Fluid traffic would be brittle and unsupported. |
| Shopping cart                                  | Oracle's Fluid **Shopping Cart** component `SSR_TERM_STA3_FL` lets a student select, delete, validate, and change class options.                                                                           | Oracle documents the generic `SCC_SHOPPING_CART` service, including synchronous `SCC_SC_GETCART` and `SCC_SC_GETITEM` operations, and explicitly uses an enrolment-cart example.                                                         | **Unknown**: no CUHK deployment URL, WSDL/WADL/OpenAPI description, or permission statement was found. | Technically plausible, but do not mistake delivered Oracle capability for an enabled CUHK API. Request read-only access to the cart operation from CUHK.          |
| Graduation requirements / courses still needed | CUHK's **My Academic Requirements** report shows satisfied/unsatisfied requirements and, for an unsatisfied item, courses that may satisfy it. The in-progress report includes current registered courses. | No public first-party source found for an external academic-advisement API.                                                                                                                                                              | **Unknown**                                                                                            | Data can inform planning, but results require warnings and links to the Student Handbook/department because CUSIS is not authoritative for every programme.       |
| Current-term enrolled courses                  | Oracle's **View My Classes** component `SSR_TERM_STA1_FL` shows enrolled, waitlisted, and dropped classes by term.                                                                                         | Oracle documents Enrollment Web Services (EWS). The delivered `SSR_ENROLLMENT` / `SSR_GET_ENROLLMENT` operation retrieves a student's StudyList details; Oracle also says Campus Mobile receives class-schedule information through EWS. | **Unknown**                                                                                            | This is the strongest candidate for a sanctioned read-only API, subject to CUHK deployment and authorization.                                                     |

Sources for the table: [Oracle: Managing Academic Records in Fluid UI](https://docs.oracle.com/en/applications/peoplesoft/campus-solutions/9.2.038/campus-self-service/managing-academic-records-using-peoplesoft-fluid-user-interface.html), [Oracle: Managing Classes in Fluid UI](https://docs.oracle.com/en/applications/peoplesoft/campus-solutions/9.2.038/campus-self-service/managing-classes-using-peoplesoft-fluid-user-interface.html), [Oracle: Shopping Cart Framework](https://docs.oracle.com/en/applications/peoplesoft/campus-solutions/9.2.038/campus-community-fundamentals/understanding-shopping-cart-framework.html), [Oracle: `SCC_SC_GETITEM`](https://docs.oracle.com/en/applications/peoplesoft/campus-solutions/9.2.038/campus-community-fundamentals/scc-sc-getitem.html), [Oracle: Enrollment Web Services](https://docs.oracle.com/en/applications/peoplesoft/campus-solutions/9.2.038/student-records/understanding-enrollment-web-services.html), [Oracle: delivered `SSR_GET_ENROLLMENT` behavior](https://docs.oracle.com/cd/E29389_01/psft/acrobat/hrcs90lsfn-b0312.pdf), [Oracle: Campus Mobile class schedule via EWS](https://docs.oracle.com/cd/_F11339_01/cs92pbr11/eng/cs/lsss/task_UsingClassSchedule-4c7ffe.html), [CUHK: Review Academic Advisement Report](https://www.cuhk.edu.hk/cusis/howto/review-acad-advisement.pdf).

### Important distinction: UI network calls are not automatically a public API

A logged-in PeopleSoft UI must exchange data with a server, but that exchange may be a stateful PeopleSoft component request rather than a stable REST resource. Oracle's component names (`SSR_*_FL`) identify pages. They do not promise a versioned external contract, and CUHK may customize them.

Oracle also provides Integration Broker and delivered Enrollment Web Services, but an institution must deploy and secure service operations. Oracle documents that provider REST operations may require Basic authentication, OAuth2, a PeopleSoft token, SSL, and permission-list authorization; requests without the required security are rejected. Permission defaults and grants are controlled by the PeopleSoft operator. ([Oracle: Securing Provider REST Service Operations](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/securing-provider-rest-service-operations.html), [Oracle: Setting Web Services Permissions](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/security-administration/setting-web-services-permissions.html))

Consequently, discovering an internal request in DevTools would establish only that the current UI can make that request in the current release. It would not establish that:

- the request is intended for third parties;
- a CUpedia server may replay it;
- the student's browser SSO session authorizes Integration Broker;
- cross-origin credentialed requests are allowed;
- the response schema or URL will remain stable; or
- CUHK permits automated access at the proposed rate.

## Authentication and session constraints

### Verified

- Students are directed to enter CUSIS through MyCUHK/CUHK Login. The 2020 upgrade describes CUHK Login as single sign-on and includes 2FA among the new features. ([CUHK CUSIS home](https://www.cuhk.edu.hk/cusis/), [ITSC upgrade project](https://www.itsc.cuhk.edu.hk/project/mycuhk-and-cusis-upgrade-project/))
- CUHK enforces 2FA protection for University accounts; the exact step-up behavior for an ordinary student's CUSIS session was not tested here. ([ITSC 2FA policy](https://www.itsc.cuhk.edu.hk/project/2fa-policy-for-all-university-accounts/))
- The public PeopleSoft page reports a 30-minute inactivity expiry for the browser connection. ([session-expired page](https://portal.cuhk.edu.hk/psc/EPPUB/CUHK/ENTP/?cmd=expire))
- PeopleSoft web-service access is separately governed by service-operation authentication and permission lists. A browser session cookie should not be assumed to be a supported API credential. ([Oracle REST security](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/securing-provider-rest-service-operations.html))

### Likely inference

- A normal CUpedia web backend cannot simply "reuse" the student's already logged-in CUSIS browser state. A sanctioned OAuth/Integration Broker flow, a same-browser client integration explicitly allowed by CUHK, or a user-produced export would be needed.
- If a browser extension or injected client reads internal Fluid responses, it will be tightly coupled to CUHK's PeopleSoft customization, navigation state, CSRF/session controls, and periodic upgrades. Maintenance cost and account-lockout risk should be expected.

### Unknown and requiring an authorized logged-in discovery session

- Actual CUSIS PeopleTools/Campus Solutions patch level and CUHK customizations.
- Whether `SSR_GET_ENROLLMENT`, `SCC_SC_GETCART`, or any academic-record/advisement service is activated in CUHK production.
- Exact service base URL, resource templates, request/response schemas, CORS policy, CSRF requirements, cookie attributes, and rate limits.
- Whether student roles have permission to invoke any Integration Broker operation directly.
- Whether CUHK offers an OAuth authorization-code flow for third-party student-consented access.
- Whether an approved export endpoint already exists behind the UI.

## Graduation-requirement accuracy limitation

CUHK's own guide says the Academic Advisement report is only a **general reference**. It can show whether a requirement is satisfied, courses already counted, and courses that may satisfy an unsatisfied requirement. Its in-progress variant also includes current-term registrations. ([CUHK guide](https://www.cuhk.edu.hk/cusis/howto/review-acad-advisement.pdf))

However, RES's January 2026 notice says CUSIS may not accurately handle programme-specific variables, second degrees/majors/minors, substitutions, equivalences, exemptions, and some zero-unit requirements. It directs students to the online Student Handbook and the relevant programme/RES when there is a discrepancy. ([RES: Programmes with Special Requirements that cannot be set in CUSIS](https://www.res.cuhk.edu.hk/wp-content/uploads/undergraduate-students/Pgms-with-Special-Requirements-cannot-be-set-in-CUSIS_Jan-2026.pdf))

Product consequence: CUpedia may say "CUSIS currently reports these items as outstanding" and analyze scenarios, but must not say "you must take these courses to graduate." It should preserve the report's as-of timestamp, programme/plan/requirement term, satisfaction status, and source wording, and display the CUHK limitation next to any recommendation.

## Security, policy, and data-governance constraints

CUHK's CADS policy is decisive for architecture:

- use of a CUHK ID/email and OnePass password for another system's authentication is strictly prohibited without prior ITSC application;
- passwords must not be stored, even temporarily;
- a registered system must implement transport security and authorization, publish a Personal Information Collection statement, and provide a support/reporting channel;
- systems handling personal data must comply with CUHK's Handling Personal Data Policy and obtain endorsement from the relevant data steward;
- a CADS application needs the system owner's application, department/unit-head endorsement, annual renewal, and ITSC vulnerability assessment. ([ITSC: CADS policy and application requirements](https://www.itsc.cuhk.edu.hk/all-it/information-security/centralized-authentication-and-directory-service/))

CUHK's network policy further forbids password disclosure, unauthorized access or data collection, bypassing security mechanisms, and unauthorized connections; it also warns against excessive resource use. ([ITSC: Computer Network Policies and Guidelines](https://www.itsc.cuhk.edu.hk/it-policies/net-guide-use/))

These policies do not by themselves answer whether a student-controlled local exporter is allowed. They do mean that user consent alone is not enough to justify a CUpedia-operated credential/session relay. Obtain written confirmation from ITSC, the CUSIS system owner, RES, and the relevant personal-data steward before production automation.

Minimum controls if approval is granted:

- read-only scopes and operations; technically block enrol/drop/cart writes;
- authorization-code/SSO redirect or another CUHK-approved mechanism, never an embedded CUHK login form;
- no passwords, Duo codes, session cookies, PS tokens, or refresh tokens in logs;
- collect only fields needed for the selected analysis; exclude grades by default if course identity/status is sufficient;
- explicit per-import consent and a clear preview before saving;
- encrypted transit and storage, short retention, user export/deletion, audit trail, and source/as-of metadata;
- rate limits, backoff, maintenance-window handling, schema-version checks, and an immediate kill switch;
- treat requirement results as advisory and surface known CUSIS gaps.

## Recommended implementation path

### Path A — sanctioned read-only integration (recommended)

Ask ITSC/CUSIS/RES for a formal integration meeting and provide a field-level data request. Specifically ask whether CUHK can expose or authorize:

1. `SSR_GET_ENROLLMENT` or an equivalent read-only StudyList endpoint for current terms;
2. a read-only enrolment-cart endpoint equivalent to `SCC_SC_GETCART` / `SCC_SC_GETITEM`;
3. a course-history endpoint matching `SSR_CRSE_HIST_FL` output;
4. an academic-advisement report endpoint or structured export, including report timestamp and limitations;
5. an authorization-code flow with student consent, documented scopes, schema, rate limits, support ownership, and test environment.

Do not ask for broad database access. Keep the first pilot to current-term enrolments because it has the clearest delivered Oracle service precedent and the lowest need for sensitive grade data.

### Path B — user-side export/import, only after CUHK confirms it is permitted

If no external API will be offered, ask CUHK to approve a browser-local exporter or, preferably, add an official structured export. The exporter should run only after the student logs in directly to CUHK, show exactly what will leave the browser, remove credentials/session material, and send a normalized read-only snapshot to CUpedia. This avoids CUpedia handling CUHK credentials but remains dependent on CUHK permission and UI stability.

### Path C — manual import fallback

Allow a student to upload or paste an official CUSIS-generated report/export and parse it locally or server-side with explicit consent. This is less "one click" but is easier to make auditable and does not require session automation. Confirm available export formats with RES; the public guides reviewed here demonstrate on-screen reports but do not document a structured CSV/JSON export.

## Proposed authorized discovery checklist

The following work should occur only with a volunteer student's informed consent and written CUHK approval, using a test account/environment if available:

1. Record product/version headers and the four UI navigation paths without capturing unrelated personal data.
2. In browser DevTools, filter to XHR/fetch while opening each page; record method, path template, content type, status, response shape, required headers, and whether the request is read-only.
3. Classify each request as a Fluid component transaction, Integration Broker SOAP/REST operation, report generation, or static page.
4. Verify that replay with no session fails and that only the owning student can retrieve their record. Do not attempt another identity or privilege boundary.
5. Verify CSRF protection, session expiry, CORS behavior, response caching, redaction, rate limits, and whether grades/IDs appear unnecessarily.
6. Compare returned current enrolments, cart, history, and advisement output with the visible UI; document status semantics such as enrolled/waitlisted/dropped/in-progress/transferred.
7. Send the discovered interface and proposed load profile to CUHK for explicit production approval. Do not ship against an undocumented internal endpoint merely because it works.

## Decision

**Go for an approval/discovery spike; no-go for direct production implementation today.** The platform clearly contains the desired data and Oracle supplies relevant integration primitives, so the idea is technically credible. The missing facts are institutional deployment, authorization, and a supported contract—not whether the data exists.

The first concrete deliverable should be a one-page request to CUHK specifying the four read-only datasets, the minimal fields, the desired authorization-code consent flow, retention/deletion policy, expected call volume, and the advisory-only treatment of graduation requirements.
