import nodemailer from "nodemailer";

/**
 * - Mail transporter
 * Shared nodemailer transporter configured for Gmail using OAuth2. All
 * credentials are read from the environment so nothing is hard-coded.
 */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: process.env.EMAIL_USER,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_API_REFRESH_TOKEN,
  },
});

// Verify the connection configuration
// Runs once at startup so credentials problems surface immediately rather
// than on the first real send.
transporter.verify((error) => {
  if (error) {
    console.error("Error connecting to email server:", error);
  } else {
    console.log("Email server is ready to send messages");
  }
});

/**
 * - Send a single email
 * Low-level helper used by the higher-level templates below. Send failures
 * are logged rather than thrown so a flaky mail server never fails a
 * transaction or a registration.
 *
 * @param to - recipient email address
 * @param subject - email subject line
 * @param text - plain-text body (fallback for clients without HTML)
 * @param html - HTML body
 * @returns {Promise<void>} - resolves once the send attempt has finished
 * @throws {never} - send failures are logged, never thrown, so a flaky mail
 * server can never fail the transaction or registration that triggered it
 */
const sendEmail = async (
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<void> => {
  try {
    const info = await transporter.sendMail({
      from: `"Your Name" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

/**
 * - Send the registration welcome email
 * Builds the welcome template and delegates to {@link sendEmail}.
 *
 * @param userEmail - the newly registered user's email address
 * @param userName - the newly registered user's name
 * @returns {Promise<void>} - resolves once the send attempt has finished
 */
async function sendRegistrationEmail(userEmail: string, userName: string) {
  // build the welcome message for the new account
  const subject = "Welcome to Our App";
  const text = `Hello ${userName}, welcome to our app!`;
  const html = `<p>Hello ${userName}, welcome to our app!</p>`;
  await sendEmail(userEmail, subject, text, html);
}

/**
 * - Send the transaction confirmation email
 * Builds the transfer template and delegates to {@link sendEmail}.
 *
 * @param userEmail - the sender's email address
 * @param userName - the sender's name
 * @param amount - the amount that was transferred
 * @param toAccount - the account the money arrived in
 * @returns {Promise<void>} - resolves once the send attempt has finished
 */
async function sendTransactionEmail(
  userEmail: string,
  userName: string,
  amount: number,
  toAccount: string,
) {
  // build the confirmation message for the completed transfer
  const subject = "Transaction Completed";
  const text = `Hello ${userName}, your transaction of ${amount} to account ${toAccount} was completed successfully.`;
  const html = `<p>Hello ${userName}, your transaction of ${amount} to account ${toAccount} was completed successfully.</p>`;
  await sendEmail(userEmail, subject, text, html);
}
async function failedTransactionEmail(userEmail: string, userName: string) {
  const subject = "Transaction Failed";
  const text = `Hello ${userName}, your transaction failed.`;
  const html = `<p>Hello ${userName}, your transaction failed.</p>`;
  await sendEmail(userEmail, subject, text, html);
}

/**
 * - Send the login-lockout email
 * Tells the owner their email is paused after repeated failed sign-ins, so a
 * real person finds out that someone is guessing their password.
 *
 * @param userEmail - the owner's email address
 * @param userName - the owner's name
 * @param minutes - how long the pause lasts
 */
async function sendLockoutEmail(
  userEmail: string,
  userName: string,
  minutes: number,
) {
  const subject = "Sign-in paused after failed attempts";
  const text = `Hello ${userName}, there were too many failed sign-in attempts on your account, so signing in from this email is paused for ${minutes} minutes. If this was not you, someone may be trying your password - consider changing it once the pause ends.`;
  const html = `<p>Hello ${userName},</p><p>There were too many failed sign-in attempts on your account, so signing in with this email is paused for <strong>${minutes} minutes</strong>.</p><p>If this was not you, someone may be trying your password. Consider changing it once the pause ends.</p>`;
  await sendEmail(userEmail, subject, text, html);
}

/**
 * - Send the new-device sign-in alert
 * Sent after a successful sign-in from a device the account has not used
 * before.
 *
 * @param userEmail - the owner's email address
 * @param userName - the owner's name
 * @param device - the browser/OS description of the new device
 * @param when - when the sign-in happened
 */
async function sendNewDeviceEmail(
  userEmail: string,
  userName: string,
  device: string,
  when: Date,
) {
  const subject = "New sign-in to your account";
  const line = `A new sign-in to your account was made from ${device} on ${when.toUTCString()}. If this was you, no action is needed. If not, change your password and sign out of all devices.`;
  await sendEmail(
    userEmail,
    subject,
    `Hello ${userName}, ${line}`,
    `<p>Hello ${userName},</p><p>${line}</p>`,
  );
}

/**
 * - Send a large-transfer confirmation code
 * The owner of the sending account receives a short code that must be typed
 * before a transfer above the step-up threshold can complete.
 *
 * @param userEmail - the account owner's email address
 * @param userName - the account owner's name
 * @param code - the short numeric code
 * @param amount - the amount being confirmed, already formatted with its currency
 * @param minutes - how long the code stays valid
 */
async function sendStepUpCodeEmail(
  userEmail: string,
  userName: string,
  code: string,
  amount: string,
  minutes: number,
) {
  const subject = `Confirm your transfer of ${amount}`;
  const text = `Hello ${userName}, use the code ${code} to confirm your transfer of ${amount}. It expires in ${minutes} minutes. If you did not start this transfer, do not share this code and contact support.`;
  const html = `<p>Hello ${userName},</p><p>Use this code to confirm your transfer of <strong>${amount}</strong>:</p><p style="font-size:24px;letter-spacing:4px;font-weight:bold">${code}</p><p>It expires in ${minutes} minutes. If you did not start this transfer, do not share this code and contact support.</p>`;
  await sendEmail(userEmail, subject, text, html);
}

/**
 * - Email service
 * Public surface of the mail module, consumed by the controllers.
 */
export default {
  sendRegistrationEmail,
  sendTransactionEmail,
  failedTransactionEmail,
  sendLockoutEmail,
  sendNewDeviceEmail,
  sendStepUpCodeEmail,
};
