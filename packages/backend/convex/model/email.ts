/** Staff account mail only: invitations and password reset. Customers get SMS. */
export type Email = { to: string; subject: string; text: string };

const roleLabel = { owner: "Owner", staff: "Staff" } as const;

// Each link sits on its own line so no punctuation runs into it.

export function invitationEmail(to: string, role: keyof typeof roleLabel, link: string): Email {
  return {
    to,
    subject: "Your invitation to the Emblish Back Office",
    text: [
      `You've been invited to the Emblish Back Office as ${roleLabel[role]}.`,
      `Set up your account:\n${link}`,
      "This link expires in 7 days.",
    ].join("\n\n"),
  };
}

export function passwordResetEmail(to: string, link: string): Email {
  return {
    to,
    subject: "Reset your Emblish Back Office password",
    text: [
      "Someone asked to reset the password for your Emblish Back Office account.",
      `Set a new password:\n${link}`,
      "This link expires in 1 hour. If you didn't ask for this, you can ignore this email.",
    ].join("\n\n"),
  };
}

/** Sends one email through Resend's API. Call it from an action. */
export async function sendEmail({ to, subject, text }: Email) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Set RESEND_API_KEY and EMAIL_FROM on the Convex deployment to send email.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    throw new Error(`Resend refused the email (${response.status}): ${await response.text()}`);
  }
}
