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
 * - Email service
 * Public surface of the mail module, consumed by the controllers.
 */
export default {
  sendRegistrationEmail,
  sendTransactionEmail,
  failedTransactionEmail
};
