# Nodemailer Integration Guide (OAuth2)

This guide provides step-by-step instructions for setting up and using Nodemailer in a Node.js application with OAuth2 authentication using a `ClientID` and `ClientSecret`, along with generating a refresh token using the Google OAuth 2.0 Playground.

---

## 📋 Prerequisites

* **Node.js** installed on your machine.
* **Google Account** to generate OAuth2 credentials.
* **Google API Console** access to create and manage credentials.

---

## 🔑 Getting OAuth2 Credentials

### 1. Go to the Google API Console
* Navigate to the [Google API Console](https://console.developers.google.com/).
* Create a new project or select an existing one from the top dropdown.

### 2. Enable Gmail API
* Go to the **Library** section in the left sidebar.
* Search for **Gmail API** and click **Enable**.

### 3. Create OAuth2 Credentials
* Navigate to the **Credentials** section.
* Click on **+ Create Credentials** and choose **OAuth 2.0 Client IDs**.
* Set the application type to **Web application**.
* Under **Authorized redirect URIs**, add the following URLs:
  * `http://localhost`
  * `https://developers.google.com/oauthplayground` *(or your application’s deployed URL)*
* Click **Create** to receive your **ClientID** and **ClientSecret**.

---

## 🔄 Generating the Refresh Token Using OAuth 2.0 Playground

### 1. Access OAuth 2.0 Playground
* Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) in your web browser.

### 2. Configure Settings
* Click on the **Gear icon (Settings)** in the top-right corner.
* Under **OAuth 2.0 endpoints**, select **Use your own OAuth credentials**.
* Enter your **ClientID** and **ClientSecret** obtained from the Google Cloud Console.
* Set the **Access type** to **Offline** to ensure you obtain a long-lived refresh token.

### 3. Select Scopes
* In **Step 1** on the left panel, scroll down or input the appropriate scope for your application. 
* For Gmail access, select or input: `https://mail.google.com/`

### 4. Authorize APIs
* Click on **Authorize APIs**. 
* You will be redirected to a Google login page. Log in and grant the requested permissions to your application.

### 5. Exchange Authorization Code for Tokens
* Once redirected back to the OAuth Playground (**Step 2**), click on **Exchange authorization code for tokens**.
* This tool will automatically generate an access token and a refresh token payload.

### 6. Copy Refresh Token
* Locate the **Refresh token** field under the step 2 response.
* Copy this value to use securely inside your environment variables.

---

## 📦 Installation

Initialize your project and install the necessary dependencies in your application root directory:

```bash
# Initialize a Node.js Project
npm init -y

# Install Nodemailer and dotenv
npm install nodemailer dotenv
```

---

## 🛠️ Configuration

### 1. Create a `.env` File
Create a `.env` file in the root of your project to securely store your OAuth2 credentials. Replace the placeholder values with your real keys:

```env
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REFRESH_TOKEN=your-refresh-token
EMAIL_USER=your-email@example.com
```

### 2. Set Up Nodemailer with OAuth2
Create a new file named `email.js` to configure your connection transporter:

```javascript
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

module.exports = transporter;
```

### 3. Create a Function to Send Emails
Append the following execution handler to the bottom of your `email.js` file:

```javascript
// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Your Name" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

module.exports = sendEmail;
```

### 4. Execute the Email Function
Import your utility module inside your main application file (e.g., `app.js`) to dispatch emails dynamically:

```javascript
const sendEmail = require('./email');

// Example usage
sendEmail(
  'recipient@example.com',
  'Test Email Subject',
  'This is a test email sent with Nodemailer using OAuth2.',
  '<p>This is a test email sent with <b>Nodemailer</b> using OAuth2.</p>'
);
```

---

## 🚀 Running the Application

To execute your mail dispatch worker, trigger your node routine:

```bash
node app.js
```

If everything is configured correctly, your console will print a confirmation message validating that the email has left the server layout successfully.

---

## 🔍 Troubleshooting

* **Invalid Credentials Error:** Ensure that your `ClientID`, `ClientSecret`, and `RefreshToken` contain exact matches without whitespace and belong to the specific Google account bound to `EMAIL_USER`.
* **Email Not Sent:** Confirm that your custom OAuth credentials setup included full scope permissions for `https://mail.google.com/` and that the application status in the Google Console is set to "In Production" or your account is explicitly listed as a test user.

---

## 📚 References

* [Nodemailer Documentation](https://nodemailer.com)
* [Google OAuth2 Documentation](https://google.com)
* [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
