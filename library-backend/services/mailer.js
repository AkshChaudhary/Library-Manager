// Development mailer: prints emails in the backend terminal.
// When you have an email account, replace the body with real sending.
async function sendMail({ to, subject, text }) {
  console.log('\n================ EMAIL (development) ================');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(text);
  console.log('=====================================================\n');
}

module.exports = { sendMail };