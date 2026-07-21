# 邮箱资格白名单经 before-hook 强制,而非 disableSignUp

> 已由 ADR 0015 取代。注册已改用原生 email/password signup，OTP 登录不再承担建号职责。

账号资格白名单(ADR 0001)必须在 email-OTP 的**服务端边界**强制。我们用 better-auth 的 `before` hook(`src/lib/auth.ts`)在发码(`/email-otp/send-verification-otp`)与验码(`/sign-in/email-otp`)两个端点调 `isAllowedEmail` 拦截,而**不**用 emailOTP 插件的 `disableSignUp: true`。

## Considered Options

- **`disableSignUp: true`**:最短的"硬化"写法,陌生邮箱验码直接报错。但会炸掉注册——`api/auth/register` 正是靠 `signInEmailOTP` 给新用户**自动建账号**完成注册的,禁用 signup 等于禁用注册。
- **before-hook 白名单(选定)**:在边界处拦两个端点,陌生邮箱在发码前即被拒;注册依赖的自动建账号能力保留。

## Consequences

- **不要**给 emailOTP 加 `disableSignUp`——它与注册流程互斥。
- **两道闸而非一道**:发码端拦截断掉"给校外邮箱发码";验码端拦截是纵深防御——纵使某条路径漏出 OTP,也建不了号。
- 登录/注册 page 里的 `isAllowedEmail` 仅作 UX 即时反馈,**不是**边界(可绕);真正边界是这个 hook。回归见 `tests/lib/email.test.ts` 的 `shouldRejectOtpRequest` 与 `e2e/otp-whitelist.spec.ts`。
