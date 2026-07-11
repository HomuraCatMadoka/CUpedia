type OtpEmail = {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
};

export async function sendOtpEmail({ email, otp, type }: OtpEmail) {
  if (process.env.E2E_TEST === "1") return;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

  const subject =
    type === "sign-in"
      ? "CUpedia 登录验证码"
      : type === "email-verification"
        ? "CUpedia 邮箱验证码"
        : "CUpedia 密码重置验证码";
  const text =
    type === "sign-in"
      ? `你的登录验证码是：${otp}，5 分钟内有效。`
      : type === "email-verification"
        ? `你的验证码是：${otp}，5 分钟内有效。`
        : `你的密码重置验证码是：${otp}，5 分钟内有效。`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_FROM, name: "CUpedia" },
      to: [{ email }],
      subject,
      textContent: text,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Brevo API error ${response.status}: ${await response.text()}`,
    );
  }
}
